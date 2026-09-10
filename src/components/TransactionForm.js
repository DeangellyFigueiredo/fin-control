'use client';

import { useState } from 'react';
import { formatBRL } from '@/lib/utils';

/**
 * Formulário de lançamento, compartilhado pelo modal do dia e pelo botão
 * flutuante. Ficava embutido no DayDetail; extraído para os dois caminhos
 * não divergirem nas regras de investimento e de lançamento retroativo.
 *
 * `baseDate` é a data usada quando não é retroativo (o dia clicado, ou hoje).
 */
export default function TransactionForm({
  baseDate,
  maxDate,
  accounts = [],
  investments = [],
  onSaved,
  onCancel,
  autoFocus = true,
}) {
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
        date: form.isRetroactive && form.date ? form.date : baseDate,
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
    setSaving(false);

    // Avisa as telas abertas para recarregarem: o botão flutuante vive fora
    // delas e não teria como disparar o refetch de outro jeito.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fincontrol:transacao-salva'));
    }
    onSaved?.();
  };

  return (
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
            inputMode="decimal" autoFocus={autoFocus} placeholder="0,00"
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
          onChange={e => setForm({
            ...form,
            isRetroactive: e.target.checked,
            date: e.target.checked ? baseDate : '',
          })}
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
              max={maxDate || baseDate}
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
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Salvando...' : 'Lançar'}
        </button>
      </div>
    </form>
  );
}
