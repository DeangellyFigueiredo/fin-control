'use client';

import { useState } from 'react';
import FotoCampo from './FotoCampo';
import MoneyInput from '@/components/MoneyInput';
import { TRIP_CATEGORIES, isoDoDia, diaDe } from '@/lib/trips';
import { PERIODOS, PET, STATUS } from '@/lib/roteiro';

/**
 * Criar ou editar uma atividade. Trocar a data aqui é o "mover para outro
 * dia". Com hora, o período sai dela e os botões de período ficam travados.
 * `inicial` preenche uma atividade nova, como a que vem de uma sugestão da IA.
 */
export default function AtividadeForm({ tripId, trip, activity = null, dataInicial, inicial = null, onSaved, onCancel, onDelete }) {
  const editando = Boolean(activity);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => base(activity, inicial, dataInicial, trip));

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await fetch(`/api/trips/${tripId}/activities`, {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, id: activity?.id }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error || 'Erro ao salvar');
    onSaved?.(data);
  };

  const chips = (campo, opcoes) => (
    <div className="trip-chips">
      {Object.entries(opcoes).map(([id, label]) => (
        <button
          key={id} type="button"
          className={`filter-chip ${form[campo] === id ? 'active' : ''}`}
          onClick={() => set(campo, id)}
          disabled={campo === 'period' && Boolean(form.time)}
        >
          {typeof label === 'string' ? label : label.label}
        </button>
      ))}
    </div>
  );

  return (
    <form onSubmit={submit}>
      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">O que fazer</label>
          <input
            className="form-input" placeholder="Lago Negro, fondue, vinícola..."
            value={form.title} onChange={e => set('title', e.target.value)} required autoFocus={!editando}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Dia</label>
            <input
              type="date" className="form-input" value={form.date}
              min={isoDoDia(diaDe(trip.startDate))} max={isoDoDia(diaDe(trip.endDate))}
              onChange={e => set('date', e.target.value)} required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Hora (opcional)</label>
            <input type="time" className="form-input" value={form.time} onChange={e => set('time', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Período</label>
          {chips('period', PERIODOS)}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Lugar (opcional)</label>
            <input className="form-input" placeholder="Canela" value={form.place} onChange={e => set('place', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Custo estimado (R$)</label>
            <MoneyInput className="form-input" value={form.estimatedCost} onChange={e => set('estimatedCost', e.target.value)} placeholder="0,00" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Categoria</label>
          {chips('category', Object.fromEntries(TRIP_CATEGORIES.map(c => [c, c])))}
        </div>

        <div className="form-group">
          <label className="form-label">Cachorro</label>
          {chips('pet', PET)}
          {form.pet === 'NAO' && (
            <p className="quick-add-note" style={{ margin: '6px 0 0' }}>
              Vai aparecer o lembrete de planejar quem fica com ele.
            </p>
          )}
        </div>

        {editando && (
          <div className="form-group">
            <label className="form-label">Status</label>
            {chips('status', STATUS)}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Link (opcional)</label>
          <input className="form-input" type="url" placeholder="https://" value={form.link} onChange={e => set('link', e.target.value)} />
        </div>

        <FotoCampo
          valor={form}
          onChange={foto => setForm(f => ({ ...f, ...foto }))}
          buscaInicial={form.place ? `${form.title} ${form.place}` : form.title}
        />

        <div className="form-group">
          <label className="form-label">Notas</label>
          <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>

      <div className="modal-actions">
        {onDelete && (
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={saving} style={{ marginRight: 'auto' }}>
            Apagar
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : editando ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}

function base(activity, inicial, dataInicial, trip) {
  const a = activity || inicial || {};
  return {
    title: a.title || '',
    date: activity ? isoDoDia(diaDe(activity.date)) : dataInicial || isoDoDia(diaDe(trip.startDate)),
    time: a.time || '',
    period: a.period || 'MANHA',
    place: a.place || '',
    category: a.category || 'Passeios',
    estimatedCost: a.estimatedCost ? String(a.estimatedCost) : '',
    pet: a.pet || 'VERIFICAR',
    status: a.status || 'PLANEJADA',
    link: a.link || '',
    notes: a.notes || '',
    wikiTitle: a.wikiTitle || null,
    photoUrl: a.photoUrl || null,
    photoCredit: a.photoCredit || null,
    photoSourceUrl: a.photoSourceUrl || null,
  };
}
