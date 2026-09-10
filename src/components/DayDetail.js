'use client';

import { useState } from 'react';
import { formatBRL } from '@/lib/utils';

const KIND_BADGE = {
  tx: { label: 'Lançado', className: 'badge-real' },
  recurring: { label: 'Previsto', className: 'badge-planned' },
  card: { label: 'Fatura', className: 'badge-card' },
};

const CARD_MARKER_LABEL = {
  opening: 'Abertura da fatura',
  due: 'Vencimento da fatura',
  payment: 'Pagamento da fatura',
};

/** Modal com tudo que acontece num dia, e o lançamento rápido. */
export default function DayDetail({ day, accounts = [], investments = [], onClose, onSaved }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    type: 'EXPENSE',
    amount: '',
    description: '',
    bankAccountId: accounts[0]?.id || '',
    investmentId: investments[0]?.id || '',
    isRetroactive: false,
    date: '',
  });

  if (!day) return null;

  const [y, m, d] = day.date.split('-');
  const income = day.income + day.plannedIncome;
  const expense = day.expense + day.plannedExpense;
  const invested = day.investment || 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.bankAccountId) {
      setError('Cadastre uma conta bancária antes de lançar');
      return;
    }
    if (!(parseFloat(form.amount) > 0)) {
      setError('Informe um valor maior que zero');
      return;
    }
    if (form.type === 'INVESTMENT' && !form.investmentId) {
      setError('Escolha em qual investimento aportar');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: form.isRetroactive && form.date ? form.date : day.date,
        amount: form.amount,
        type: form.type,
        description: form.description,
        bankAccountId: form.bankAccountId,
        investmentId: form.type === 'INVESTMENT' ? form.investmentId : null,
        isRetroactive: form.isRetroactive,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Erro ao lançar');
      setSaving(false);
      return;
    }

    setForm({ ...form, amount: '', description: '', isRetroactive: false, date: '' });
    setAdding(false);
    setSaving(false);
    onSaved?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{d}/{m}/{y}</div>
            <div className="page-subtitle" style={{ marginTop: 2 }}>
              {day.items.length} {day.items.length === 1 ? 'lançamento' : 'lançamentos'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="day-totals">
          <div>
            <div className="stat-label">Entradas</div>
            <div className="stat-value positive" style={{ fontSize: '1.15rem' }}>{formatBRL(income)}</div>
          </div>
          <div>
            <div className="stat-label">Saídas</div>
            <div className="stat-value negative" style={{ fontSize: '1.15rem' }}>{formatBRL(expense)}</div>
          </div>
          {invested > 0 && (
            <div>
              <div className="stat-label">Investido</div>
              <div className="stat-value investment-text" style={{ fontSize: '1.15rem' }}>{formatBRL(invested)}</div>
            </div>
          )}
          <div>
            <div className="stat-label">Saldo acumulado</div>
            <div className={`stat-value ${day.balance >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '1.15rem' }}>
              {formatBRL(day.balance ?? income - expense)}
            </div>
          </div>
        </div>

        {day.cardMarkers.length > 0 && (
          <div className="day-markers">
            {day.cardMarkers.map((marker, i) => (
              <span key={i} className="card-chip" style={{ '--marker-color': marker.color }}>
                {marker.icon} {CARD_MARKER_LABEL[marker.subtype]} · {marker.name}
              </span>
            ))}
          </div>
        )}

        {/* Lançamento rápido */}
        {adding ? (
          <form className="quick-add" onSubmit={submit}>
            {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="type-toggle type-toggle-3" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={form.type === 'INCOME' ? 'active-income' : ''}
                onClick={() => setForm({ ...form, type: 'INCOME' })}
              >
                Entrada
              </button>
              <button
                type="button"
                className={form.type === 'EXPENSE' ? 'active-expense' : ''}
                onClick={() => setForm({ ...form, type: 'EXPENSE' })}
              >
                Saída
              </button>
              <button
                type="button"
                className={form.type === 'INVESTMENT' ? 'active-investment' : ''}
                onClick={() => setForm({ ...form, type: 'INVESTMENT' })}
              >
                Investimento
              </button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Valor</label>
                <input
                  className="form-input" type="number" step="0.01" min="0.01"
                  inputMode="decimal" autoFocus placeholder="0,00"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Descrição</label>
                <input
                  className="form-input" placeholder="Freela, luz, mercado..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            {form.type === 'INVESTMENT' && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Somar em qual investimento</label>
                {investments.length === 0 ? (
                  <p className="quick-add-note">
                    Nenhum investimento cadastrado. Crie um em Investimentos para poder aportar.
                  </p>
                ) : (
                  <select
                    className="form-select"
                    value={form.investmentId}
                    onChange={e => setForm({ ...form, investmentId: e.target.value })}
                  >
                    {investments.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.name} · {formatBRL(i.currentValue)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <label className="switch-label" style={{ marginTop: 14 }}>
              <input
                type="checkbox"
                checked={form.isRetroactive}
                onChange={e => setForm({ ...form, isRetroactive: e.target.checked, date: e.target.checked ? day.date : '' })}
              />
              Estou lançando retroativo
            </label>

            {form.isRetroactive && (
              <>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label className="form-label">Data do lançamento</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.date}
                    max={day.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                {form.type === 'INVESTMENT' && (
                  <p className="quick-add-note">
                    O aporte entra no histórico e sai do saldo daquele dia, mas não soma
                    no valor atual do investimento — ele já reflete esse aporte.
                  </p>
                )}
              </>
            )}

            {accounts.length > 1 && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Conta</label>
                <select
                  className="form-select"
                  value={form.bankAccountId}
                  onChange={e => setForm({ ...form, bankAccountId: e.target.value })}
                >
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(false)} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Salvando...' : 'Lançar'}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-primary quick-add-open" onClick={() => setAdding(true)}>
            + Adicionar lançamento
          </button>
        )}

        <div style={{ marginTop: 8 }}>
          {day.items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🗓️</div>
              <p className="empty-state-text">Nenhuma movimentação neste dia</p>
            </div>
          ) : (
            day.items.map(item => {
              const badge = KIND_BADGE[item.kind];
              return (
                <div key={item.id} className="transaction-item">
                  <div className={`transaction-icon ${item.type === 'INCOME' ? 'income' : item.type === 'INVESTMENT' ? 'investment' : 'expense'}`}>
                    {item.type === 'INVESTMENT'
                      ? '📈'
                      : item.category?.icon || item.card?.icon || (item.type === 'INCOME' ? '💰' : '💸')}
                  </div>
                  <div className="transaction-info">
                    <div className="transaction-desc">{item.description}</div>
                    <div className="transaction-meta">
                      <span className={`kind-badge ${badge.className}`}>{badge.label}</span>
                      {item.isRetroactive && <span className="kind-badge badge-retro">Retroativo</span>}
                      {item.account && <span>{item.account.name}</span>}
                      {item.investment && <span>→ {item.investment.name}</span>}
                      {item.category && <span>{item.category.name}</span>}
                    </div>
                  </div>
                  <div className={`transaction-amount ${item.type === 'INCOME' ? 'amount-income' : item.type === 'INVESTMENT' ? 'amount-investment' : 'amount-expense'}`}>
                    {item.type === 'INCOME' ? '+' : '-'}{formatBRL(item.amount)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
