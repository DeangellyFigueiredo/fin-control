/**
 * Roteiro da viagem: paradas, atividades e ritmo, sem banco. Ver
 * docs/rfc/0003-roteiro.md.
 *
 * Como trips.js, roda nos dois lados: a rota valida com estas funções e a
 * tela monta o roteiro com o "hoje" do aparelho. Datas por número do dia
 * (diaDe), dinheiro em centavos.
 *
 * A parada guarda só a chegada. A saída é a chegada da seguinte, e o tipo
 * (origem, pernoite, passagem, fim) sai da posição: com um campo só, não
 * existe roteiro em que saída e chegada discordem.
 */

import { diaDe, isoDoDia, centavos, liquido, resumoViagem, TRIP_CATEGORIES } from './trips.js';

export const PERIODOS = { MANHA: 'Manhã', TARDE: 'Tarde', NOITE: 'Noite' };

export const PET = {
  SIM: { label: 'Aceita pet', curto: 'Pet ok' },
  NAO: { label: 'Não aceita pet', curto: 'Sem pet' },
  VERIFICAR: { label: 'Verificar se aceita pet', curto: 'Verificar' },
};

export const STATUS = { PLANEJADA: 'Planejada', FEITA: 'Feita', PULADA: 'Pulada' };

/** Acima disso de estrada, com 3 atividades ou mais, o dia é pesado. */
const ESTRADA_PESADA_MIN = 300;
const ATIVIDADES_PESADAS = 3;

/** Diferença até 10% de um dia planejado ainda é "no ritmo". */
const TOLERANCIA_RITMO = 0.1;

const ORDEM_PERIODO = { MANHA: 0, TARDE: 1, NOITE: 2 };

export function ordenarParadas(stops = []) {
  return [...stops].sort((a, b) => diaDe(a.date) - diaDe(b.date) || (a.order || 0) - (b.order || 0));
}

export function ordenarAtividades(activities = []) {
  return [...activities].sort((a, b) =>
    diaDe(a.date) - diaDe(b.date)
    || ORDEM_PERIODO[a.period] - ORDEM_PERIODO[b.period]
    || (a.time || '').localeCompare(b.time || '')
    || (a.order || 0) - (b.order || 0));
}

/** Cada parada com chegada, saída, noites e o tipo que a posição dá. */
export function estadias(stops = []) {
  const lista = ordenarParadas(stops);
  const n = lista.length;
  return lista.map((s, i) => {
    const chegada = diaDe(s.date);
    const saida = i < n - 1 ? diaDe(lista[i + 1].date) : null;
    const noites = saida === null ? 0 : saida - chegada;
    const tipo = i === 0 ? 'origem' : i === n - 1 ? 'fim' : noites === 0 ? 'passagem' : 'pernoite';
    return { ...s, indice: i, chegada: isoDoDia(chegada), saida: saida === null ? null : isoDoDia(saida), noites, tipo };
  });
}

/**
 * Onde a viagem está num dia. No dia de trecho ela está nos dois lugares:
 * de manhã na parada anterior, à noite na nova. Os trechos do dia vêm em
 * lista porque uma passagem põe dois no mesmo dia.
 */
export function paradaDoDia(stops, dia) {
  const lista = estadias(stops);
  const d = typeof dia === 'number' ? dia : diaDe(dia);

  let noite = null;
  for (const s of lista) if (diaDe(s.chegada) <= d) noite = s;

  // A origem não tem trecho: a "chegada" dela é o dia em que se sai
  const trechos = lista
    .filter(s => s.indice > 0 && diaDe(s.chegada) === d)
    .map(s => ({ de: lista[s.indice - 1], para: s, km: s.legKm ?? null, minutos: s.legMinutes ?? null }));

  const manha = trechos.length ? trechos[0].de : noite;
  return { manha, noite, trechos };
}

/**
 * Posição na rota, em trechos (de 0 a n). Trechos de dias anteriores contam
 * inteiros e os de hoje contam metade: o carro aparece no meio do caminho.
 * É pela data, não pelo GPS.
 */
