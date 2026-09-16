'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import { formatBRL, getMonthName, getMonthShort } from '@/lib/utils';
import { shiftMonth } from '@/lib/calendar';
import { firstDateFromNext, installmentAmount } from '@/lib/installments';
import { useConfirm } from '@/components/ConfirmProvider';

const vazio = () => ({
  description: '',
  totalAmount: '',
  count: '',
  // Quase toda compra é cadastrada com o carnê já correndo, então o
  // formulário pergunta qual parcela vem agora em vez de exigir a data da
  // primeira — e calcula a primeira a partir disso.
  nextIndex: '1',
  nextMonth: '',
  nextDay: '',
  creditCardId: '',
  bankAccountId: '',
  categoryId: '',
  notes: '',
});

export default function InstallmentsPage() {
  const confirmar = useConfirm();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [compras, setCompras] = useState([]);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(vazio());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [verEncerradas, setVerEncerradas] = useState(false);

  const buscar = useCallback(async () => {
    setCarregando(true);
    const [i, c, a, cat] = await Promise.all([
      fetch(`/api/installments?year=${year}&month=${month}`).then(r => r.json()),
      fetch('/api/cards').then(r => r.json()),
      fetch('/api/accounts').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]);
    setCompras(Array.isArray(i) ? i : []);
    setCards(Array.isArray(c) ? c : []);
    setAccounts(Array.isArray(a) ? a : []);
    setCategories(Array.isArray(cat) ? cat.filter(x => x.type === 'EXPENSE') : []);
    setCarregando(false);
  }, [year, month]);

  useEffect(() => { buscar(); }, [buscar]);

  const step = (offset) => {
    const next = shiftMonth(year, month, offset);
    setYear(next.year);
    setMonth(next.month);
  };

  const abrirNova = () => {
    setEditando(null);
    setForm({ ...vazio(), nextMonth: `${year}-${String(month).padStart(2, '0')}`, nextDay: '' });
    setErro('');
    setAberto(true);
  };

  const abrirEdicao = (compra) => {
    const parcela = compra.parcela;
    const primeira = new Date(compra.firstDate);

    setEditando(compra.id);
    setForm({
      description: compra.description,
      totalAmount: String(compra.totalAmount),
      count: String(compra.count),
      nextIndex: String(parcela?.index || 1),
      nextMonth: parcela
        ? `${year}-${String(month).padStart(2, '0')}`
        : `${primeira.getUTCFullYear()}-${String(primeira.getUTCMonth() + 1).padStart(2, '0')}`,
      nextDay: String(primeira.getUTCDate()),
      creditCardId: compra.creditCardId || '',
      bankAccountId: compra.bankAccountId || '',
      categoryId: compra.categoryId || '',
      notes: compra.notes || '',
    });
    setErro('');
    setAberto(true);
  };

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');

    const [ano, mes] = (form.nextMonth || '').split('-').map(Number);
    if (!ano || !mes) return setErro('Informe o mês da próxima parcela');

    const dia = parseInt(form.nextDay, 10);
    if (!(dia >= 1 && dia <= 31)) return setErro('Informe o dia da parcela (1 a 31)');

    const firstDate = firstDateFromNext(parseInt(form.nextIndex, 10) || 1, ano, mes, dia);

    setSalvando(true);
    const res = await fetch('/api/installments', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editando,
        description: form.description,
        totalAmount: form.totalAmount,
        count: form.count,
        firstDate,
        creditCardId: form.creditCardId || null,
        bankAccountId: form.creditCardId ? null : (form.bankAccountId || null),
        categoryId: form.categoryId || null,
        notes: form.notes,
      }),
    });
    setSalvando(false);

    if (!res.ok) return setErro((await res.json()).error || 'Não foi possível salvar');

    setAberto(false);
    buscar();
  };

  const remover = async (compra) => {
    const ok = await confirmar({
      titulo: `Apagar "${compra.description}"?`,
      texto: 'As parcelas somem das projeções dos próximos meses.',
      confirmarLabel: 'Apagar compra',
    });
    if (!ok) return;
    await fetch(`/api/installments?id=${compra.id}`, { method: 'DELETE' });
    buscar();
  };

  const ativas = compras.filter(c => !c.encerrada);
  const encerradas = compras.filter(c => c.encerrada);
  const naLista = verEncerradas ? compras : ativas;

  const doMes = ativas.filter(c => c.parcela);
  const totalMes = doMes.reduce((s, c) => s + c.parcela.amount, 0);
  const totalFalta = ativas.reduce((s, c) => s + c.falta, 0);
  const noCartao = doMes.filter(c => c.creditCardId).reduce((s, c) => s + c.parcela.amount, 0);

  // Valor de cada parcela enquanto o usuário digita
  const previaParcela = (() => {
    const total = parseFloat(String(form.totalAmount).replace(',', '.'));
    const n = parseInt(form.count, 10);
    return total > 0 && n > 0 ? installmentAmount(total, n, 1) : null;
  })();

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Parcelamentos</h1>
          <p className="page-subtitle">Compras divididas, com data para acabar</p>
        </div>
        <div className="cal-nav">
          <button className="btn-icon" onClick={() => step(-1)} aria-label="Mês anterior">
            <Icon name="anterior" size={16} />
          </button>
          <span className="cal-nav-label">{getMonthName(month)} {year}</span>
          <button className="btn-icon" onClick={() => step(1)} aria-label="Próximo mês">
            <Icon name="proximo" size={16} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={abrirNova}>
            <Icon name="adicionar" size={14} /> Nova compra
          </button>
        </div>
      </div>

      <div className="stat-cards">
        <div className="card stat-card expense">
          <div className="stat-label">Parcelas de {getMonthShort(month).toLowerCase()}</div>
          <div className="stat-value negative">{formatBRL(totalMes)}</div>
          <div className="stat-change">
            {doMes.length} {doMes.length === 1 ? 'compra' : 'compras'} em andamento
          </div>
        </div>
        <div className="card stat-card variation">
          <div className="stat-label">Falta pagar</div>
          <div className="stat-value">{formatBRL(totalFalta)}</div>
          <div className="stat-change">somando todas as parcelas futuras</div>
        </div>
        <div className="card stat-card balance">
          <div className="stat-label">Dentro da fatura</div>
          <div className="stat-value">{formatBRL(noCartao)}</div>
          <div className="stat-change">já está embutido no cartão, não sai de novo</div>
        </div>
      </div>

      {carregando ? (
        <div className="card"><div className="skeleton" style={{ height: 200 }} /></div>
      ) : naLista.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><Icon name="parcelas" size={32} /></div>
          <h3>Nenhuma compra parcelada</h3>
          <p>
            Cadastre aquela viagem em 10x ou o console em 5x. O app passa a mostrar
            a parcela em cada mês, quanto falta e quando você se desamarra.
          </p>
          <button className="btn btn-primary" onClick={abrirNova}>
            <Icon name="adicionar" size={14} /> Cadastrar compra parcelada
          </button>
        </div>
      ) : (
        <div className="card panel">
          <div className="panel-header">
            <div className="panel-title">
              {verEncerradas ? 'Todas as compras' : 'Em andamento'}
            </div>
            {encerradas.length > 0 && (
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={verEncerradas}
                  onChange={e => setVerEncerradas(e.target.checked)}
                />
                Mostrar as {encerradas.length} já quitadas
              </label>
            )}
          </div>

          <div className="parcel-list">
            {naLista.map(compra => {
              const p = compra.parcela;
              const pago = p ? p.index - 1 : (compra.encerrada ? compra.count : 0);
              const pct = Math.round((pago / compra.count) * 100);

              return (
                <div key={compra.id} className={`parcel ${compra.encerrada ? 'done' : ''}`}>
                  <div className="parcel-main">
                    <div className="parcel-title">
                      <strong>{compra.description}</strong>
                      {p && <span className="parcel-badge">{p.index}/{p.count}</span>}
                      {compra.encerrada && <span className="parcel-badge done">quitada</span>}
                      {p?.isLast && <span className="parcel-badge last">última</span>}
                    </div>
                    <div className="parcel-meta">
                      {compra.creditCard
                        ? <><span className="dot" style={{ background: compra.creditCard.color }} /> {compra.creditCard.name}</>
                        : compra.bankAccount?.name || 'Sem forma de pagamento'}
                      {compra.category && <> · {compra.category.name}</>}
                      {' · '}até {getMonthShort(compra.fim.month).toLowerCase()}/{compra.fim.year}
                    </div>

                    <div className="parcel-progress" title={`${pago} de ${compra.count} pagas`}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="parcel-numbers">
                    <div>
                      <div className="stat-label">Parcela</div>
                      <div className="footer-value">{p ? formatBRL(p.amount) : '—'}</div>
                    </div>
                    <div>
                      <div className="stat-label">Falta</div>
                      <div className="footer-value">{formatBRL(compra.falta)}</div>
                    </div>
                    <div>
                      <div className="stat-label">Total</div>
                      <div className="footer-value">{formatBRL(compra.totalAmount)}</div>
                    </div>
                  </div>

                  <div className="parcel-actions">
                    <button className="btn-icon" onClick={() => abrirEdicao(compra)} aria-label="Editar">
                      <Icon name="editar" size={15} />
                    </button>
                    <button className="btn-icon" onClick={() => remover(compra)} aria-label="Remover">
                      <Icon name="remover" size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {aberto && (
        <Modal onClose={() => setAberto(false)} labelledBy="titulo-parcela">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title" id="titulo-parcela">
                {editando ? 'Editar compra parcelada' : 'Nova compra parcelada'}
              </h2>
              <button className="modal-close" onClick={() => setAberto(false)} aria-label="Fechar">
                <Icon name="fechar" />
              </button>
            </div>

            <form onSubmit={salvar}>
            <div className="form-group">
              <label className="form-label">O que foi comprado</label>
              <input
                className="form-input" required autoFocus placeholder="Viagem, Playstation, Geladeira"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Valor total</label>
                <input
                  className="form-input" type="number" step="0.01" min="0.01" required
                  value={form.totalAmount}
                  onChange={e => setForm({ ...form, totalAmount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Em quantas vezes</label>
                <input
                  className="form-input" type="number" min="1" max="120" required
                  value={form.count}
                  onChange={e => setForm({ ...form, count: e.target.value })}
                />
              </div>
            </div>

            {previaParcela !== null && (
              <p className="form-hint">
                {form.count}x de <strong>{formatBRL(previaParcela)}</strong>
                {' '}— os centavos que não dividem vão na última.
              </p>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Próxima parcela é a</label>
                <input
                  className="form-input" type="number" min="1" required
                  value={form.nextIndex}
                  onChange={e => setForm({ ...form, nextIndex: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">No mês de</label>
                <input
                  className="form-input" type="month" required
                  value={form.nextMonth}
                  onChange={e => setForm({ ...form, nextMonth: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Dia</label>
                <input
                  className="form-input" type="number" min="1" max="31" required
                  value={form.nextDay}
                  onChange={e => setForm({ ...form, nextDay: e.target.value })}
                />
              </div>
            </div>
            <p className="form-hint">
              Já está pagando há um tempo? Diga qual parcela vem agora — o app
              calcula sozinho quando a compra começou e quando termina.
            </p>

            <div className="form-group">
              <label className="form-label">Quem paga</label>
              <select
                className="form-select"
                value={form.creditCardId}
                onChange={e => setForm({ ...form, creditCardId: e.target.value })}
              >
                <option value="">Não é no cartão</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {form.creditCardId ? (
              <p className="form-hint">
                No cartão, a parcela já está dentro da fatura — ela aparece nos
                baldes e no total, mas não sai de novo da conta.
              </p>
            ) : (
              <div className="form-group">
                <label className="form-label">Conta de onde sai</label>
                <select
                  className="form-select" required
                  value={form.bankAccountId}
                  onChange={e => setForm({ ...form, bankAccountId: e.target.value })}
                >
                  <option value="">Escolha a conta</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Categoria (opcional)</label>
              <select
                className="form-select"
                value={form.categoryId}
                onChange={e => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {erro && <div className="form-error">{erro}</div>}

            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
