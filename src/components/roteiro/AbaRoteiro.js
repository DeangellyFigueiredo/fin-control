'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import TripEntryForm from '@/components/TripEntryForm';
import { useConfirm } from '@/components/ConfirmProvider';
import { estadias, diasDoRoteiro, ritmo } from '@/lib/roteiro';
import { diaDe, isoDoDia, resumoViagem } from '@/lib/trips';
import MapaDaRota from './MapaDaRota';
import TimelineDoRoteiro from './TimelineDoRoteiro';
import CalendarioDeEstadias from './CalendarioDeEstadias';
import PainelDoRitmo from './PainelDoRitmo';
import ParadaForm from './ParadaForm';
import AtividadeForm from './AtividadeForm';
import { coresDasParadas, noitesTexto } from './formato';
import { menosMovimentoAgora } from './movimento';

/** O que acende em cada vista a partir do foco (dia ou parada sob o mouse). */
function calcularDestaque(foco, lista, dias) {
  const vazio = { dias: new Set(), paradas: new Set(), trechos: new Set() };
  if (!foco) return vazio;

  if (foco.tipo === 'dia') {
    const d = dias.find(x => x.data === foco.data);
    if (!d) return vazio;
    return {
      dias: new Set([d.data]),
      paradas: new Set([d.manha?.id, d.noite?.id].filter(Boolean)),
      trechos: new Set(d.trechos.map(t => t.para.indice - 1)),
    };
  }

  // Parada: os dias da estadia, da chegada até a saída
  const ids = new Set(foco.ids);
  const diasDaParada = new Set();
  for (const s of lista) {
    if (!ids.has(s.id)) continue;
    const ate = s.saida ? diaDe(s.saida) : diaDe(s.chegada);
    for (let x = diaDe(s.chegada); x <= ate; x++) diasDaParada.add(isoDoDia(x));
  }
  return { dias: diasDaParada, paradas: ids, trechos: new Set() };
}

/**
 * A aba Roteiro: mapa, calendário, ritmo e a timeline dos dias. Ver
 * docs/rfc/0003-roteiro.md. Qualquer participante edita; importar é só do
 * dono, e só com o roteiro vazio.
 *
 * Status e ordem mudam primeiro na tela e depois no servidor (`mudarLocal`),
 * porque marcar uma atividade no meio do passeio precisa responder no toque.
 * Se o servidor recusar, recarrega e a tela volta ao que vale.
 */
