'use client';

import { useState } from 'react';
import MoneyInput from '@/components/MoneyInput';
import { isoDoDia, diaDe } from '@/lib/trips';

/** Criar ou editar uma viagem: nome, datas, orçamento e reserva de preparação. */
export default function TripForm({ trip = null, onSaved, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    name: trip?.name || '',
    startDate: trip ? isoDoDia(diaDe(trip.startDate)) : '',
    endDate: trip ? isoDoDia(diaDe(trip.endDate)) : '',
    budget: trip ? String(trip.budget) : '',
    prepBudget: trip?.prepBudget ? String(trip.prepBudget) : '',
  }));

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch(trip ? `/api/trips/${trip.id}` : '/api/trips', {
      method: trip ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) return setError(data.error || 'Erro ao salvar');
    onSaved?.(data);
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="form-group">
          <label className="form-label">Nome</label>
          <input
            className="form-input" placeholder="Salvador, férias de julho..."
            value={form.name} onChange={e => set('name', e.target.value)} required autoFocus
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ida</label>
            <input type="date" className="form-input" value={form.startDate} onChange={e => set('startDate', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Volta</label>
            <input
              type="date" className="form-input" value={form.endDate} min={form.startDate || undefined}
              onChange={e => set('endDate', e.target.value)} required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Orçamento total (R$)</label>
            <MoneyInput className="form-input" value={form.budget} onChange={e => set('budget', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Reservado para passagem e hotel (R$)</label>
            <MoneyInput className="form-input" value={form.prepBudget} onChange={e => set('prepBudget', e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <p className="quick-add-note" style={{ margin: 0 }}>
          O limite por dia usa só o que sobra da reserva. Enquanto a passagem não é
          comprada, ele já desconta o valor reservado para ela.
        </p>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : trip ? 'Salvar' : 'Criar viagem'}
        </button>
      </div>
    </form>
  );
}
