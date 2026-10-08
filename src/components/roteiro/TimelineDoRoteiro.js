'use client';

import { useRef } from 'react';
import Icon from '@/components/Icon';
import { formatBRL } from '@/lib/utils';
import { PERIODOS, PET } from '@/lib/roteiro';
import { diaCurto, trechoTexto, noitesTexto } from './formato';
import { useNumeroAnimado, useRevelarEmCascata } from './movimento';

function Valor({ valor }) {
  return <>{formatBRL(useNumeroAnimado(valor))}</>;
}

/** "Cambará do Sul → Gramado" no dia de troca, só a cidade nos outros. */
function ondeTexto(d) {
  if (!d.noite) return 'Antes da primeira parada';
  if (!d.trechos.length) return d.noite.city;
  return [d.trechos[0].de.city, ...d.trechos.map(t => t.para.city)].join(' → ');
}

function Atividade({ a, primeira, ultima, onAlternar, onPular, onMover, onEditar }) {
  const feita = a.status === 'FEITA';
  const pulada = a.status === 'PULADA';
  const meta = [a.time, a.place, a.estimatedCost > 0 && `est. ${formatBRL(a.estimatedCost)}`, a.gasto !== 0 && `gasto ${formatBRL(a.gasto)}`]
    .filter(Boolean);

  return (
    <li className={`roteiro-ativ ${feita ? 'feita' : ''} ${pulada ? 'pulada' : ''}`}>
      <button
        type="button" className="roteiro-check" onClick={() => onAlternar(a)}
        aria-pressed={feita} aria-label={feita ? `Desmarcar ${a.title}` : `Marcar ${a.title} como feita`}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><polyline points="5 10.5 8.5 14 15 6.5" /></svg>
      </button>

      <button type="button" className="roteiro-ativ-info" onClick={() => onEditar(a)}>
        <span className="roteiro-ativ-titulo">{a.title}</span>
        {meta.length > 0 && <span className="roteiro-ativ-meta">{meta.join(' · ')}</span>}
        {a.pet === 'NAO' && !pulada && (
          <span className="roteiro-aviso-pet"><Icon name="pet" /> Planejar quem fica com o cachorro</span>
        )}
      </button>

      <span className={`roteiro-pet pet-${a.pet.toLowerCase()}`} title={PET[a.pet].label} aria-label={PET[a.pet].label}>
        <Icon name="pet" />
        {a.pet === 'NAO' && <i aria-hidden="true" />}
      </span>

      <div className="roteiro-ativ-acoes">
        <button type="button" onClick={() => onMover(a, -1)} disabled={primeira} aria-label="Subir"><Icon name="subir" /></button>
        <button type="button" onClick={() => onMover(a, 1)} disabled={ultima} aria-label="Descer"><Icon name="descer" /></button>
        <button type="button" onClick={() => onPular(a)} aria-pressed={pulada} aria-label={pulada ? 'Voltar a planejar' : 'Pular'}>
          <Icon name="pular" />
        </button>
      </div>
    </li>
  );
}

/**
 * Um cartão por dia: onde, trecho, atividades por período, estimado e
 * gasto. Os cartões entram em cascata na rolagem; o de hoje fica em
 * destaque. `destaque.dias` acende os dias da parada sob o mouse no mapa.
 */
export default function TimelineDoRoteiro({
  dias, cores, hojeISO, limiteDia, destaque, onFoco,
  onNovaAtividade, onEditarAtividade, onAlternarStatus, onPular, onMover, onNovoGasto,
}) {
  const ref = useRef(null);
  useRevelarEmCascata(ref, [dias.length]);

  return (
    <ol className="roteiro-timeline" ref={ref}>
      {dias.map(d => {
        const hoje = d.data === hojeISO;
        const passou = d.data < hojeISO;
        const cor = d.noite ? cores[d.noite.id] : undefined;
        const chegouHoje = d.trechos.length > 0 && d.noite?.lodgingName && d.noite.tipo !== 'fim';
        const base = Math.max(limiteDia, d.gasto, 1);

        return (
          <li
            key={d.data}
            id={`dia-${d.data}`}
            data-revelar
            className={[
              'roteiro-dia',
              hoje && 'hoje',
              passou && 'passou',
              destaque.dias.has(d.data) && 'focado',
            ].filter(Boolean).join(' ')}
            style={{ '--cor': cor }}
            onMouseEnter={() => onFoco({ tipo: 'dia', data: d.data })}
            onMouseLeave={() => onFoco(null)}
            onFocus={() => onFoco({ tipo: 'dia', data: d.data })}
          >
            <span className="roteiro-dia-ponto" aria-hidden="true" />
            <article className="card roteiro-dia-card">
              <header className="roteiro-dia-head">
                <div className="roteiro-dia-num">D{d.numero}</div>
                <div className="roteiro-dia-titulo">
                  <div className="roteiro-dia-data">
                    {diaCurto(d.data)}
                    {hoje && <span className="roteiro-selo selo-hoje">hoje</span>}
                  </div>
                  <div className="roteiro-dia-onde">{ondeTexto(d)}</div>
                </div>
                <div className="roteiro-dia-selos">
                  {d.trechos.map(t => trechoTexto(t) && (
                    <span key={t.para.id} className="roteiro-selo selo-estrada"><Icon name="carro" /> {trechoTexto(t)}</span>
                  ))}
                  {d.pesado && <span className="roteiro-selo selo-pesado">dia pesado</span>}
                </div>
              </header>

              {chegouHoje && (
                <div className="roteiro-hospedagem">
                  <Icon name="hospedagem" />
                  <span>
                    {d.noite.lodgingName}
                    {d.noite.noites > 0 && <> · {noitesTexto(d.noite.noites)}</>}
                  </span>
                  {d.noite.lodgingUrl && (
                    <a href={d.noite.lodgingUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir hospedagem">
                      <Icon name="link" />
                    </a>
                  )}
                </div>
              )}

              {d.atividades.length === 0 ? (
                <p className="roteiro-vazio">Dia livre.</p>
              ) : (
                Object.entries(PERIODOS).map(([p, label]) => {
                  const lista = d.porPeriodo[p];
                  if (!lista.length) return null;
                  return (
                    <section key={p} className="roteiro-periodo">
                      <h4>{label}</h4>
                      <ul>
                        {lista.map((a, i) => (
                          <Atividade
                            key={a.id} a={a} primeira={i === 0} ultima={i === lista.length - 1}
                            onAlternar={onAlternarStatus} onPular={onPular}
                            onMover={(x, dir) => onMover(x, dir, lista)} onEditar={onEditarAtividade}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}

              <footer className="roteiro-dia-rodape">
                <div className="roteiro-dia-gasto">
                  <div>
                    <strong><Valor valor={d.gasto} /></strong>
                    <span> de {formatBRL(limiteDia)} do dia</span>
                    {d.estimado > 0 && <span> · estimado {formatBRL(d.estimado)}</span>}
                  </div>
                  <div className="roteiro-dia-barra" aria-hidden="true">
                    <div
                      className={d.gasto > limiteDia ? 'estourou' : ''}
                      style={{ transform: `scaleX(${Math.max(d.gasto, 0) / base})` }}
                    />
                    {d.estimado > 0 && <i style={{ left: `${Math.min(d.estimado / base, 1) * 100}%` }} title="Estimado" />}
                  </div>
                </div>
                <div className="roteiro-dia-botoes">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNovaAtividade(d.data)}>
                    <Icon name="adicionar" /> Atividade
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onNovoGasto(d.data)}>
                    <Icon name="adicionar" /> Gasto
                  </button>
                </div>
              </footer>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
