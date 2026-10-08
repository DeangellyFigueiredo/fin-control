'use client';

import { useState } from 'react';
import { buscarLugar, lerCoordenadas } from '@/lib/lugares';
import { isoDoDia, diaDe } from '@/lib/trips';

/**
 * Criar ou editar uma parada. A cidade vem da lista de lugares.js; fora
 * dela, aceita as coordenadas coladas do Google Maps. O trecho é o caminho
 * ATÉ esta parada, feito no dia da chegada.
 */
export default function ParadaForm({ tripId, trip, stop = null, primeira = false, onSaved, onCancel, onDelete }) {
  const editando = Boolean(stop);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState(stop?.city || '');
  const [abrirLista, setAbrirLista] = useState(false);
  const [coordTexto, setCoordTexto] = useState(stop ? `${stop.lat}, ${stop.lng}` : '');
  const [form, setForm] = useState(() => ({
    city: stop?.city || '',
    uf: stop?.uf || '',
    lat: stop?.lat ?? '',
    lng: stop?.lng ?? '',
    date: stop ? isoDoDia(diaDe(stop.date)) : isoDoDia(diaDe(trip.startDate)),
    legKm: stop?.legKm ?? '',
    legHoras: stop?.legMinutes ? String(Math.floor(stop.legMinutes / 60)) : '',
    legMin: stop?.legMinutes ? String(stop.legMinutes % 60) : '',
    legNotes: stop?.legNotes || '',
    lodgingName: stop?.lodgingName || '',
    lodgingUrl: stop?.lodgingUrl || '',
    petPolicy: stop?.petPolicy || '',
    notes: stop?.notes || '',
  }));

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const sugestoes = abrirLista ? buscarLugar(busca) : [];

  const escolher = (l) => {
    setForm(f => ({ ...f, city: l.nome, uf: l.uf, lat: l.lat, lng: l.lng }));
    setBusca(l.nome);
    setCoordTexto(`${l.lat}, ${l.lng}`);
    setAbrirLista(false);
  };

  const colarCoordenadas = (texto) => {
    setCoordTexto(texto);
    const c = lerCoordenadas(texto);
    setForm(f => ({ ...f, lat: c ? c.lat : '', lng: c ? c.lng : '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const horas = parseInt(form.legHoras, 10) || 0;
    const minutos = parseInt(form.legMin, 10) || 0;
    const { legHoras, legMin, ...resto } = form;
    const body = {
      ...resto,
      city: form.city || busca.trim(),
      legMinutes: horas || minutos ? horas * 60 + minutos : '',
      id: stop?.id,
    };

    const res = await fetch(`/api/trips/${tripId}/stops`, {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error || 'Erro ao salvar');
    onSaved?.(data);
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-row">
          <div className="form-group roteiro-busca">
            <label className="form-label">Cidade</label>
            <input
              className="form-input" placeholder="Gramado, Bento Gonçalves..." autoComplete="off"
              value={busca} autoFocus={!editando}
              onChange={e => { setBusca(e.target.value); set('city', ''); setAbrirLista(true); }}
              onFocus={() => setAbrirLista(true)}
              onBlur={() => setTimeout(() => setAbrirLista(false), 150)}
              required
            />
            {sugestoes.length > 0 && (
              <ul className="roteiro-sugestoes" role="listbox">
                {sugestoes.map(l => (
                  <li key={`${l.nome}-${l.uf}`}>
                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => escolher(l)}>
                      {l.nome} <span>{l.uf}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">{primeira ? 'Saída' : 'Chegada'}</label>
            <input
              type="date" className="form-input" value={form.date}
              min={isoDoDia(diaDe(trip.startDate))} max={isoDoDia(diaDe(trip.endDate))}
              onChange={e => set('date', e.target.value)} required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Coordenadas</label>
          <input
            className="form-input" placeholder="-29.38, -50.87" inputMode="decimal"
            value={coordTexto} onChange={e => colarCoordenadas(e.target.value)}
          />
          <p className="quick-add-note" style={{ margin: '6px 0 0' }}>
            Preenche sozinho ao escolher a cidade. Fora da lista, cole do Google Maps
            (clique com o botão direito no lugar).
          </p>
        </div>

        {!primeira && (
          <fieldset className="roteiro-fieldset">
            <legend>Trecho até aqui</legend>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Distância (km)</label>
                <input className="form-input" inputMode="decimal" value={form.legKm} onChange={e => set('legKm', e.target.value)} placeholder="110" />
              </div>
              <div className="form-group">
                <label className="form-label">Tempo de estrada</label>
                <div className="roteiro-duracao">
                  <input className="form-input" inputMode="numeric" value={form.legHoras} onChange={e => set('legHoras', e.target.value)} placeholder="2" aria-label="Horas" />
                  <span>h</span>
                  <input className="form-input" inputMode="numeric" value={form.legMin} onChange={e => set('legMin', e.target.value)} placeholder="00" aria-label="Minutos" />
                  <span>min</span>
                </div>
              </div>
            </div>
            <input
              className="form-input" placeholder="Pedágio, parada para almoço, estrada de serra..."
              value={form.legNotes} onChange={e => set('legNotes', e.target.value)}
            />
          </fieldset>
        )}

        {!primeira && (
          <fieldset className="roteiro-fieldset">
            <legend>Hospedagem</legend>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="form-input" value={form.lodgingName} onChange={e => set('lodgingName', e.target.value)} placeholder="Pousada..." />
              </div>
              <div className="form-group">
                <label className="form-label">Link</label>
                <input className="form-input" type="url" value={form.lodgingUrl} onChange={e => set('lodgingUrl', e.target.value)} placeholder="https://" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Política para o pet</label>
              <input
                className="form-input" value={form.petPolicy} onChange={e => set('petPolicy', e.target.value)}
                placeholder="Taxa, porte, se pode ficar sozinho no quarto..."
              />
            </div>
          </fieldset>
        )}

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
          {saving ? 'Salvando...' : editando ? 'Salvar' : 'Adicionar parada'}
        </button>
      </div>
    </form>
  );
}