export function progressoDaRota(stops, hoje) {
  const lista = ordenarParadas(stops);
  const h = diaDe(hoje);
  const total = Math.max(lista.length - 1, 0);

  let posicao = 0;
  let emTrecho = false;
  for (let i = 1; i < lista.length; i++) {
    const d = diaDe(lista[i].date);
    if (d < h) posicao += 1;
    else if (d === h) { posicao += 0.5; emTrecho = true; }
  }
  return { posicao, total, emTrecho };
}

/**
 * Um item por dia da viagem: onde, trechos, atividades por período,
 * estimado e gasto. O gasto é o líquido dos lançamentos do dia; as
 * atividades puladas não entram no estimado.
 */
export function diasDoRoteiro(trip, stops = [], activities = [], entries = []) {
  const inicio = diaDe(trip.startDate);
  const fim = diaDe(trip.endDate);

  const gastoPorDia = new Map();
  const gastoPorAtividade = new Map();
  for (const e of entries) {
    const v = liquido(e);
    const d = diaDe(e.date);
    gastoPorDia.set(d, (gastoPorDia.get(d) || 0) + v);
    if (e.activityId) gastoPorAtividade.set(e.activityId, (gastoPorAtividade.get(e.activityId) || 0) + v);
  }

  const porDia = new Map();
  for (const a of ordenarAtividades(activities)) {
    const d = diaDe(a.date);
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push({ ...a, gasto: (gastoPorAtividade.get(a.id) || 0) / 100 });
  }

  const dias = [];
  for (let d = inicio; d <= fim; d++) {
    const onde = paradaDoDia(stops, d);
    const atividades = porDia.get(d) || [];
    const validas = atividades.filter(a => a.status !== 'PULADA');
    const estimado = validas.reduce((s, a) => s + centavos(a.estimatedCost || 0), 0);
    const minutos = onde.trechos.reduce((s, t) => s + (t.minutos || 0), 0);
    const km = onde.trechos.reduce((s, t) => s + (t.km || 0), 0);

    dias.push({
      data: isoDoDia(d),
      numero: d - inicio + 1,
      semana: new Date(d * 86400000).getUTCDay(),
      manha: onde.manha,
      noite: onde.noite,
      trechos: onde.trechos,
      atividades,
      porPeriodo: Object.fromEntries(Object.keys(PERIODOS).map(p => [p, atividades.filter(a => a.period === p)])),
      estimado: estimado / 100,
      gasto: (gastoPorDia.get(d) || 0) / 100,
      estradaMinutos: minutos,
      km,
      pesado: minutos > ESTRADA_PESADA_MIN && validas.length >= ATIVIDADES_PESADAS,
    });
  }
  return dias;
}

/**
 * O ritmo do dinheiro e do roteiro. O planejado é o limite fixo por dia de
 * resumoViagem, acumulado; o real é o gasto do destino acumulado, até hoje.
 * Nenhuma regra nova de orçamento: só a mesma conta vista no tempo.
 *
 * Hoje entra inteiro dos dois lados. De manhã o status diz "sobrando" mais
 * ou menos o limite do dia, que é exatamente o que ainda dá para gastar.
 */
export function ritmo(trip, entries = [], activities = [], stops = [], hojeISO) {
  const r = resumoViagem(trip, entries, hojeISO);
  const inicio = diaDe(trip.startDate);
  const fim = diaDe(trip.endDate);
  const hoje = diaDe(hojeISO);
  const limiteDia = Math.round(r.limitePlanejado * 100);

  const destinoPorDia = new Map();
  for (const e of entries) {
    const d = diaDe(e.date);
    if (d >= inicio && d <= fim) destinoPorDia.set(d, (destinoPorDia.get(d) || 0) + liquido(e));
  }

  const serie = [];
  let real = 0;
  for (let d = inicio; d <= fim; d++) {
    real += destinoPorDia.get(d) || 0;
    serie.push({
      data: isoDoDia(d),
      planejado: (limiteDia * (d - inicio + 1)) / 100,
      // Depois de hoje não há real: a linha para onde o tempo parou
      real: d <= hoje ? real / 100 : null,
    });
  }

  let dinheiro = { estado: 'antes', diferenca: 0 };
  if (hoje >= inicio) {
    const ref = Math.min(hoje, fim) - inicio;
    const dif = Math.round(serie[ref].real * 100) - limiteDia * (ref + 1);
    const estado = Math.abs(dif) <= limiteDia * TOLERANCIA_RITMO ? 'no-ritmo' : dif > 0 ? 'acima' : 'abaixo';
    dinheiro = { estado, diferenca: Math.abs(dif) / 100 };
  }

  const validas = activities.filter(a => a.status !== 'PULADA');
  const lista = ordenarParadas(stops);
  let kmTotal = 0;
  let kmRodados = 0;
  for (let i = 1; i < lista.length; i++) {
    const km = lista[i].legKm || 0;
    kmTotal += km;
    if (diaDe(lista[i].date) <= hoje) kmRodados += km;
  }

  return {
    serie,
    limiteDia: limiteDia / 100,
    dinheiro,
    atividades: {
      feitas: validas.filter(a => a.status === 'FEITA').length,
      ateHoje: validas.filter(a => diaDe(a.date) <= hoje).length,
      total: validas.length,
    },
    km: { rodados: kmRodados, total: kmTotal },
  };
}

