'use client';

import { useState, useEffect, useCallback } from 'react';
import TransactionForm from '@/components/TransactionForm';
import { formatBRL, formatDate, todayISO } from '@/lib/utils';

const DIRECOES = {
  OWE:  { id: 'OWE',  aba: 'Eu devo',   titulo: 'dívida',    cor: '#e66767', icone: '🤝',
          vazio: 'Nada em aberto com ninguém.' },
  LENT: { id: 'LENT', aba: 'Me devem',  titulo: 'empréstimo', cor: '#3987e5', icone: '💰',
          vazio: 'Você não emprestou nada que esteja pendente.' },
};

const vazia = (direction) => ({
  name: '', counterpart: '', direction, originalAmount: '', startDate: todayISO(),
  dueDate: '', icon: DIRECOES[direction].icone, color: DIRECOES[direction].cor,
  notes: '', isSettled: false,
});

export default function DebtsPage() {
  const [debts, setDebts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [tab, setTab] = useState('OWE');

  const fetchData = useCallback(async () => {
    const [dRes, aRes] = await Promise.all([
      fetch('/api/debts'),
      fetch('/api/accounts'),
    ]);
    setDebts(await dRes.json());
    setAccounts(await aRes.json());
    setFirstLoad(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const recarregar = () => fetchData();
    window.addEventListener('fincontrol:transacao-salva', recarregar);
    return () => window.removeEventListener('fincontrol:transacao-salva', recarregar);
  }, [fetchData]);

  const abrirForm = (debt) => {
    setError('');
    setEditingId(debt?.id || null);
    setForm(debt ? {
      name: debt.name,
      counterpart: debt.counterpart || '',
      direction: debt.direction,
      originalAmount: String(debt.originalAmount),
      startDate: debt.startDate ? debt.startDate.slice(0, 10) : '',
      dueDate: debt.dueDate ? debt.dueDate.slice(0, 10) : '',
      icon: debt.icon,
      color: debt.color,
      notes: debt.notes || '',
      isSettled: debt.isSettled,
    } : vazia(tab));
  };

  const salvar = async (e) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/debts', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
    });
    if (!res.ok) {
      setError((await res.json()).error || 'Erro ao salvar');
      return;
    }
    setForm(null);
    setEditingId(null);
    fetchData();
  };

  const remover = async (debt) => {
    const aviso = debt.totalPagamentos > 0
      ? `Remover "${debt.name}"? Os ${debt.totalPagamentos} pagamentos continuam no extrato como saídas comuns.`
      : `Remover "${debt.name}"?`;
    if (!confirm(aviso)) return;
    await fetch(`/api/debts?id=${debt.id}`, { method: 'DELETE' });
    fetchData();
  };

  const alternarQuitada = async (debt) => {
    await fetch('/api/debts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...debt, id: debt.id, isSettled: !debt.isSettled }),
    });
    fetchData();
  };

  const daAba = debts.filter(d => d.direction === tab);
  const abertas = daAba.filter(d => !d.quitada);
  const quitadas = daAba.filter(d => d.quitada);
  const atrasadas = abertas.filter(d => d.atrasada);
  const totalAberto = abertas.reduce((s, d) => s + d.restante, 0);
  const totalMovido = daAba.reduce((s, d) => s + d.pago, 0);
  const mediaMensal = abertas.reduce((s, d) => s + d.mediaMensal, 0);

  // O número que só existe com os dois lados juntos
  const devo = debts.filter(d => d.direction === 'OWE' && !d.quitada)
    .reduce((s, d) => s + d.restante, 0);
  const meDevem = debts.filter(d => d.direction === 'LENT' && !d.quitada)
    .reduce((s, d) => s + d.restante, 0);
  const liquido = meDevem - devo;

  const dir = DIRECOES[tab];

  if (firstLoad) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Dívidas e empréstimos</h1></div>
        <div className="card"><div className="skeleton" style={{ height: 260 }} /></div>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dívidas e empréstimos</h1>
          <p className="page-subtitle">
            Valores sem parcela fixa: você marca cada pagamento conforme acontece
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => abrirForm(null)}>
          + {tab === 'OWE' ? 'Nova dívida' : 'Novo empréstimo'}
        </button>
      </div>

      <div className="tabs">
        {Object.values(DIRECOES).map(d => {
          const pendentes = debts.filter(x => x.direction === d.id && !x.quitada);
          const emAtraso = pendentes.filter(x => x.atrasada).length;
          return (
            <button
              key={d.id}
              className={`tab ${tab === d.id ? 'active' : ''}`}
              onClick={() => { setTab(d.id); setPayingId(null); setAberta(null); }}
            >
              <span>{d.icone}</span> {d.aba}
              {pendentes.length > 0 && <span className="count-pill">{pendentes.length}</span>}
              {emAtraso > 0 && <span className="kind-badge badge-card">{emAtraso} atrasado(s)</span>}
            </button>
          );
        })}
      </div>

      <div className="stat-cards">
        <div className={`card stat-card ${tab === 'OWE' ? 'expense' : 'income'}`}>
          <div className="stat-label">{tab === 'OWE' ? 'Ainda devo' : 'Tenho a receber'}</div>
          <div className={`stat-value ${tab === 'OWE' ? 'negative' : 'positive'}`}>
            {formatBRL(totalAberto)}
          </div>
          <div className="stat-change">
            {abertas.length} em aberto
            {atrasadas.length > 0 && ` · ${atrasadas.length} atrasado(s)`}
          </div>
        </div>
        <div className="card stat-card balance">
          <div className="stat-label">{tab === 'OWE' ? 'Já paguei' : 'Já recebi'}</div>
          <div className="stat-value">{formatBRL(totalMovido)}</div>
        </div>
        <div className="card stat-card variation">
          <div className="stat-label">Ritmo atual</div>
          <div className="stat-value">{formatBRL(mediaMensal)}</div>
          <div className="stat-change">média por mês</div>
        </div>
        <div className="card stat-card balance">
          <div className="stat-label">Saldo entre os dois lados</div>
          <div className={`stat-value ${liquido >= 0 ? 'positive' : 'negative'}`}>
            {formatBRL(liquido)}
          </div>
          <div className="stat-change">
            devo {formatBRL(devo)} · me devem {formatBRL(meDevem)}
          </div>
        </div>
      </div>

      {daAba.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">{dir.icone}</div>
          <p className="empty-state-text">{dir.vazio}</p>
          <button className="btn btn-primary" onClick={() => abrirForm(null)}>
            Cadastrar {dir.titulo}
          </button>
        </div>
      ) : (
        <div className="debts-list">
          {[...abertas, ...quitadas].map(debt => {
            const expandida = aberta === debt.id;
            return (
              <div
                key={debt.id}
                className={`card debt-card ${debt.quitada ? 'is-settled' : ''}`}
                style={{ '--debt-color': debt.color }}
              >
                <div className="debt-head">
                  <div className="debt-identity">
                    <span className="debt-icon">{debt.icon}</span>
                    <div>
                      <div className="debt-name">{debt.name}</div>
                      <div className="transaction-meta">
                        {debt.counterpart && <span>com {debt.counterpart}</span>}
                        {debt.dueDate && <span>prazo {formatDate(debt.dueDate)}</span>}
                        {debt.atrasada && <span className="kind-badge badge-card">Atrasado</span>}
                        {debt.quitada && (
                          <span className="kind-badge badge-real">
                            {debt.direction === 'OWE' ? 'Quitada' : 'Recebido'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button className="btn-icon" onClick={() => alternarQuitada(debt)} title={debt.quitada ? 'Reabrir' : 'Marcar como quitada'}>
                      {debt.quitada ? '↩️' : '✅'}
                    </button>
                    <button className="btn-icon" onClick={() => abrirForm(debt)} aria-label="Editar">✏️</button>
                    <button className="btn-icon" onClick={() => remover(debt)} aria-label="Remover">🗑️</button>
                  </div>
                </div>

                <div className="debt-numbers">
                  <div>
                    <div className="stat-label">Total</div>
                    <div className="footer-value">{formatBRL(debt.originalAmount)}</div>
                  </div>
                  <div>
                    <div className="stat-label">{debt.direction === 'OWE' ? 'Pago' : 'Recebido'}</div>
                    <div className="footer-value amount-income">{formatBRL(debt.pago)}</div>
                  </div>
                  <div>
                    <div className="stat-label">{debt.direction === 'OWE' ? 'Falta' : 'A receber'}</div>
                    <div className={`footer-value ${debt.restante > 0 ? 'amount-expense' : 'amount-income'}`}>
                      {formatBRL(debt.restante)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Ritmo</div>
                    <div className="footer-value">
                      {debt.mediaMensal > 0 ? `${formatBRL(debt.mediaMensal)}/mês` : '—'}
                    </div>
                  </div>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${debt.progresso}%`, background: debt.color }}
                  />
                </div>
                <div className="goal-amounts">
                  <span>
                    {debt.progresso.toFixed(0)}% {debt.direction === 'OWE' ? 'pago' : 'recebido'}
                  </span>
                  <span>
                    {debt.mesesRestantes
                      ? `nesse ritmo, ~${debt.mesesRestantes} ${debt.mesesRestantes === 1 ? 'mês' : 'meses'}`
                      : debt.quitada ? 'concluída' : 'sem pagamentos ainda'}
                  </span>
                </div>

                {!debt.quitada && (
                  <div className="debt-insights">
                    {debt.totalPagamentos > 0 && (
                      <span>
                        {debt.totalPagamentos}{' '}
                        {debt.direction === 'OWE' ? 'pagamento(s)' : 'recebimento(s)'} em{' '}
                        {debt.mesesComPagamento} mês(es)
                        {debt.mesesSemPagamento > 0 && ` · ${debt.mesesSemPagamento} sem movimento`}
                      </span>
                    )}
                    {debt.ultimoPagamento && (
                      <span>último: {formatBRL(debt.ultimoPagamento.amount)} em {formatDate(debt.ultimoPagamento.date)}</span>
                    )}
                  </div>
                )}

                <div className="debt-actions">
                  {!debt.quitada && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setPayingId(payingId === debt.id ? null : debt.id)}
                    >
                      {payingId === debt.id
                        ? 'Cancelar'
                        : debt.direction === 'OWE'
                          ? '💸 Registrar pagamento'
                          : '💰 Registrar recebimento'}
                    </button>
                  )}
                  {debt.totalPagamentos > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setAberta(expandida ? null : debt.id)}
                    >
                      {expandida ? 'Ocultar' : `Ver ${debt.totalPagamentos} pagamento(s)`}
                    </button>
                  )}
                </div>

                {payingId === debt.id && (
                  <div style={{ marginTop: 12 }}>
                    <TransactionForm
                      baseDate={todayISO()}
                      accounts={accounts}
                      lockedDebtId={debt.id}
                      onSaved={() => { setPayingId(null); fetchData(); }}
                      onCancel={() => setPayingId(null)}
                    />
                  </div>
                )}

                {expandida && (
                  <div className="debt-payments">
                    {debt.payments.map(p => (
                      <div key={p.id} className="debt-payment">
                        <span className="debt-payment-date">{formatDate(p.date)}</span>
                        <span className="debt-payment-desc">{p.description || 'Pagamento'}</span>
                        <span className={debt.direction === 'OWE' ? 'amount-expense' : 'amount-income'}>
                          {formatBRL(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={salvar}>
            <div className="modal-header">
              <div className="modal-title">
                {editingId ? 'Editar' : 'Novo'} {form.direction === 'OWE' ? 'dívida' : 'empréstimo'}
              </div>
              <button type="button" className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>

            {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="type-toggle">
                <button
                  type="button"
                  className={form.direction === 'OWE' ? 'active-expense' : ''}
                  onClick={() => setForm({ ...form, direction: 'OWE' })}
                >
                  🤝 Eu devo
                </button>
                <button
                  type="button"
                  className={form.direction === 'LENT' ? 'active-income' : ''}
                  onClick={() => setForm({ ...form, direction: 'LENT' })}
                >
                  💰 Me devem
                </button>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input
                    className="form-input" required value={form.name}
                    placeholder={form.direction === 'OWE' ? 'Empréstimo para a reforma' : 'Emprestei para o conserto do carro'}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Ícone</label>
                  <input
                    className="form-input" maxLength={2} value={form.icon}
                    onChange={e => setForm({ ...form, icon: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {form.direction === 'OWE' ? 'Devo para' : 'Emprestei para'}
                  </label>
                  <input
                    className="form-input" value={form.counterpart} placeholder="João"
                    onChange={e => setForm({ ...form, counterpart: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor total (R$)</label>
                  <input
                    className="form-input" type="number" step="0.01" min="0.01" required
                    inputMode="decimal" value={form.originalAmount}
                    onChange={e => setForm({ ...form, originalAmount: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {form.direction === 'OWE' ? 'Peguei em' : 'Emprestei em'}
                  </label>
                  <input
                    className="form-input" type="date" value={form.startDate}
                    onChange={e => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Prazo (opcional)</label>
                  <input
                    className="form-input" type="date" value={form.dueDate}
                    onChange={e => setForm({ ...form, dueDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cor</label>
                  <input
                    className="form-input" type="color" value={form.color}
                    style={{ padding: 4, height: 42 }}
                    onChange={e => setForm({ ...form, color: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Observação</label>
                <input
                  className="form-input" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <p className="quick-add-note">
                {form.direction === 'OWE'
                  ? 'O quanto falta sai da soma das saídas que você marcar como pagamento desta dívida — aqui ou no formulário de lançamento.'
                  : 'O quanto falta sai da soma das entradas que você marcar como recebimento deste empréstimo. O dinheiro que saiu ao emprestar não é lançado automaticamente: registre como saída se quiser que ele apareça nas suas despesas.'}
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