export default function AbaRoteiro({ tripId, trip, dono, stops, activities, entries, accounts, hojeISO, mudarLocal, recarregar }) {
  const confirmar = useConfirm();
  const [foco, setFoco] = useState(null);
  const [modal, setModal] = useState(null);
  const [outras, setOutras] = useState([]);

  const lista = useMemo(() => estadias(stops), [stops]);
  const cores = useMemo(() => coresDasParadas(lista), [lista]);
  const dias = useMemo(() => diasDoRoteiro(trip, stops, activities, entries), [trip, stops, activities, entries]);
  const r = useMemo(() => ritmo(trip, entries, activities, stops, hojeISO), [trip, entries, activities, stops, hojeISO]);
  const resumo = useMemo(() => resumoViagem(trip, entries, hojeISO), [trip, entries, hojeISO]);
  const destaque = useMemo(() => calcularDestaque(foco, lista, dias), [foco, lista, dias]);

  // As outras viagens do mesmo período, apagadas no calendário
  useEffect(() => {
    fetch('/api/trips').then(res => (res.ok ? res.json() : [])).then(todas => {
      if (Array.isArray(todas)) setOutras(todas.filter(v => v.id !== tripId));
    }).catch(() => {});
  }, [tripId]);

  // Durante a viagem, abre no dia de hoje
  const rolou = useRef(false);
  useEffect(() => {
    if (rolou.current || resumo.status !== 'durante') return;
    rolou.current = true;
    const el = document.getElementById(`dia-${hojeISO}`);
    el?.scrollIntoView({ behavior: menosMovimentoAgora() ? 'auto' : 'smooth', block: 'center' });
  }, [resumo.status, hojeISO]);

  const irParaDia = (iso) => {
    const el = document.getElementById(`dia-${iso}`);
    if (!el) return;
    el.scrollIntoView({ behavior: menosMovimentoAgora() ? 'auto' : 'smooth', block: 'center' });
    // Atributo, não classe, pelo mesmo motivo de data-revelado
    delete el.dataset.piscar;
    void el.offsetWidth; // reinicia a animação se clicar duas vezes
    el.dataset.piscar = '';
  };

  const salvarAtividade = async (a, campos) => {
    mudarLocal(d => ({ ...d, activities: d.activities.map(x => (x.id === a.id ? { ...x, ...campos } : x)) }));
    const res = await fetch(`/api/trips/${tripId}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, ...campos }),
    });
    if (!res.ok) recarregar();
  };

  const alternarStatus = (a) => salvarAtividade(a, { status: a.status === 'FEITA' ? 'PLANEJADA' : 'FEITA' });
  const pular = (a) => salvarAtividade(a, { status: a.status === 'PULADA' ? 'PLANEJADA' : 'PULADA' });

  /** Troca com a vizinha no mesmo período e renumera o período inteiro. */
  const mover = async (a, dir, doPeriodo) => {
    const i = doPeriodo.findIndex(x => x.id === a.id);
    const j = i + dir;
    if (j < 0 || j >= doPeriodo.length) return;
    const nova = [...doPeriodo];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    const ordens = new Map(nova.map((x, k) => [x.id, k]));
    const mudaram = nova.filter(x => x.order !== ordens.get(x.id));

    mudarLocal(d => ({
      ...d,
      activities: d.activities.map(x => (ordens.has(x.id) ? { ...x, order: ordens.get(x.id) } : x)),
    }));
    const res = await Promise.all(mudaram.map(x => fetch(`/api/trips/${tripId}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: x.id, order: ordens.get(x.id) }),
    })));
    if (res.some(x => !x.ok)) recarregar();
  };

  const apagarAtividade = async (a) => {
    const ligados = entries.filter(e => e.activityId === a.id).length;
    const ok = await confirmar({
      titulo: `Apagar "${a.title}"?`,
      texto: ligados
        ? `${ligados === 1 ? 'O gasto ligado a ela continua' : `Os ${ligados} gastos ligados a ela continuam`} na viagem, só sem a atividade.`
        : 'Sai só do roteiro.',
      confirmarLabel: 'Apagar',
    });
    if (!ok) return;
    setModal(null);
    await fetch(`/api/trips/${tripId}/activities?activityId=${a.id}`, { method: 'DELETE' });
    recarregar();
  };

  const apagarParada = async (s) => {
    const ok = await confirmar({
      titulo: `Tirar ${s.city} do roteiro?`,
      texto: 'As atividades e os gastos dos dias continuam. Só a parada e o trecho até ela saem.',
      confirmarLabel: 'Tirar',
    });
    if (!ok) return;
    setModal(null);
    await fetch(`/api/trips/${tripId}/stops?stopId=${s.id}`, { method: 'DELETE' });
    recarregar();
  };

  const fechar = () => setModal(null);
  const salvo = () => { setModal(null); recarregar(); };
  const vazio = stops.length === 0 && activities.length === 0;

  return (
    <div className="roteiro">
      <div className="roteiro-acoes">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: 'parada' })}>
          <Icon name="local" /> Parada
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: 'atividade' })}>
          <Icon name="adicionar" /> Atividade
        </button>
        {dono && vazio && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: 'importar' })}>
            <Icon name="importar" /> Importar roteiro
          </button>
        )}
      </div>

      <MapaDaRota
        estadias={lista} dias={dias} cores={cores} hojeISO={hojeISO}
        destaque={destaque} onFoco={setFoco}
        onEditarParada={s => setModal({ tipo: 'parada', stop: s })}
      />

      {lista.length > 0 && (
        <div className="roteiro-paradas" role="list">
          {lista.map(s => (
            <button
              key={s.id} type="button" role="listitem"
              className={`roteiro-parada-chip ${destaque.paradas.has(s.id) ? 'ativa' : ''}`}
              style={{ '--cor': cores[s.id] }}
              onClick={() => setModal({ tipo: 'parada', stop: s })}
              onMouseEnter={() => setFoco({ tipo: 'parada', ids: [s.id] })}
              onMouseLeave={() => setFoco(null)}
            >
              <i aria-hidden="true" />
              {s.city}
              <span>
                {s.tipo === 'origem' ? 'saída' : s.tipo === 'fim' ? 'chegada' : s.tipo === 'passagem' ? 'passagem' : noitesTexto(s.noites)}
              </span>
              <Icon name="editar" />
            </button>
          ))}
        </div>
      )}

      <div className="roteiro-grade">
        <section className="section">
          <div className="section-title"><Icon name="estadias" /> Estadias</div>
          <div className="card roteiro-cal-card">
            <CalendarioDeEstadias
              trip={trip} estadias={lista} cores={cores} outrasViagens={outras} hojeISO={hojeISO}
              destaque={destaque} onDia={irParaDia} onFoco={setFoco}
            />
          </div>
        </section>
        <section className="section">
          <div className="section-title"><Icon name="ritmo" /> Ritmo</div>
          <PainelDoRitmo ritmo={r} dias={dias} diasAteIda={resumo.diasAteIda} />
        </section>
      </div>

      <section className="section">
        <div className="section-title"><Icon name="roteiro" /> Dia a dia</div>
        <TimelineDoRoteiro
          dias={dias} cores={cores} hojeISO={hojeISO} limiteDia={r.limiteDia}
          destaque={destaque} onFoco={setFoco}
          onNovaAtividade={data => setModal({ tipo: 'atividade', data })}
          onEditarAtividade={a => setModal({ tipo: 'atividade', activity: a })}
          onAlternarStatus={alternarStatus}
          onPular={pular}
          onMover={mover}
          onNovoGasto={data => setModal({ tipo: 'gasto', data })}
        />
      </section>

      {modal && (
        <Modal onClose={fechar}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {modal.tipo === 'parada' && (modal.stop ? `Parada: ${modal.stop.city}` : 'Nova parada')}
                {modal.tipo === 'atividade' && (modal.activity ? 'Editar atividade' : 'Nova atividade')}
                {modal.tipo === 'gasto' && `Gasto de ${dias.find(d => d.data === modal.data)?.noite?.city || trip.name}`}
                {modal.tipo === 'importar' && 'Importar roteiro'}
              </h2>
              <button className="modal-close" onClick={fechar} aria-label="Fechar"><Icon name="fechar" size={18} /></button>
            </div>

            {modal.tipo === 'parada' && (
              <ParadaForm
                tripId={tripId} trip={trip} stop={modal.stop}
                primeira={modal.stop ? modal.stop.tipo === 'origem' : stops.length === 0}
                onSaved={salvo} onCancel={fechar}
                onDelete={modal.stop ? () => apagarParada(modal.stop) : undefined}
              />
            )}
            {modal.tipo === 'atividade' && (
              <AtividadeForm
                tripId={tripId} trip={trip} activity={modal.activity} dataInicial={modal.data}
                onSaved={salvo} onCancel={fechar}
                onDelete={modal.activity ? () => apagarAtividade(modal.activity) : undefined}
              />
            )}
            {modal.tipo === 'gasto' && (
              <TripEntryForm
                tripId={tripId} accounts={accounts} activities={activities}
                defaults={{ date: modal.data }}
                onSaved={salvo} onCancel={fechar}
              />
            )}
            {modal.tipo === 'importar' && <ImportarRoteiro tripId={tripId} onSaved={salvo} onCancel={fechar} />}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ImportarRoteiro({ tripId, onSaved, onCancel }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const importar = async (e) => {
    e.preventDefault();
    setErro('');
    let json;
    try { json = JSON.parse(texto); } catch { return setErro('Não é um JSON válido'); }
    setSalvando(true);
    const res = await fetch(`/api/trips/${tripId}/itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
    });
    const data = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) return setErro(data.error || 'Erro ao importar');
    onSaved();
  };

  return (
    <form onSubmit={importar}>
      {erro && <div className="login-error" style={{ marginBottom: 12 }}>{erro}</div>}
      <p className="quick-add-note" style={{ marginTop: 0 }}>
        Cole um JSON com <code>stops</code> (cidade, lat, lng, data de chegada, trecho) e{' '}
        <code>activities</code> (título, data, período ou hora, categoria, pet). Só funciona com o roteiro vazio.
      </p>
      <textarea
        className="form-input roteiro-importar" rows={12} value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'{\n  "stops": [{ "city": "Gramado", "uf": "RS", "lat": -29.38, "lng": -50.87, "date": "2026-12-13", "legKm": 110 }],\n  "activities": [{ "title": "Lago Negro", "date": "2026-12-14", "period": "MANHA", "category": "Passeios", "pet": "SIM" }]\n}'}
        spellCheck={false} required
      />
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={salvando}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Importando...' : 'Importar'}</button>
      </div>
    </form>
  );
}
