import { buscarJson } from './http.js';
import { comCache, DIA_MS } from './cache.js';
import { separarPorFonte, periodoDaMedia, mediaHistorica, diasDaPrevisao } from '../clima.js';

/**
 * Clima de um período num lugar, pelo Open-Meteo (sem chave, uso não
 * comercial, dados CC-BY 4.0). Ver docs/rfc/0004-roteiro-inteligente.md.
 *
 * Previsão e observado vêm do mesmo endpoint, num pedido só, com cache de 3
 * horas. A média vem do arquivo histórico, num pedido só para os 10 anos, com
 * cache de 30 dias: o passado não muda.
 */

const FORECAST = process.env.OPEN_METEO_URL || 'https://api.open-meteo.com';
const ARCHIVE = process.env.OPEN_METEO_ARCHIVE_URL || 'https://archive-api.open-meteo.com';
const FUSO = 'America/Sao_Paulo';
const HORA_MS = 60 * 60 * 1000;

/** Duas casas (~1 km): o clima de um bairro vizinho é o mesmo, e o cache rende mais. */
const coord = (n) => Number(n).toFixed(2);

export async function climaDoPeriodo({ lat, lng, de, ate, hoje }) {
  const grupos = separarPorFonte(de, ate, hoje);
  const lugar = `${coord(lat)},${coord(lng)}`;
  const dias = [];
  let elevacao = null;
  let atualizadoEm = null;

  const proximos = [...grupos.observado, ...grupos.previsao];
  if (proximos.length) {
    const r = await comCache(`meteo:dias:${lugar}:${proximos[0]}:${proximos.at(-1)}`, 3 * HORA_MS, async () => {
      const q = new URLSearchParams({
        latitude: coord(lat), longitude: coord(lng), timezone: FUSO,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code',
        start_date: proximos[0], end_date: proximos.at(-1),
      });
      const j = await buscarJson(`${FORECAST}/v1/forecast?${q}`);
      return { daily: j?.daily || null, elevation: j?.elevation ?? null, em: new Date().toISOString() };
    });
    elevacao = r.elevation;
    atualizadoEm = r.em;
    // A mesma resposta lida das duas formas; cada dia pega a sua
    const observados = new Set(grupos.observado);
    const comoPrevisao = diasDaPrevisao(r.daily, 'previsao');
    const comoObservado = diasDaPrevisao(r.daily, 'observado');
    comoPrevisao.forEach((d, i) => dias.push(observados.has(d.data) ? comoObservado[i] : d));
  }

  if (grupos.media.length) {
    const periodo = periodoDaMedia(grupos.media, hoje);
    const r = await comCache(`meteo:media:${lugar}:${periodo.de}:${periodo.ate}`, 30 * DIA_MS, async () => {
      const q = new URLSearchParams({
        latitude: coord(lat), longitude: coord(lng), timezone: FUSO,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
        start_date: periodo.de, end_date: periodo.ate,
      });
      const j = await buscarJson(`${ARCHIVE}/v1/archive?${q}`, { timeoutMs: 15000 });
      return { daily: j?.daily || null, elevation: j?.elevation ?? null };
    });
    elevacao ??= r.elevation;
    dias.push(...mediaHistorica(r.daily, grupos.media));
  }

  dias.sort((a, b) => a.data.localeCompare(b.data));
  return { elevacao, atualizadoEm, dias };
}
