'use client';

import { useState, useEffect, useCallback } from 'react';
import TransactionForm from '@/components/TransactionForm';
import { formatBRL, formatDate, todayISO } from '@/lib/utils';

const vazia = () => ({
  name: '', creditor: '', originalAmount: '', startDate: todayISO(),
  dueDate: '', icon: '🤝', color: '#e66767', notes: '', isSettled: false,
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
      creditor: debt.creditor || '',
      originalAmount: String(debt.originalAmount),
      startDate: debt.startDate ? debt.startDate.slice(0, 10) : '',
      dueDate: debt.dueDate ? debt.dueDate.slice(0, 10) : '',
      icon: debt.icon,
      color: debt.color,
      notes: debt.notes || '',
      isSettled: debt.isSettled,
    } : vazia());
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

  const abertas = debts.filter(d => !d.quitada);
  const quitadas = debts.filter(d => d.quitada);
  const totalDevido = abertas.reduce((s, d) => s + d.restante, 0);
  const totalPago = debts.reduce((s, d) => s + d.pago, 0);
  const mediaMensal = abertas.reduce((s, d) => s + d.mediaMensal, 0);

  if (firstLoad) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Dívidas</h1></div>
        <div className="card"><div className="skeleton" style={{ height: 260 }} /></div>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dívidas</h1>
          <p className="page-subtitle">
            Dinheiro que você pegou emprestado, com pagamentos no ritmo que der
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => abrirForm(null)}>+ Nova dívida</button>
      </div>

      <div className="stat-cards">
        <div className="card stat-card expense">
          <div className="stat-label">Ainda devo</div>
          <div className="stat-value negative">{formatBRL(totalDevido)}</div>
          <div className="stat-change">{abertas.length} em aberto</div>
        </div>
        <div className="card stat-card income">
          <div className="stat-label">Já paguei</div>
          <div className="stat-value positive">{formatBRL(totalPago)}</div>
        </div>
        <div className="card stat-card balance">
          <div className="stat-label">Ritmo atual</div>
          <div className="stat-value">{formatBRL(mediaMensal)}</div>
          <div className="stat-change">média por mês</div>
        </div>
        <div className="card stat-card variation">
          <div className="stat-label">Quitadas</div>
          <div className="stat-value">{quitadas.length}</div>
        </div>
      </div>

      {debts.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">🤝</div>
          <p className="empty-state-text">
            Nenhuma dívida cadastrada. Cadastre uma e marque os pagamentos conforme for pagando.
          </p>
          <button className="btn btn-primary" onClick={() => abrirForm(null)}>Cadastrar dívida</button>
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
                        {debt.creditor && <span>com {debt.creditor}</span>}
                        {debt.dueDate && <span>prazo {formatDate(debt.dueDate)}</span>}
                        {debt.quitada && <span className="kind-badge badge-real">Quitada</span>}
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
                    <div className="stat-label">Pago</div>
                    <div className="footer-value amount-income">{formatBRL(debt.pago)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Falta</div>
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
                  <span>{debt.progresso.toFixed(0)}% pago</span>
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
                        {debt.totalPagamentos} pagamento(s) em {debt.mesesComPagamento} mês(es)
                        {debt.mesesSemPagamento > 0 && ` · ${debt.mesesSemPagamento} sem pagar`}
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
                      {payingId === debt.id ? 'Cancelar' : '💸 Registrar pagamento'}
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
                        <span className="amount-expense">{formatBRL(p.amount)}</span>
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
              <div className="modal-title">{editingId ? 'Editar dívida' : 'Nova dívida'}</div>
              <button type="button" className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>

            {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input
                    className="form-input" required value={form.name}
                    placeholder="Empréstimo para a reforma"
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
                  <label className="form-label">Com quem</label>
                  <input
                    className="form-input" value={form.creditor} placeholder="João"
                    onChange={e => setForm({ ...form, creditor: e.target.value })}
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
                  <label className="form-label">Peguei em</label>
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
                O quanto falta é calculado somando os pagamentos que você marcar como
                sendo desta dívida — aqui ou no formulário de lançamento.
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
