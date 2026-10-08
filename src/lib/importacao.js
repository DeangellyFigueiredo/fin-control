/**
 * Preview da importação de roteiro. Ver docs/rfc/0004-roteiro-inteligente.md.
 *
 * O JSON costuma vir de outra IA, e chega com os mesmos enganos: categoria
 * que não existe ("Natureza"), período "DIA", `hour` no lugar de `time`, um
 * dia depois da volta. Em vez de parar no primeiro, a análise junta tudo de
 * uma vez e, quando sabe a troca certa, sugere a correção.
 *
 * Roda no navegador, para o preview. O servidor não confia nela: a rota de
 * importação valida de novo com validarRoteiroImportado.
 */

import { diaDe, TRIP_CATEGORIES } from './trips.js';
import { PERIODOS, PET, validarParada, validarAtividade, validarRoteiroImportado } from './roteiro.js';

const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Categorias que outras IAs inventam, e a nossa que corresponde. */
const CATEGORIA_PARECIDA = {
  natureza: 'Passeios', parque: 'Passeios', parques: 'Passeios', trilha: 'Passeios',
  natal: 'Passeios', show: 'Passeios', shows: 'Passeios', evento: 'Passeios', eventos: 'Passeios',
  cultura: 'Passeios', lazer: 'Passeios', turismo: 'Passeios', atracao: 'Passeios', atracoes: 'Passeios',
  passeio: 'Passeios', visita: 'Passeios', mirante: 'Passeios',
  gastronomia: 'Alimentação', restaurante: 'Alimentação', comida: 'Alimentação', refeicao: 'Alimentação',
  almoco: 'Alimentação', jantar: 'Alimentação', cafe: 'Alimentação',
  deslocamento: 'Transporte', estrada: 'Transporte', viagem: 'Transporte', carro: 'Transporte',
  voo: 'Transporte', retorno: 'Transporte',
  hotel: 'Hospedagem', pousada: 'Hospedagem', checkin: 'Hospedagem', 'check-in': 'Hospedagem',
  compra: 'Compras', loja: 'Compras', lojas: 'Compras',
  descanso: 'Outros', livre: 'Outros', outro: 'Outros',
};
for (const c of TRIP_CATEGORIES) CATEGORIA_PARECIDA[sem(c)] = c;

const PERIODO_PARECIDO = {
  dia: 'MANHA', 'dia todo': 'MANHA', integral: 'MANHA', manha: 'MANHA', morning: 'MANHA', cedo: 'MANHA',
  tarde: 'TARDE', afternoon: 'TARDE',
  noite: 'NOITE', evening: 'NOITE', night: 'NOITE',
};

const PET_PARECIDO = {
  sim: 'SIM', yes: 'SIM', true: 'SIM', s: 'SIM',
  nao: 'NAO', no: 'NAO', false: 'NAO', n: 'NAO',
  verificar: 'VERIFICAR', talvez: 'VERIFICAR', 'a verificar': 'VERIFICAR', '?': 'VERIFICAR',
};

/** Nomes de campo que vêm traduzidos ou trocados, e o nome certo. */
const CAMPOS_PARADA = {
  cidade: 'city', name: 'city', nome: 'city', estado: 'uf', state: 'uf',
  latitude: 'lat', longitude: 'lng', lon: 'lng', long: 'lng',
  data: 'date', chegada: 'date', arrival: 'date', km: 'legKm', distanceKm: 'legKm', distancia: 'legKm',
  minutes: 'legMinutes', minutos: 'legMinutes', hotel: 'lodgingName', hospedagem: 'lodgingName',
};
const CAMPOS_ATIVIDADE = {
  hour: 'time', hora: 'time', horario: 'time', titulo: 'title', nome: 'title', name: 'title',
  data: 'date', categoria: 'category', periodo: 'period', lugar: 'place', local: 'place',
  custo: 'estimatedCost', cost: 'estimatedCost', price: 'estimatedCost', notas: 'notes',
};

const CONHECIDOS_PARADA = new Set(['city', 'uf', 'lat', 'lng', 'date', 'order', 'lodgingName', 'lodgingUrl',
  'petPolicy', 'notes', 'legKm', 'legMinutes', 'legNotes', 'wikiTitle', 'photoUrl', 'photoCredit', 'photoSourceUrl']);
const CONHECIDOS_ATIVIDADE = new Set(['title', 'date', 'time', 'period', 'order', 'place', 'category',
  'estimatedCost', 'pet', 'status', 'link', 'notes', 'wikiTitle', 'photoUrl', 'photoCredit', 'photoSourceUrl']);

const ehObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * Analisa o roteiro colado. `entrada` é o texto do campo ou um objeto já lido.
 *
 * Devolve `{ json, erros, avisos, data }`:
 * - cada erro tem `alvo` ("Atividade 3 (Cânion Fortaleza)"), `tipo`, `indice`,
 *   `campo`, `mensagem` e, quando a troca é óbvia, `correcao`;
 * - avisos não impedem a importação;
 * - `data` só vem quando não há erro nenhum, no formato do Prisma.
 */
