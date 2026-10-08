'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { analisarRoteiro, aplicarCorrecoes, corrigiveis } from '@/lib/importacao';
import { estadias, diasDoRoteiro } from '@/lib/roteiro';
import MapaDaRota from './MapaDaRota';
import { coresDasParadas, diaCurto, noitesTexto, trechoTexto } from './formato';

const SEM_DESTAQUE = { dias: new Set(), paradas: new Set(), trechos: new Set() };
const nada = () => {};

/** Erros agrupados pelo item, na ordem em que aparecem no JSON. */
function agrupar(erros) {
  const grupos = new Map();
  for (const e of erros) {
    if (!grupos.has(e.alvo)) grupos.set(e.alvo, []);
    grupos.get(e.alvo).push(e);
  }
  return [...grupos.entries()];
}

function textoDaCorrecao(c) {
  if (c.tipo === 'remover') return 'remover';
  if (c.tipo === 'renomear') return `renomear para "${c.para}"`;
  return `trocar por "${c.para}"`;
}

/**
 * Importar roteiro em duas etapas. Ver docs/rfc/0004-roteiro-inteligente.md.
 *
 * Colar: a análise roda enquanto se digita e mostra todos os erros de uma
 * vez, com as correções que ela sabe fazer. Conferir: o roteiro como vai
 * ficar (mapa, cidades, dias) antes de gravar. O servidor analisa de novo ao
 * confirmar.
 */
