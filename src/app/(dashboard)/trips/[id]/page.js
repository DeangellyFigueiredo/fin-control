'use client';

import { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBRL, formatDate, formatDateShort, todayISO } from '@/lib/utils';
import { resumoViagem, faseDe, TRIP_METHODS, diaDe } from '@/lib/trips';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import TripForm from '@/components/TripForm';
import TripEntryForm from '@/components/TripEntryForm';
import TripMembers from '@/components/TripMembers';
import { useConfirm } from '@/components/ConfirmProvider';

const FASES = [
  { id: 'preparacao', label: 'Preparação', cor: 'var(--accent)' },
  { id: 'destino', label: 'No destino', cor: 'var(--warning)' },
  { id: 'depois', label: 'Depois da volta', cor: 'var(--text-muted)' },
];

function Destaque({ r }) {
  if (r.status === 'durante') {
    const h = r.hoje;
    return (
      <div className="stat-cards">
        <div className="card stat-card balance">
          <div className="stat-label">Ainda pode gastar hoje</div>
          <div className={`stat-value ${h.resta >= 0 ? 'positive' : 'negative'}`}>{formatBRL(h.resta)}</div>
          <div className="stat-change">limite do dia {formatBRL(h.limite)} · gasto hoje {formatBRL(h.gasto)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Dia da viagem</div>
          <div className="stat-value">{h.diaDaViagem} de {r.totalDias}</div>
          <div className="stat-change">
            {h.diasRestantes === 1 ? 'último dia' : `faltam ${h.diasRestantes} dias, contando hoje`}
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Sobra do orçamento</div>
          <div className={`stat-value ${r.saldo >= 0 ? 'positive' : 'negative'}`}>{formatBRL(r.saldo)}</div>
          <div className="stat-change">planejado era {formatBRL(r.limitePlanejado)} por dia</div>
        </div>
      </div>
    );
  }

  if (r.status === 'antes') {
    return (
      <div className="stat-cards">
        <div className="card stat-card balance">
          <div className="stat-label">Para gastar por dia</div>
          <div className="stat-value">{formatBRL(r.limitePlanejado)}</div>
          <div className="stat-change">{formatBRL(r.destinoOrcado)} para os {r.totalDias} dias no destino</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Começa em</div>
          <div className="stat-value">{r.diasAteIda} {r.diasAteIda === 1 ? 'dia' : 'dias'}</div>
          <div className="stat-change">{r.totalDias} {r.totalDias === 1 ? 'dia' : 'dias'} de viagem</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Já gasto na preparação</div>
          <div className="stat-value">{formatBRL(r.gasto.preparacao)}</div>
          <div className="stat-change">
            {r.reservaPreparacao > 0 ? `de ${formatBRL(r.reservaPreparacao)} reservados` : 'sem reserva separada'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stat-cards">
      <div className="card stat-card balance">
        <div className="stat-label">A viagem custou</div>
        <div className="stat-value">{formatBRL(r.gasto.total)}</div>
        <div className="stat-change">de {formatBRL(r.orcamento)} planejados</div>
      </div>
      <div className="card stat-card">
        <div className="stat-label">Média por dia no destino</div>
        <div className="stat-value">{formatBRL(r.gasto.destino / r.totalDias)}</div>
        <div className="stat-change">planejado era {formatBRL(r.limitePlanejado)}</div>
      </div>
      <div className="card stat-card">
        <div className="stat-label">{r.saldo >= 0 ? 'Sobrou' : 'Passou do orçamento'}</div>
        <div className={`stat-value ${r.saldo >= 0 ? 'positive' : 'negative'}`}>{formatBRL(Math.abs(r.saldo))}</div>
      </div>
    </div>
  );
}

/** Barra do orçamento dividida pelas fases, para ver onde o dinheiro foi. */
function BarraDoOrcamento({ r }) {
  const base = Math.max(r.orcamento, r.gasto.total) || 1;
  return (
    <div className="card trip-budget">
      <div className="trip-budget-bar" role="img" aria-label={`Gasto ${formatBRL(r.gasto.total)} de ${formatBRL(r.orcamento)}`}>
        {FASES.map(f => {
          const v = Math.max(r.gasto[f.id], 0);
          return v > 0 ? <div key={f.id} style={{ width: `${(v / base) * 100}%`, background: f.cor }} /> : null;
        })}
      </div>
      <div className="trip-budget-legend">
        {FASES.filter(f => r.gasto[f.id] !== 0).map(f => (
          <span key={f.id}><i style={{ background: f.cor }} /> {f.label} {formatBRL(r.gasto[f.id])}</span>
        ))}
        <span className="trip-budget-total">{formatBRL(r.gasto.total)} de {formatBRL(r.orcamento)}</span>
      </div>
    </div>
  );
}

export default function TripPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const confirmar = useConfirm();

  const [data, setData] = useState(null);
  const [erro, setErro] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [lancando, setLancando] = useState(false);
  const [editandoGasto, setEditandoGasto] = useState(null);
  const [editandoViagem, setEditandoViagem] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/trips/${id}`);
    if (!res.ok) {
      setErro(res.status === 404 ? 'Viagem não encontrada' : 'Erro ao carregar a viagem');
      return;
    }
    setData(await res.json());
  }, [id]);

  useEffect(() => {
    fetchData();
    fetch('/api/accounts').then(r => (r.ok ? r.json() : [])).then(a => setAccounts(Array.isArray(a) ? a : []));
  }, [fetchData]);

  // O botão flutuante também lança na viagem, e vive fora desta página
  useEffect(() => {
    const recarregar = () => fetchData();
    window.addEventListener('fincontrol:transacao-salva', recarregar);
    return () => window.removeEventListener('fincontrol:transacao-salva', recarregar);
  }, [fetchData]);

  if (erro) {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon"><Icon name="viagem" /></div>
        <p className="empty-state-text">{erro}</p>
        <Link href="/trips" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>Ver viagens</Link>
      </div>
    );
  }

  if (!data) return <div className="skeleton" style={{ height: 240 }} />;

  const { trip, role, me, members, entries } = data;
  const dono = role === 'OWNER';
  const r = resumoViagem(trip, entries, todayISO());
  const nomes = Object.fromEntries(members.map(m => [m.userId, m.name]));
  const variosParticipantes = members.length > 1;

  const porDia = new Map();
  for (const e of entries) {
    const k = diaDe(e.date);
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(e);
  }
  const totalDoDia = Object.fromEntries(r.porDia.map(d => [diaDe(d.data), d.valor]));

  const apagarGasto = async (e) => {
    const ok = await confirmar({
      titulo: 'Apagar este gasto?',
      texto: e.linked
        ? 'Ele foi pago pela conta, então o lançamento no extrato da conta também será apagado.'
        : 'Ele sai só da viagem. Nada muda no resto do app.',
      confirmarLabel: 'Apagar',
    });
    if (!ok) return;
    setEditandoGasto(null);
    await fetch(`/api/trips/${id}/entries?entryId=${e.id}`, { method: 'DELETE' });
    window.dispatchEvent(new CustomEvent('fincontrol:transacao-salva'));
  };

  const apagarViagem = async () => {
    const ok = await confirmar({
      titulo: `Apagar "${trip.name}"?`,
      texto: 'Os gastos da viagem somem. O que foi pago pela conta continua no extrato, porque o dinheiro saiu de fato.',
      confirmarLabel: 'Apagar viagem',
    });
    if (!ok) return;
    const res = await fetch(`/api/trips/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/trips');
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{trip.name}</h1>
          <p className="page-subtitle">{formatDate(trip.startDate)} a {formatDate(trip.endDate)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setLancando(true)}><Icon name="adicionar" /> Lançar gasto</button>
          {dono && (
            <>
              <button className="btn btn-secondary" onClick={() => setEditandoViagem(true)} aria-label="Editar viagem"><Icon name="editar" /></button>
              <button className="btn btn-danger" onClick={apagarViagem} aria-label="Apagar viagem"><Icon name="remover" /></button>
            </>
          )}
        </div>
      </div>

      <Destaque r={r} />

      <div className="section">
        <BarraDoOrcamento r={r} />
      </div>

      {r.porCategoria.length > 0 && (
        <div className="section">
          <div className="section-title"><Icon name="categoria" /> Por categoria</div>
          <div className="card trip-cats">
            {r.porCategoria.map(c => {
              const maior = Math.max(r.porCategoria[0].valor, 1);
              return (
                <div key={c.categoria} className="trip-cat">
                  <span className="trip-cat-name">{c.categoria}</span>
                  <div className="trip-cat-bar"><div style={{ width: `${Math.max(c.valor, 0) / maior * 100}%` }} /></div>
                  <span className="trip-cat-value">{formatBRL(c.valor)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TripMembers
        tripId={id}
        tripName={trip.name}
        members={members}
        dono={dono}
        me={me}
        porPessoa={r.porPessoa}
        onChanged={fetchData}
      />

      <div className="section">
        <div className="section-title"><Icon name="transacoes" /> Gastos</div>
        {entries.length === 0 ? (
          <div className="card empty-state">
            <p className="empty-state-text">Nenhum gasto lançado. Passagem e hotel pagos antes também entram aqui.</p>
          </div>
        ) : (
          <div className="card">
            {[...porDia.entries()].map(([dia, lista]) => (
              <div key={dia} className="trip-day">
                <div className="trip-day-head">
                  <span>
                    {formatDateShort(lista[0].date)}
                    {faseDe(trip, lista[0].date) !== 'destino' && (
                      <span className="trip-day-phase"> · {FASES.find(f => f.id === faseDe(trip, lista[0].date)).label}</span>
                    )}
                  </span>
                  <span>{formatBRL(totalDoDia[dia] || 0)}</span>
                </div>
                {lista.map(e => (
                  <div
                    key={e.id}
                    className="transaction-item"
                    // Só os próprios abrem para editar; os do outro participante são leitura
                    style={e.mine ? { cursor: 'pointer' } : undefined}
                    onClick={e.mine ? () => setEditandoGasto(e) : undefined}
                  >
                    <div className={`transaction-icon ${e.type === 'INCOME' ? 'income' : 'expense'}`}>
                      <Icon name={e.method === 'CARTAO' ? 'cartao' : e.method === 'DINHEIRO' ? 'dinheiro' : 'banco'} />
                    </div>
                    <div className="transaction-info">
                      <div className="transaction-desc">{e.description || e.category}</div>
                      <div className="transaction-meta">
                        <span>{e.category}</span>
                        <span>•</span>
                        <span>{TRIP_METHODS[e.method]?.label}</span>
                        {variosParticipantes && <><span>•</span><span>{nomes[e.userId] || 'Participante'}</span></>}
                      </div>
                    </div>
                    <div className={`transaction-amount ${e.type === 'INCOME' ? 'amount-income' : 'amount-expense'}`}>
                      {e.type === 'INCOME' ? '+' : '-'}{formatBRL(e.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {(lancando || editandoGasto) && (
        <Modal onClose={() => { setLancando(false); setEditandoGasto(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editandoGasto ? 'Editar gasto' : `Gasto em ${trip.name}`}</div>
              <button className="modal-close" onClick={() => { setLancando(false); setEditandoGasto(null); }} aria-label="Fechar"><Icon name="fechar" size={18} /></button>
            </div>
            <TripEntryForm
              tripId={id}
              accounts={accounts}
              entry={editandoGasto}
              onDelete={editandoGasto ? () => apagarGasto(editandoGasto) : undefined}
              onCancel={() => { setLancando(false); setEditandoGasto(null); }}
              onSaved={() => { setLancando(false); setEditandoGasto(null); }}
            />
          </div>
        </Modal>
      )}

      {editandoViagem && (
        <Modal onClose={() => setEditandoViagem(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Editar viagem</h2>
              <button className="modal-close" onClick={() => setEditandoViagem(false)} aria-label="Fechar"><Icon name="fechar" /></button>
            </div>
            <TripForm
              trip={trip}
              onCancel={() => setEditandoViagem(false)}
              onSaved={() => { setEditandoViagem(false); fetchData(); }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
