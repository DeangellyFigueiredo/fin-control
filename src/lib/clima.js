/**
 * Clima da viagem, sem rede. Ver docs/rfc/0004-roteiro-inteligente.md.
 *
 * Para cada dia, uma de três fontes:
 * - previsão: de hoje até 15 dias à frente (o Open-Meteo prevê 16 dias);
 * - observado: dias que já passaram, até 92 dias atrás (o mesmo serviço
 *   devolve o que de fato aconteceu);
 * - média: o resto, com os mesmos dias do ano nos últimos 10 anos.
 *
 * Datas por número do dia (diaDe), como o resto do roteiro.
 */

import { diaDe, isoDoDia } from './trips.js';

export const DIAS_DE_PREVISAO = 16;
const DIAS_OBSERVADOS = 92;
export const ANOS_DE_MEDIA = 10;
/** Chuva acima disso conta como "dia com chuva" na média. */
const CHUVA_MM = 1;

/** `dia` pode ser "AAAA-MM-DD" ou o número do dia (diaDe). */
export function fonteDoDia(dia, hoje) {
  const d = typeof dia === 'number' ? dia : diaDe(dia);
  const h = diaDe(hoje);
  if (d >= h && d - h < DIAS_DE_PREVISAO) return 'previsao';
  if (d < h && h - d <= DIAS_OBSERVADOS) return 'observado';
  return 'media';
}

/** Os dias de `de` a `ate`, separados por fonte. */
export function separarPorFonte(de, ate, hoje) {
  const grupos = { previsao: [], observado: [], media: [] };
  for (let d = diaDe(de); d <= diaDe(ate); d++) grupos[fonteDoDia(d, hoje)].push(isoDoDia(d));
  return grupos;
}

const mesDia = (iso) => iso.slice(5, 10);
const arred = (n) => Math.round(n * 10) / 10;

/**
 * Período do arquivo histórico que cobre os mesmos dias do ano nos últimos
 * `anos` anos completos. Uma chamada só, com tudo, em vez de uma por ano.
 */
export function periodoDaMedia(dias, hoje, anos = ANOS_DE_MEDIA) {
  const anoAtual = Number(hoje.slice(0, 4));
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  // Viagem que cruza o ano (dez → jan): o fim cai no ano seguinte ao início
  const cruza = mesDia(ultimo) < mesDia(primeiro);
  const fimAno = anoAtual - 1;
  return {
    de: `${fimAno - anos + 1 - (cruza ? 1 : 0)}-${mesDia(primeiro)}`,
    ate: `${fimAno}-${mesDia(ultimo)}`,
  };
}

/**
 * Média dos mesmos dias do ano, a partir da resposta diária do arquivo
 * (`time`, máxima, mínima, chuva em mm). Dias sem dado em algum ano (o
 * arquivo tem atraso de alguns dias) ficam de fora da média daquele dia.
 */
export function mediaHistorica(daily, dias) {
  const porMesDia = new Map();
  (daily?.time || []).forEach((t, i) => {
    const max = daily.temperature_2m_max?.[i];
    const min = daily.temperature_2m_min?.[i];
    const mm = daily.precipitation_sum?.[i];
    if (max == null || min == null) return;
    const k = mesDia(t);
    if (!porMesDia.has(k)) porMesDia.set(k, []);
    porMesDia.get(k).push({ max, min, mm: mm ?? 0 });
  });

  return dias.map(dia => {
    const anos = porMesDia.get(mesDia(dia)) || [];
    if (!anos.length) return { data: dia, fonte: 'media', anos: 0, max: null, min: null, chuva: null };
    const soma = (f) => anos.reduce((s, a) => s + f(a), 0);
    return {
      data: dia,
      fonte: 'media',
      anos: anos.length,
      max: arred(soma(a => a.max) / anos.length),
      min: arred(soma(a => a.min) / anos.length),
      // Percentual de anos em que choveu naquele dia
      chuva: Math.round((anos.filter(a => a.mm > CHUVA_MM).length / anos.length) * 100),
    };
  });
}

/** Dias da previsão (ou do observado) a partir da resposta diária. */
export function diasDaPrevisao(daily, fonte) {
  return (daily?.time || []).map((t, i) => ({
    data: t,
    fonte,
    max: daily.temperature_2m_max?.[i] ?? null,
    min: daily.temperature_2m_min?.[i] ?? null,
    // Na previsão, a probabilidade; no observado, se choveu (100) ou não (0)
    chuva: fonte === 'previsao'
      ? daily.precipitation_probability_max?.[i] ?? null
      : (daily.precipitation_sum?.[i] ?? 0) > CHUVA_MM ? 100 : 0,
    mm: daily.precipitation_sum?.[i] ?? null,
    codigo: daily.weather_code?.[i] ?? null,
  }));
}

/** Resumo de um período: a faixa de temperatura e quantos dias com chuva. */
export function resumoDoClima(dias) {
  const validos = dias.filter(d => d.max != null && d.min != null);
  if (!validos.length) return null;
  const comChuva = validos.filter(d => (d.chuva ?? 0) >= 50).length;
  return {
    min: Math.round(Math.min(...validos.map(d => d.min))),
    max: Math.round(Math.max(...validos.map(d => d.max))),
    chuvaMedia: Math.round(validos.reduce((s, d) => s + (d.chuva ?? 0), 0) / validos.length),
    diasComChuva: comChuva,
    fontes: [...new Set(validos.map(d => d.fonte))],
  };
}

/**
 * Ícone e texto do tempo. Com código WMO (previsão e observado), pelo código;
 * na média, pela chance de chuva.
 */
export function tempoDoDia(d) {
  const c = d.codigo;
  if (c != null) {
    if (c === 0) return { icone: 'sol', texto: 'Céu limpo' };
    if (c <= 2) return { icone: 'solNuvem', texto: 'Parcialmente nublado' };
    if (c === 3) return { icone: 'nuvem', texto: 'Nublado' };
    if (c === 45 || c === 48) return { icone: 'neblina', texto: 'Neblina' };
    if (c >= 51 && c <= 57) return { icone: 'garoa', texto: 'Garoa' };
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { icone: 'chuva', texto: 'Chuva' };
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { icone: 'neve', texto: 'Neve' };
    if (c >= 95) return { icone: 'tempestade', texto: 'Tempestade' };
  }
  if (d.chuva == null) return { icone: 'nuvem', texto: 'Sem dado' };
  if (d.chuva >= 60) return { icone: 'chuva', texto: `Chove em ${d.chuva}% dos anos` };
  if (d.chuva >= 30) return { icone: 'solNuvem', texto: `Chove em ${d.chuva}% dos anos` };
  return { icone: 'sol', texto: `Chove em ${d.chuva}% dos anos` };
}