export default function ImportarRoteiro({ tripId, trip, onSaved, onCancel }) {
  const [texto, setTexto] = useState('');
  const [etapa, setEtapa] = useState('colar');
  const [salvando, setSalvando] = useState(false);
  const [erroServidor, setErroServidor] = useState(null);

  // A análise acompanha o texto sem travar a digitação de um JSON grande
  const adiado = useDeferredValue(texto);
  const analise = useMemo(() => (adiado.trim() ? analisarRoteiro(adiado, trip) : null), [adiado, trip]);
  const nCorrigiveis = analise ? corrigiveis(analise) : 0;

  const corrigir = () => {
    const novo = aplicarCorrecoes(analise.json, analise);
    setTexto(JSON.stringify(novo, null, 2));
  };

  const confirmar = async () => {
    setErroServidor(null);
    setSalvando(true);
    const res = await fetch(`/api/trips/${tripId}/itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analise.json),
    });
    const data = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) {
      setErroServidor(data.error || 'Erro ao importar');
      if (data.erros) setEtapa('colar');
      return;
    }
    onSaved();
  };

  if (etapa === 'conferir' && analise?.data) {
    return (
      <Conferir
        trip={trip} analise={analise} erroServidor={erroServidor} salvando={salvando}
        onVoltar={() => setEtapa('colar')} onConfirmar={confirmar}
      />
    );
  }

  return (
    <div className="importar">
      {erroServidor && <div className="login-error" style={{ marginBottom: 12 }}>{erroServidor}</div>}
      <p className="quick-add-note" style={{ marginTop: 0 }}>
        Cole um JSON com <code>stops</code> e <code>activities</code>. Os problemas aparecem
        aqui embaixo enquanto você cola; nada é gravado antes de conferir.
      </p>
      <textarea
        className="form-input roteiro-importar" rows={12} value={texto}
        onChange={e => { setTexto(e.target.value); setErroServidor(null); }}
        placeholder={'{\n  "stops": [{ "city": "Gramado", "uf": "RS", "lat": -29.38, "lng": -50.87, "date": "2026-12-13", "legKm": 110 }],\n  "activities": [{ "title": "Lago Negro", "date": "2026-12-14", "period": "MANHA", "category": "Passeios", "pet": "SIM" }]\n}'}
        spellCheck={false} aria-label="JSON do roteiro"
      />

      {analise && (
        <div className="importar-analise" aria-live="polite">
          <div className="importar-resumo">
            {analise.erros.length ? (
              <span className="importar-ruim">
                <Icon name="atencao" /> {analise.erros.length} {analise.erros.length === 1 ? 'problema' : 'problemas'}
                {nCorrigiveis > 0 && <> · {nCorrigiveis === analise.erros.length ? 'todos' : nCorrigiveis} com correção</>}
              </span>
            ) : (
              <span className="importar-bom"><Icon name="concluir" /> Tudo certo para conferir</span>
            )}
            {analise.avisos.length > 0 && <span> · {analise.avisos.length} {analise.avisos.length === 1 ? 'aviso' : 'avisos'}</span>}
            {nCorrigiveis > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={corrigir}>
                Aplicar {nCorrigiveis === 1 ? 'a correção' : `${nCorrigiveis} correções`}
              </button>
            )}
          </div>

          {analise.erros.length > 0 && (
            <ul className="importar-lista">
              {agrupar(analise.erros).map(([alvo, lista]) => (
                <li key={alvo}>
                  <strong>{alvo}</strong>
                  <ul>
                    {lista.map((e, i) => (
                      <li key={i}>
                        {e.mensagem}
                        {e.correcao && <span className="importar-correcao"> → {textoDaCorrecao(e.correcao)}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {analise.avisos.length > 0 && (
            <ul className="importar-lista importar-avisos">
              {analise.avisos.map((v, i) => <li key={i}><strong>{v.alvo}</strong> {v.mensagem}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button
          type="button" className="btn btn-primary"
          disabled={!analise?.data} onClick={() => setEtapa('conferir')}
        >
          Conferir <Icon name="proximo" />
        </button>
      </div>
    </div>
  );
}

/** O roteiro como vai ficar, montado com as mesmas funções da aba Roteiro. */
function Conferir({ trip, analise, erroServidor, salvando, onVoltar, onConfirmar }) {
  const { stops, activities } = analise.data;
  // Ids provisórios: o mapa e os dias se referem às paradas por id
  const comId = useMemo(() => ({
    stops: stops.map((s, i) => ({ ...s, id: `previa-s${i}` })),
    activities: activities.map((a, i) => ({ ...a, id: `previa-a${i}`, status: a.status || 'PLANEJADA' })),
  }), [stops, activities]);
  const lista = useMemo(() => estadias(comId.stops), [comId]);
  const cores = useMemo(() => coresDasParadas(lista), [lista]);
  const dias = useMemo(() => diasDoRoteiro(trip, comId.stops, comId.activities, []), [trip, comId]);
  const kmTotal = lista.reduce((s, x) => s + (x.indice > 0 ? x.legKm || 0 : 0), 0);

  return (
    <div className="importar">
      {erroServidor && <div className="login-error" style={{ marginBottom: 12 }}>{erroServidor}</div>}
      <p className="quick-add-note" style={{ marginTop: 0 }}>
        {lista.length} {lista.length === 1 ? 'parada' : 'paradas'} · {activities.length} {activities.length === 1 ? 'atividade' : 'atividades'}
        {kmTotal > 0 && <> · {Math.round(kmTotal)} km de estrada informados</>}
      </p>

      <MapaDaRota
        estadias={lista} dias={dias} cores={cores} hojeISO="0000-01-01"
        destaque={SEM_DESTAQUE} onFoco={nada} onEditarParada={nada}
      />

      <div className="importar-blocos">
        {lista.map(s => (
          <span key={s.id} className="roteiro-parada-chip" style={{ '--cor': cores[s.id] }}>
            <i aria-hidden="true" />
            {s.city}
            <span>
              {s.tipo === 'origem' ? 'saída' : s.tipo === 'fim' ? 'chegada' : s.tipo === 'passagem' ? 'passagem' : noitesTexto(s.noites)}
            </span>
          </span>
        ))}
      </div>

      <ol className="importar-dias">
        {dias.map(d => (
          <li key={d.data} style={{ '--cor': d.noite ? cores[d.noite.id] : undefined }}>
            <div className="importar-dia-cabeca">
              <strong>D{d.numero}</strong>
              <span>{diaCurto(d.data)}</span>
              <span className="importar-dia-onde">
                {d.trechos.length
                  ? [d.trechos[0].de.city, ...d.trechos.map(t => t.para.city)].join(' → ')
                  : d.noite?.city || 'sem parada'}
              </span>
              {d.trechos.map(t => trechoTexto(t) && <span key={t.para.id} className="roteiro-selo selo-estrada">{trechoTexto(t)}</span>)}
            </div>
            {d.atividades.length > 0 && (
              <p>{d.atividades.map(a => `${a.time ? `${a.time} ` : ''}${a.title}`).join(' · ')}</p>
            )}
          </li>
        ))}
      </ol>

      {analise.avisos.length > 0 && (
        <ul className="importar-lista importar-avisos">
          {analise.avisos.map((v, i) => <li key={i}><strong>{v.alvo}</strong> {v.mensagem}</li>)}
        </ul>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onVoltar} disabled={salvando}>
          <Icon name="anterior" /> Voltar e editar
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirmar} disabled={salvando}>
          {salvando ? 'Importando...' : 'Confirmar importação'}
        </button>
      </div>
    </div>
  );
}
