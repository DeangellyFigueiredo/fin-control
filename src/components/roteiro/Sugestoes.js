'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { formatBRL } from '@/lib/utils';
import { PERIODOS, PET } from '@/lib/roteiro';
import { Foto } from './fotos';

const dominio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/**
 * Sugestões de passeios da IA no painel do bloco (RFC 0004). Ficam guardadas
 * por parada: abrir o painel mostra as últimas, sem custo; "Sugerir" gera
 * novas. Nenhuma entra no roteiro sozinha: "Adicionar ao dia…" abre o
 * formulário de atividade preenchido.
 */
export default function Sugestoes({ tripId, parada, hojeISO, onAdicionar }) {
  const [itens, setItens] = useState(null);
  const [geradasEm, setGeradasEm] = useState(null);
  const [uso, setUso] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setItens(null);
    fetch(`/api/trips/${tripId}/ia/sugestoes?stopId=${parada.id}`).then(r => (r.ok ? r.json() : null)).then(j => {
      if (!vivo || !j) return;
      setItens(j.itens);
      setGeradasEm(j.geradasEm || null);
    });
    fetch(`/api/trips/${tripId}/ia/uso`).then(r => (r.ok ? r.json() : null)).then(j => { if (vivo) setUso(j); });
    return () => { vivo = false; };
  }, [tripId, parada.id]);

  const gerar = async () => {
    setErro('');
    setCarregando(true);
    const res = await fetch(`/api/trips/${tripId}/ia/sugestoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stopId: parada.id, hoje: hojeISO }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setCarregando(false);
    if (!res?.ok) return setErro(j.error || 'A IA não respondeu agora. Tente de novo.');
    setItens(j.itens);
    setGeradasEm(j.geradasEm);
    fetch(`/api/trips/${tripId}/ia/uso`).then(r => (r.ok ? r.json() : null)).then(setUso);
  };

  if (uso && !uso.configurada) {
    return (
      <section className="detalhe-secao">
        <h3><Icon name="dica" /> Sugestões da IA</h3>
        <p className="detalhe-nota">IA não configurada neste servidor (falta a chave da Anthropic).</p>
      </section>
    );
  }

  return (
    <section className="detalhe-secao">
      <h3><Icon name="dica" /> Sugestões da IA</h3>

      <div className="sugestoes-topo">
        <button type="button" className="btn btn-primary btn-sm" onClick={gerar} disabled={carregando}>
          {carregando ? 'Pesquisando…' : itens?.length ? 'Sugerir de novo' : `Sugerir passeios em ${parada.city}`}
        </button>
        {uso && (
          <span className="sugestoes-uso">
            {uso.hoje.chamadas}/{uso.hoje.limite} hoje
            {uso.viagem?.chamadas > 0 && <> · US$ {uso.viagem.custo.toFixed(2)} nesta viagem</>}
          </span>
        )}
      </div>
      {carregando && <p className="detalhe-nota">A IA está pesquisando na web; leva de 20 a 60 segundos.</p>}
      {erro && <p className="detalhe-nota detalhe-aviso">{erro}</p>}

      {itens?.length > 0 && (
        <>
          <div className="sugestoes">
            {itens.map(s => (
              <article key={s.title} className="sugestao">
                <Foto foto={s.foto} className="sugestao-foto" alt={s.title} />
                <div className="sugestao-texto">
                  <strong className="sugestao-titulo">{s.title}</strong>
                  <div className="sugestao-selos">
                    <span className="roteiro-selo">{s.category}</span>
                    <span className="roteiro-selo">{PERIODOS[s.period]}</span>
                    <span className={`roteiro-selo selo-pet-${s.pet.toLowerCase()}`}><Icon name="pet" /> {PET[s.pet].curto}</span>
                    {s.estimatedCost != null && <span className="roteiro-selo">~{formatBRL(s.estimatedCost)}</span>}
                  </div>
                  <p>{s.summary}</p>
                  <p className="sugestao-fontes">
                    Fontes: {s.sources.map((u, i) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer">{dominio(u)}{i < s.sources.length - 1 ? ',' : ''}</a>
                    ))}
                  </p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAdicionar(s)}>
                    <Icon name="adicionar" /> Adicionar ao dia…
                  </button>
                </div>
              </article>
            ))}
          </div>
          {geradasEm && (
            <p className="clima-legenda">
              Geradas em {new Date(geradasEm).toLocaleDateString('pt-BR')} pela IA, com pesquisa na web. Confira horários e regras para pets antes de ir.
            </p>
          )}
        </>
      )}
      {itens?.length === 0 && <p className="detalhe-nota">A IA não achou nada novo desta vez.</p>}
    </section>
  );
}
