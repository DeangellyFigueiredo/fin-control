'use client';

import { useEffect, useRef, useState, ViewTransition } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import { formatBRL } from '@/lib/utils';
import { PET } from '@/lib/roteiro';
import TimelineDoRoteiro from './TimelineDoRoteiro';
import { datasDoBloco, rotuloDoBloco } from './BlocosDoRoteiro';
import { COR_CASA } from './formato';
import { Foto, useFoto, usePaginaWiki } from './fotos';
import { ClimaDoPeriodo } from './Clima';
import ComoChegar from './ComoChegar';
import Sugestoes from './Sugestoes';

/**
 * Detalhe de um bloco: como se chega, onde se dorme e os dias da cidade.
 * Painel lateral no desktop, tela cheia no celular. Ver
 * docs/rfc/0004-roteiro-inteligente.md.
 *
 * Fica abaixo dos modais (z-index 450 contra 500): editar uma atividade
 * daqui abre o formulário por cima do painel, e o Esc fecha só o modal.
 */
export default function DetalheDoBloco({
  bloco, cores, hojeISO, limiteDia, destaque, onFoco, onFechar, onEditarParada, clima, climaPorDia,
  trip, altitudes = {}, onAtualizarRota, onUsarFolga, onAdicionarSugestao,
  onNovaAtividade, onEditarAtividade, onAlternarStatus, onPular, onMover, onNovoGasto,
}) {
  const [montado, setMontado] = useState(false);
  const fechar = useRef(null);

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!montado) return;
    fechar.current?.focus({ preventScroll: true });
    const aoTeclar = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.modal-overlay')) return;
      onFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [montado, onFechar]);

  if (!montado) return null;

  const s = bloco.parada;
  const lugares = bloco.dias.flatMap(d => d.atividades).filter(a => a.photoUrl || a.wikiTitle);
  const cor = bloco.tipo === 'saida' || bloco.tipo === 'volta' ? COR_CASA : cores[bloco.id];
  const t = bloco.trecho;

  return createPortal(
    <div className="detalhe-veu" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <ViewTransition name={`bloco-${bloco.id}`}>
        <aside className="detalhe" role="dialog" aria-modal="true" aria-labelledby="detalhe-titulo" style={{ '--cor': cor }}>
          <FotoDaCidade bloco={bloco} />
          <header className="detalhe-cabeca">
            <span className="bloco-faixa" aria-hidden="true" />
            <div className="detalhe-cabeca-texto">
              <span className="bloco-rotulo">{rotuloDoBloco(bloco)}</span>
              <h2 id="detalhe-titulo">{bloco.titulo}</h2>
              <span className="bloco-datas">{datasDoBloco(bloco)}</span>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditarParada(s)} aria-label={`Editar a parada ${s.city}`}>
              <Icon name="editar" />
            </button>
            <button type="button" className="modal-close" onClick={onFechar} ref={fechar} aria-label="Fechar">
              <Icon name="fechar" size={18} />
            </button>
          </header>

          <div className="detalhe-corpo">
            {t && (
              <ComoChegar
                trecho={t} trip={trip} hojeISO={hojeISO}
                cor={cores[t.para.id] && !cores[t.para.id].includes('text-secondary') ? cores[t.para.id] : 'var(--accent)'}
                altitude={altitudes[t.para.id]}
                titulo={bloco.tipo === 'saida' ? 'Saída' : 'Como chegar'}
                onAtualizar={onAtualizarRota} onUsarFolga={onUsarFolga}
              />
            )}
            {t?.para.legNotes && <p className="detalhe-nota">{t.para.legNotes}</p>}

            {bloco.tipo !== 'saida' && (s.lodgingName || s.petPolicy) && (
              <section className="detalhe-secao">
                <h3><Icon name="hospedagem" /> Hospedagem</h3>
                {s.lodgingName && (
                  <p className="detalhe-trecho">
                    <strong>{s.lodgingName}</strong>
                    {s.lodgingUrl && (
                      <a href={s.lodgingUrl} target="_blank" rel="noopener noreferrer"><Icon name="link" /> site</a>
                    )}
                  </p>
                )}
                {s.petPolicy && <p className="detalhe-nota"><Icon name="pet" /> {s.petPolicy}</p>}
              </section>
            )}

            {bloco.dias.length > 0 && (
              <section className="detalhe-secao">
                <div className="detalhe-numeros">
                  <div><span>Atividades</span><strong>{bloco.feitas}/{bloco.atividades}</strong></div>
                  <div><span>Gasto</span><strong>{formatBRL(bloco.gasto)}</strong></div>
                  <div><span>Estimado</span><strong>{formatBRL(bloco.estimado)}</strong></div>
                  <div><span>Limite no período</span><strong>{formatBRL(limiteDia * bloco.dias.length)}</strong></div>
                </div>
              </section>
            )}

            <ClimaDoPeriodo clima={clima} />

            {s.notes && <p className="detalhe-nota">{s.notes}</p>}

            {lugares.length > 0 && (
              <section className="detalhe-secao">
                <h3><Icon name="local" /> Lugares</h3>
                <div className="lugares">
                  {lugares.map(a => <Lugar key={a.id} atividade={a} onAbrir={() => onEditarAtividade(a)} />)}
                </div>
              </section>
            )}

            {(bloco.tipo === 'estadia' || bloco.tipo === 'passagem') && (
              <Sugestoes
                tripId={trip.id} parada={s} hojeISO={hojeISO}
                onAdicionar={sug => onAdicionarSugestao(sug, bloco)}
              />
            )}

            {bloco.dias.length > 0 ? (
              <section className="detalhe-secao">
                <h3><Icon name="roteiro" /> Dia a dia</h3>
                <TimelineDoRoteiro
                  dias={bloco.dias} cores={cores} hojeISO={hojeISO} limiteDia={limiteDia}
                  destaque={destaque} onFoco={onFoco} prefixoId="bloco-dia" climaPorDia={climaPorDia}
                  onNovaAtividade={onNovaAtividade} onEditarAtividade={onEditarAtividade}
                  onAlternarStatus={onAlternarStatus} onPular={onPular} onMover={onMover}
                  onNovoGasto={onNovoGasto}
                />
              </section>
            ) : (
              <p className="detalhe-nota">
                A saída acontece no primeiro dia da viagem. As atividades daquele dia
                ficam no bloco de {t?.para.city || 'chegada'}.
              </p>
            )}

            {bloco.dias.some(d => d.atividades.some(a => a.pet === 'NAO' && a.status !== 'PULADA')) && (
              <p className="detalhe-nota detalhe-aviso">
                <Icon name="pet" /> Há atividades que não aceitam o cachorro ({PET.NAO.label.toLowerCase()}).
                Planeje quem fica com ele.
              </p>
            )}
          </div>
        </aside>
      </ViewTransition>
    </div>,
    document.body,
  );
}

function FotoDaCidade({ bloco }) {
  const cidade = bloco.tipo === 'estadia' || bloco.tipo === 'passagem';
  const foto = useFoto(cidade ? bloco.parada : null, { cidade });
  return <Foto foto={foto} className="detalhe-foto" alt={bloco.titulo} />;
}

/** Um lugar do roteiro com foto e o resumo da Wikipedia, quando houver. */
function Lugar({ atividade: a, onAbrir }) {
  const foto = useFoto(a);
  const pagina = usePaginaWiki(a.wikiTitle);
  return (
    <article className="lugar">
      <Foto foto={foto} className="lugar-foto" alt={a.title} />
      <div className="lugar-texto">
        <button type="button" className="lugar-titulo" onClick={onAbrir}>{a.title}</button>
        {a.place && <span className="lugar-onde">{a.place}</span>}
        {pagina?.resumo && <p>{pagina.resumo.length > 220 ? `${pagina.resumo.slice(0, 220)}…` : pagina.resumo}</p>}
        {pagina?.url && (
          <a href={pagina.url} target="_blank" rel="noopener noreferrer"><Icon name="link" /> Wikipedia</a>
        )}
      </div>
    </article>
  );
}
