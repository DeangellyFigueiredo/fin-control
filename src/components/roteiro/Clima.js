'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { resumoDoClima, tempoDoDia } from '@/lib/clima';
import { diaCurto } from './formato';

/**
 * Clima na tela (RFC 0004): um pedido por bloco (cidade e período), o
 * servidor cuida do cache. Devolve o clima por dia, o resumo por bloco e a
 * altitude de cada parada, que a fase da rota usa para o aviso de serra.
 */
export function useClimaDoRoteiro(blocos, hojeISO) {
  const pedidos = useMemo(() => blocos
    .filter(b => b.dias.length && b.tipo !== 'saida')
    .map(b => ({
      id: b.id,
      url: `/api/externo/clima?${new URLSearchParams({
        lat: b.parada.lat, lng: b.parada.lng, de: b.inicio, ate: b.fim, hoje: hojeISO,
      })}`,
    })), [blocos, hojeISO]);

  const chave = pedidos.map(p => p.url).join('|');
  const [respostas, setRespostas] = useState({});

  useEffect(() => {
    let vivo = true;
    Promise.all(pedidos.map(p => fetch(p.url).then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then(j => [p.id, j])))
      .then(pares => { if (vivo) setRespostas(Object.fromEntries(pares)); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return useMemo(() => {
    const porDia = {};
    const porBloco = {};
    for (const [id, r] of Object.entries(respostas)) {
      if (!r?.dias) continue;
      for (const d of r.dias) porDia[d.data] = d;
      porBloco[id] = { resumo: resumoDoClima(r.dias), dias: r.dias, elevacao: r.elevacao, atualizadoEm: r.atualizadoEm };
    }
    return { porDia, porBloco };
  }, [respostas]);
}

const graus = (n) => (n == null ? '–' : `${Math.round(n)}°`);

/** Ícone e máxima/mínima de um dia, para o cartão do dia. */
export function ClimaDoDia({ dia }) {
  if (!dia || dia.max == null) return null;
  const t = tempoDoDia(dia);
  return (
    <span className={`clima-dia fonte-${dia.fonte}`} title={`${t.texto}${dia.fonte === 'media' ? ' (média de 10 anos)' : ''}`}>
      <Icon name={t.icone} /> {graus(dia.max)} <small>{graus(dia.min)}</small>
    </span>
  );
}

/** Linha curta do bloco: faixa de temperatura e chance de chuva. */
export function ClimaDoBloco({ clima }) {
  const r = clima?.resumo;
  if (!r) return null;
  const icone = r.chuvaMedia >= 60 ? 'chuva' : r.chuvaMedia >= 30 ? 'solNuvem' : 'sol';
  return (
    <span className="bloco-linha clima-bloco">
      <Icon name={icone} /> {r.min}–{r.max} °C · chuva {r.chuvaMedia}%
    </span>
  );
}

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** O clima dia a dia no painel do bloco, com a fonte e o crédito. */
export function ClimaDoPeriodo({ clima }) {
  if (!clima?.dias?.length) return null;
  const fontes = new Set(clima.dias.map(d => d.fonte));
  const anos = Math.max(0, ...clima.dias.filter(d => d.fonte === 'media').map(d => d.anos));

  return (
    <section className="detalhe-secao">
      <h3><Icon name="solNuvem" /> Clima</h3>
      <div className="clima-periodo">
        {clima.dias.map(d => {
          const t = tempoDoDia(d);
          return (
            <div key={d.data} className={`clima-cartao fonte-${d.fonte}`} title={t.texto}>
              <span className="clima-cartao-dia">{diaCurto(d.data)}</span>
              <Icon name={t.icone} size={22} />
              <span className="clima-cartao-temp"><strong>{graus(d.max)}</strong> {graus(d.min)}</span>
              {d.chuva != null && <span className="clima-cartao-chuva">{d.chuva}%</span>}
            </div>
          );
        })}
      </div>
      <p className="clima-legenda">
        {fontes.has('previsao') && clima.atualizadoEm && <span className="roteiro-selo">previsão · atualizada às {hora(clima.atualizadoEm)}</span>}
        {fontes.has('observado') && <span className="roteiro-selo">observado</span>}
        {fontes.has('media') && <span className="roteiro-selo">média de {anos || 10} anos · % = anos com chuva</span>}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Dados: Open-Meteo (CC-BY 4.0)</a>
      </p>
    </section>
  );
}
