/**
 * Cor e texto que mapa, timeline e calendário dividem. A mesma cidade tem a
 * mesma cor nos três: é o que liga a faixa do calendário ao pino do mapa.
 */

const CORES = ['var(--rota-1)', 'var(--rota-2)', 'var(--rota-3)', 'var(--rota-4)', 'var(--rota-5)'];
export const COR_CASA = 'var(--text-secondary)';

const chave = (s) => `${s.city}|${s.uf}`;

/** Cor por parada (id), a partir de `estadias()`. Origem e fim ficam neutros. */
export function coresDasParadas(lista) {
  const porCidade = new Map();
  const casa = lista.length ? chave(lista[0]) : null;
  const cores = {};
  for (const s of lista) {
    if (chave(s) === casa) { cores[s.id] = COR_CASA; continue; }
    if (!porCidade.has(chave(s))) porCidade.set(chave(s), CORES[porCidade.size % CORES.length]);
    cores[s.id] = porCidade.get(chave(s));
  }
  return cores;
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "sex, 11/12" a partir de "2026-12-11", lido em UTC como o resto do app. */
export function diaCurto(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const semana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${SEMANA[semana]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** 300 → "5h", 150 → "2h30", 45 → "45min". */
export function duracao(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function trechoTexto(t) {
  const partes = [];
  if (t.km) partes.push(`${Math.round(t.km)} km`);
  if (t.minutos) partes.push(`~${duracao(t.minutos)}`);
  return partes.join(' · ');
}

export const noitesTexto = (n) => (n === 1 ? '1 noite' : `${n} noites`);