/** Quantas paradas e atividades ficariam fora de novas datas da viagem. */
export function foraDasDatas(stops = [], activities = [], startISO, endISO) {
  const i = diaDe(startISO);
  const f = diaDe(endISO);
  const fora = (x) => diaDe(x.date) < i || diaDe(x.date) > f;
  return { paradas: stops.filter(fora).length, atividades: activities.filter(fora).length };
}

// --- mapa ---

/**
 * Função que leva lat/lng para x/y num viewBox, enquadrando os pontos com
 * margem e sem distorcer: a longitude encolhe pelo cosseno da latitude média.
 * Com um ponto só (ou todos iguais), centraliza.
 */
export function enquadrar(pontos, largura, altura, margem = 0) {
  if (!pontos.length) return () => ({ x: largura / 2, y: altura / 2 });

  const latMedia = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length;
  const k = Math.cos((latMedia * Math.PI) / 180);
  const xs = pontos.map(p => p.lng * k);
  const ys = pontos.map(p => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const uteisL = largura - 2 * margem;
  const uteisA = altura - 2 * margem;
  const spanX = maxX - minX, spanY = maxY - minY;
  const escala = spanX === 0 && spanY === 0
    ? 1
    : Math.min(spanX ? uteisL / spanX : Infinity, spanY ? uteisA / spanY : Infinity);

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return (lat, lng) => ({
    x: largura / 2 + (lng * k - cx) * escala,
    y: altura / 2 + (-lat - cy) * escala,
  });
}

/**
 * Um caminho SVG por trecho, com curvas Catmull-Rom (passam pelos pontos)
 * convertidas em Bézier. Um path por trecho deixa o mapa medir onde cada
 * parada cai no traço inteiro.
 */
export function trechosSuaves(pts, tensao = 0.5) {
  const f = (n) => Math.round(n * 10) / 10;
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] || pts[i - 1];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[i + 1] || p2;
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * tensao * 2, y: p1.y + ((p2.y - p0.y) / 6) * tensao * 2 };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * tensao * 2, y: p2.y - ((p3.y - p1.y) / 6) * tensao * 2 };
    out.push(`M${f(p1.x)} ${f(p1.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`);
  }
  return out;
}

// --- validação ---

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

/** Link que vai parar num href: só http(s), para não abrir `javascript:`. */
function link(v) {
  const s = texto(v, 500);
  if (!s) return { valor: '' };
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:') return { valor: u.toString() };
  } catch { /* cai no erro abaixo */ }
  return { erro: 'Link precisa começar com http:// ou https://' };
}

function dataDaViagem(v, trip) {
  if (!ISO.test(v || '')) return { erro: 'Informe a data' };
  const d = diaDe(v);
  if (d < diaDe(trip.startDate) || d > diaDe(trip.endDate)) return { erro: 'A data precisa estar dentro da viagem' };
  return { valor: new Date(`${v}T00:00:00.000Z`) };
}

