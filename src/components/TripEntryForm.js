'use client';

import { useState } from 'react';
import MoneyInput from '@/components/MoneyInput';
import { TRIP_CATEGORIES, TRIP_METHODS, isoDoDia, diaDe } from '@/lib/trips';
import { todayISO } from '@/lib/utils';

/**
 * Formulário de gasto da viagem, usado na tela da viagem e no botão
 * flutuante enquanto ela está em andamento.
 *
 * A data é livre, não só "hoje": passagem e hotel quase sempre são pagos
 * semanas antes, e entram como preparação.
 *
 * Na edição, a forma de pagamento fica travada. Trocar de Conta para Cartão
 * exigiria apagar o lançamento na conta; apagar e lançar de novo deixa isso
 * explícito.
 */
export default function TripEntryForm({ tripId, accounts = [], entry = null, onSaved, onCancel, onDelete, autoFocus = true }) {
  const editando = Boolean(entry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    type: entry?.type || 'EXPENSE',
    amount: entry ? String(entry.amount) : '',
    description: entry?.description || '',
    category: entry?.category || '',
    method: entry?.method || 'CARTAO',
    bankAccountId: accounts[0]?.id || '',
    date: entry ? isoDoDia(diaDe(entry.date)) : todayISO(),
  }));

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!(parseFloat(form.amount) > 0)) return setError('Informe um valor maior que zero');
    if (!form.category) return setError('Escolha uma categoria');
    if (!editando && form.method === 'CONTA' && !form.bankAccountId) {
      return setError('Cadastre uma conta bancária antes de lançar pela conta');
    }

    setSaving(true);
    const res = await fetch(`/api/trips/${tripId}/entries`, {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, id: entry?.id }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Erro ao salvar');
      setSaving(false);
      return;
    }

    setSaving(false);
    // Um gasto na Conta também é um lançamento: o dashboard e o extrato
    // abertos precisam recarregar, igual ao lançamento comum.
    window.dispatchEvent(new CustomEvent('fincontrol:transacao-salva'));
    onSaved?.(await res.json());
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="type-toggle" style={{ marginBottom: 12 }}>
        <button type="button" className={form.type === 'EXPENSE' ? 'active-expense' : ''} onClick={() => set('type', 'EXPENSE')}>
          Gasto
        </button>
        <button type="button" className={form.type === 'INCOME' ? 'active-income' : ''} onClick={() => set('type', 'INCOME')}>
          Reembolso
        </button>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Valor</label>
          <MoneyInput
            className="form-input"
            inputMode="decimal" autoFocus={autoFocus} placeholder="0,00"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <input
            className="form-input" placeholder="Jantar, Uber, ingresso..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">Categoria</label>
        <div className="trip-chips">
          {TRIP_CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              className={`filter-chip ${form.category === c ? 'active' : ''}`}
              onClick={() => set('category', c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">Como foi pago</label>
        {editando ? (
          <p className="quick-add-note" style={{ margin: 0 }}>
            {TRIP_METHODS[form.method]?.label}. Para trocar, apague e lance de novo.
          </p>
        ) : (
          <>
            <div className="trip-chips">
              {Object.entries(TRIP_METHODS).map(([id, m]) => (
                <button
                  key={id}
                  type="button"
                  className={`filter-chip ${form.method === id ? 'active' : ''}`}
                  onClick={() => set('method', id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="quick-add-note" style={{ marginTop: 6 }}>{TRIP_METHODS[form.method].hint}</p>
          </>
        )}
      </div>

      {!editando && form.method === 'CONTA' && accounts.length > 1 && (
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Conta</label>
          <select className="form-select" value={form.bankAccountId} onChange={e => set('bankAccountId', e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}

      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">Data</label>
        <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
      </div>

      <div className="modal-actions" style={{ marginTop: 16 }}>
        {onDelete && (
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={saving} style={{ marginRight: 'auto' }}>
            Apagar
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Salvando...' : editando ? 'Salvar' : 'Lançar'}
        </button>
      </div>
    </form>
  );
}