export function analisarRoteiro(entrada, trip) {
  const erros = [];
  const avisos = [];
  const geral = (mensagem) => erros.push({ alvo: 'Roteiro', tipo: 'geral', indice: null, campo: null, mensagem });

  let json = entrada;
  if (typeof entrada === 'string') {
    if (!entrada.trim()) {
      geral('Cole o roteiro em JSON');
      return { json: null, erros, avisos, data: null };
    }
    try {
      json = JSON.parse(entrada);
    } catch (e) {
      geral(`Não é um JSON válido: ${e.message}`);
      return { json: null, erros, avisos, data: null };
    }
  }

  if (!ehObjeto(json)) {
    geral('O roteiro precisa ser um objeto com "stops" e "activities"');
    return { json, erros, avisos, data: null };
  }

  const stops = Array.isArray(json.stops) ? json.stops : [];
  const activities = Array.isArray(json.activities) ? json.activities : [];
  if (json.stops !== undefined && !Array.isArray(json.stops)) geral('"stops" precisa ser uma lista');
  if (json.activities !== undefined && !Array.isArray(json.activities)) geral('"activities" precisa ser uma lista');
  if (!stops.length && !activities.length && !erros.length) geral('O roteiro está vazio');
  if (stops.length > 30) geral('No máximo 30 paradas');
  if (activities.length > 200) geral('No máximo 200 atividades');

  const ida = diaDe(trip.startDate);
  const volta = diaDe(trip.endDate);
  const fmt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const periodoDaViagem = `${fmt(new Date(ida * 86400000).toISOString())} a ${fmt(new Date(volta * 86400000).toISOString())}`;

  /**
   * Um item: primeiro os enganos conhecidos (com correção), depois o
   * validador de verdade sobre o item já corrigido, para achar o resto sem
   * repetir o que já foi dito.
   */
  const analisarItem = (item, i, tipo) => {
    const ehParada = tipo === 'stop';
    const nome = ehParada ? item?.city ?? item?.cidade : item?.title ?? item?.titulo ?? item?.nome;
    const alvo = `${ehParada ? 'Parada' : 'Atividade'} ${i + 1}${nome ? ` (${nome})` : ''}`;
    const base = { alvo, tipo, indice: i };

    if (!ehObjeto(item)) {
      erros.push({ ...base, campo: null, mensagem: 'Precisa ser um objeto' });
      return;
    }

    const corrigido = { ...item };
    const jaDito = new Set();
    const erro = (campo, mensagem, correcao) => {
      jaDito.add(campo);
      erros.push({ ...base, campo, mensagem, ...(correcao ? { correcao } : {}) });
      if (correcao?.tipo === 'trocar') corrigido[campo] = correcao.para;
      if (correcao?.tipo === 'renomear') { corrigido[correcao.para] = corrigido[campo]; delete corrigido[campo]; }
    };

    // Campos com nome trocado
    const nomes = ehParada ? CAMPOS_PARADA : CAMPOS_ATIVIDADE;
    const conhecidos = ehParada ? CONHECIDOS_PARADA : CONHECIDOS_ATIVIDADE;
    for (const campo of Object.keys(item)) {
      if (conhecidos.has(campo)) continue;
      const certo = nomes[campo] ?? nomes[sem(campo)];
      if (certo && !(certo in item)) {
        erro(campo, `O campo "${campo}" não existe; o certo é "${certo}"`, { tipo: 'renomear', para: certo });
      } else {
        avisos.push({ alvo, mensagem: `O campo "${campo}" não é usado e será ignorado` });
      }
    }

    if (!ehParada) {
      const cat = corrigido.category;
      if (cat != null && !TRIP_CATEGORIES.includes(cat)) {
        const para = CATEGORIA_PARECIDA[sem(cat)];
        erro('category', para
          ? `A categoria "${cat}" não existe; a mais próxima é "${para}"`
          : `A categoria "${cat}" não existe. Use uma de: ${TRIP_CATEGORIES.join(', ')}`,
        para ? { tipo: 'trocar', para } : null);
      }

      const per = corrigido.period;
      if (per != null && !PERIODOS[per] && !corrigido.time) {
        const para = PERIODO_PARECIDO[sem(per)];
        erro('period', para
          ? `O período "${per}" não existe; use "${para}" (manhã, tarde ou noite)`
          : `O período "${per}" não existe. Use MANHA, TARDE ou NOITE`,
        para ? { tipo: 'trocar', para } : null);
      }

      const pet = corrigido.pet;
      if (pet != null && !PET[pet]) {
        const para = PET_PARECIDO[sem(pet)];
        erro('pet', para
          ? `"${pet}" não é um valor de pet; o certo é "${para}"`
          : `"${pet}" não é um valor de pet. Use SIM, NAO ou VERIFICAR`,
        para ? { tipo: 'trocar', para } : null);
      }
    }

    // Data fora da viagem: na atividade, a saída óbvia é tirá-la
    const data = corrigido.date;
    if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
      const d = diaDe(data);
      if (d < ida || d > volta) {
        erro('date', `${fmt(data)} está fora da viagem (${periodoDaViagem})`,
          ehParada ? null : { tipo: 'remover' });
      }
    }

    const r = ehParada ? validarParada(corrigido, trip) : validarAtividade(corrigido, trip);
    for (const e of r.erros) {
      if (jaDito.has(e.campo)) continue;
      // A hora inválida já invalida o período derivado dela
      if (e.campo === 'period' && jaDito.has('time')) continue;
      erros.push({ ...base, campo: e.campo, mensagem: e.mensagem });
    }
  };

  stops.forEach((s, i) => analisarItem(s, i, 'stop'));
  activities.forEach((a, i) => analisarItem(a, i, 'activity'));

  // Avisos sobre o roteiro como um todo
  if (stops.length && ehObjeto(stops[0]) && (stops[0].legKm != null || stops[0].legMinutes != null)) {
    avisos.push({
      alvo: `Parada 1 (${stops[0].city ?? '?'})`,
      mensagem: 'A primeira parada é o ponto de saída, e o trecho dela é ignorado. Falta a cidade de onde vocês saem?',
    });
  }
  const porData = new Map();
  stops.forEach((s, i) => {
    if (!ehObjeto(s) || typeof s.date !== 'string') return;
    if (!porData.has(s.date)) porData.set(s.date, []);
    porData.get(s.date).push({ i, s });
  });
  for (const [data, lista] of porData) {
    // Uma parada sem order no meio de outras com order já tem lugar (order 0);
    // a dúvida é quando duas ou mais ficam sem
    if (lista.filter(({ s }) => s.order == null).length > 1) {
      avisos.push({
        alvo: lista.map(({ i, s }) => `Parada ${i + 1} (${s.city ?? '?'})`).join(' e '),
        mensagem: `Chegam no mesmo dia (${fmt(data)}) sem "order"; vale a ordem em que aparecem no JSON`,
      });
    }
  }
  const primeiraParada = stops
    .filter(s => ehObjeto(s) && typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
    .reduce((min, s) => Math.min(min, diaDe(s.date)), Infinity);
  activities.forEach((a, i) => {
    if (!ehObjeto(a) || typeof a.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return;
    const d = diaDe(a.date);
    if (Number.isFinite(primeiraParada) && d < primeiraParada && d >= ida) {
      avisos.push({ alvo: `Atividade ${i + 1} (${a.title ?? '?'})`, mensagem: 'Cai antes da primeira parada' });
    }
  });
  if (!stops.length && activities.length) {
    avisos.push({ alvo: 'Roteiro', mensagem: 'Sem paradas: o mapa e os blocos por cidade ficam vazios' });
  }

  if (erros.length) return { json, erros, avisos, data: null };

  const final = validarRoteiroImportado(json, trip);
  if (final.error) {
    // Não deveria acontecer: a análise cobre tudo que o validador cobre
    geral(final.error);
    return { json, erros, avisos, data: null };
  }
  return { json, erros, avisos, data: final.data };
}

/** Quantos erros a análise sabe corrigir sozinha. */
export const corrigiveis = (analise) => analise.erros.filter(e => e.correcao).length;

/**
 * Aplica as correções sugeridas e devolve um JSON novo. Os erros sem
 * correção continuam lá, para a pessoa resolver.
 */
export function aplicarCorrecoes(json, analise) {
  const novo = {
    ...json,
    stops: Array.isArray(json.stops) ? json.stops.map(s => (ehObjeto(s) ? { ...s } : s)) : json.stops,
    activities: Array.isArray(json.activities) ? json.activities.map(a => (ehObjeto(a) ? { ...a } : a)) : json.activities,
  };
  const remover = { stop: new Set(), activity: new Set() };

  for (const e of analise.erros) {
    if (!e.correcao) continue;
    const lista = e.tipo === 'stop' ? novo.stops : novo.activities;
    const item = lista?.[e.indice];
    if (!ehObjeto(item)) continue;
    if (e.correcao.tipo === 'trocar') item[e.campo] = e.correcao.para;
    if (e.correcao.tipo === 'renomear') { item[e.correcao.para] = item[e.campo]; delete item[e.campo]; }
    if (e.correcao.tipo === 'remover') remover[e.tipo].add(e.indice);
  }

  if (remover.stop.size) novo.stops = novo.stops.filter((_, i) => !remover.stop.has(i));
  if (remover.activity.size) novo.activities = novo.activities.filter((_, i) => !remover.activity.has(i));
  return novo;
}