function numeroOpcional(v, { inteiro = false } = {}) {
  if (v === '' || v == null) return { valor: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { erro: true };
  return { valor: inteiro ? Math.round(n) : Math.round(n * 10) / 10 };
}

const ordem = (v) => (Number.isInteger(Number(v)) ? Number(v) : 0);

export function validarParada(body = {}, trip) {
  const city = texto(body.city, 80);
  if (!city) return { error: 'Informe a cidade' };

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (body.lat === '' || body.lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: 'Escolha a cidade na lista ou cole as coordenadas' };
  }

  const date = dataDaViagem(body.date, trip);
  if (date.erro) return { error: date.erro };

  const km = numeroOpcional(body.legKm);
  if (km.erro) return { error: 'Distância inválida' };
  const minutos = numeroOpcional(body.legMinutes, { inteiro: true });
  if (minutos.erro) return { error: 'Tempo de estrada inválido' };

  const url = link(body.lodgingUrl);
  if (url.erro) return { error: url.erro };

  return {
    data: {
      city,
      uf: texto(body.uf, 2).toUpperCase(),
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      date: date.valor,
      order: ordem(body.order),
      lodgingName: texto(body.lodgingName, 120),
      lodgingUrl: url.valor,
      petPolicy: texto(body.petPolicy, 300),
      notes: texto(body.notes, 500),
      legKm: km.valor,
      legMinutes: minutos.valor,
      legNotes: texto(body.legNotes, 300),
    },
  };
}

/** Período a partir da hora, para a timeline agrupar sem caso especial. */
export const periodoDaHora = (hhmm) => {
  const h = Number(hhmm.slice(0, 2));
  return h < 12 ? 'MANHA' : h < 18 ? 'TARDE' : 'NOITE';
};

export function validarAtividade(body = {}, trip) {
  const title = texto(body.title, 120);
  if (!title) return { error: 'Dê um nome à atividade' };

  const date = dataDaViagem(body.date, trip);
  if (date.erro) return { error: date.erro };

  const time = texto(body.time, 5) || null;
  if (time && !HORA.test(time)) return { error: 'Hora inválida' };
  const period = time ? periodoDaHora(time) : body.period || 'MANHA';
  if (!PERIODOS[period]) return { error: 'Período inválido' };

  if (!TRIP_CATEGORIES.includes(body.category)) return { error: 'Escolha uma categoria' };

  const custo = numeroOpcional(body.estimatedCost);
  if (custo.erro) return { error: 'Custo estimado inválido' };

  const pet = body.pet || 'VERIFICAR';
  if (!PET[pet]) return { error: 'Informe se aceita pet' };
  const status = body.status || 'PLANEJADA';
  if (!STATUS[status]) return { error: 'Status inválido' };

  const url = link(body.link);
  if (url.erro) return { error: url.erro };

  return {
    data: {
      title,
      date: date.valor,
      time,
      period,
      order: ordem(body.order),
      place: texto(body.place, 80),
      category: body.category,
      // numeroOpcional arredonda a 1 casa; custo é dinheiro, vai a centavos
      estimatedCost: custo.valor === null ? 0 : Math.round(Number(body.estimatedCost) * 100) / 100,
      pet,
      status,
      link: url.valor,
      notes: texto(body.notes, 500),
    },
  };
}

/** Roteiro colado como JSON: `{ stops: [...], activities: [...] }`. */
export function validarRoteiroImportado(json, trip) {
  if (!json || typeof json !== 'object') return { error: 'O roteiro precisa ser um objeto com stops e activities' };
  const stops = Array.isArray(json.stops) ? json.stops : [];
  const activities = Array.isArray(json.activities) ? json.activities : [];
  if (!stops.length && !activities.length) return { error: 'O roteiro está vazio' };
  if (stops.length > 30) return { error: 'No máximo 30 paradas' };
  if (activities.length > 200) return { error: 'No máximo 200 atividades' };

  const data = { stops: [], activities: [] };
  for (const [i, s] of stops.entries()) {
    const r = validarParada(s, trip);
    if (r.error) return { error: `Parada ${i + 1} (${s?.city || 'sem cidade'}): ${r.error}` };
    data.stops.push({ ...r.data, order: r.data.order || i });
  }
  for (const [i, a] of activities.entries()) {
    const r = validarAtividade(a, trip);
    if (r.error) return { error: `Atividade ${i + 1} (${a?.title || 'sem nome'}): ${r.error}` };
    data.activities.push({ ...r.data, order: r.data.order || i });
  }
  return { data };
}
