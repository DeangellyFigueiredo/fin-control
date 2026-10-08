/**
 * Operações sobre o roteiro propostas pela IA. Ver
 * docs/rfc/0004-roteiro-inteligente.md.
 *
 * As operações são aplicadas primeiro EM MEMÓRIA, sobre o roteiro atual, e
 * cada item que resulta passa pelas mesmas regras da tela (validarParada e
 * validarAtividade). Daí saem três coisas: os erros, a lista de diferenças
 * que o preview mostra e o que gravar. O preview e a gravação usam esta
 * mesma função, então não há como gravar algo diferente do que se viu.
 *
 * Roteiro vazio não é caso à parte: a IA propõe só adições.
 */

import { TRIP_CATEGORIES } from './trips.js';
import { PERIODOS, PET, STATUS, validarParada, validarAtividade } from './roteiro.js';

export const TIPOS = ['addStop', 'updateStop', 'removeStop', 'addActivity', 'updateActivity', 'removeActivity', 'moveActivity'];

const ou = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const texto = ou({ type: 'string' });

const CAMPOS_PARADA = {
  city: texto, uf: texto, date: texto, order: ou({ type: 'integer' }),
  lodgingName: texto, notes: texto, legNotes: texto, arriveBy: texto,
};
const CAMPOS_ATIVIDADE = {
  title: texto, date: texto, time: texto,
  period: ou({ type: 'string', enum: Object.keys(PERIODOS) }),
  order: ou({ type: 'integer' }), place: texto,
  category: ou({ type: 'string', enum: TRIP_CATEGORIES }),
  estimatedCost: ou({ type: 'number' }),
  pet: ou({ type: 'string', enum: Object.keys(PET) }),
  status: ou({ type: 'string', enum: Object.keys(STATUS) }),
  notes: texto, link: texto,
};
const objeto = (props) => ({
  type: 'object', additionalProperties: false, required: Object.keys(props), properties: props,
});

/** Schema da ferramenta `propor_mudancas` (strict). Campo null = "não mexe". */
export const SCHEMA_PROPOSTA = objeto({
  resumo: { type: 'string', description: 'Uma frase dizendo o que muda' },
  operacoes: {
    type: 'array',
    items: objeto({
      tipo: { type: 'string', enum: TIPOS },
      alvoId: { ...texto, description: 'id da parada ou atividade existente; null nas adições' },
      parada: ou(objeto(CAMPOS_PARADA)),
      atividade: ou(objeto(CAMPOS_ATIVIDADE)),
    }),
  },
});

/** Versão do roteiro: muda quando qualquer parada ou atividade muda. FNV-1a de 32 bits. */
export function versaoDoRoteiro(stops, activities) {
  const linhas = [...stops.map(s => `s:${s.id}:${new Date(s.updatedAt).toISOString()}`),
    ...activities.map(a => `a:${a.id}:${new Date(a.updatedAt).toISOString()}`)].sort().join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < linhas.length; i++) {
    h ^= linhas.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const semNulos = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== null && v !== undefined));
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10));
/** O registro como o formulário mandaria: datas em "AAAA-MM-DD". */
const comoFormulario = (x) => ({ ...x, date: iso(x.date) });

const ROTULOS = {
  city: 'cidade', uf: 'UF', date: 'data', order: 'ordem', lodgingName: 'hospedagem', notes: 'notas',
  legNotes: 'notas do trecho', arriveBy: 'chegada', title: 'nome', time: 'hora', period: 'período',
  place: 'lugar', category: 'categoria', estimatedCost: 'custo estimado', pet: 'pet', status: 'status', link: 'link',
  lat: 'coordenadas',
};

/** null, '' e custo 0 são todos "sem valor": o banco guarda '' e 0 como padrão. */
function valor(campo, v) {
  if (campo === 'date') return iso(v);
  if (v === '' || v == null || (campo === 'estimatedCost' && v === 0)) return null;
  return v;
}

function mudancas(antes, depois, campos) {
  return campos
    .filter(c => c !== 'lng' && JSON.stringify(valor(c, antes[c])) !== JSON.stringify(valor(c, depois[c])))
    .map(c => ({ campo: ROTULOS[c] || c, antes: valor(c, antes[c]), depois: valor(c, depois[c]) }));
}

/**
 * Aplica `ops` sobre `atual` ({ stops, activities }, como vêm do banco).
 * Paradas novas precisam chegar com `lat`/`lng` já resolvidos pelo servidor.
 *
 * Devolve `{ erros, diff, gravar }`. Com qualquer erro, nada deve ser gravado.
 */
export function aplicarOperacoes(atual, ops, trip) {
  const stops = new Map(atual.stops.map(s => [s.id, { ...s }]));
  const activities = new Map(atual.activities.map(a => [a.id, { ...a }]));
  const erros = [];
  const diff = [];
  const gravar = {
    criarParadas: [], atualizarParadas: new Map(), apagarParadas: [],
    criarAtividades: [], atualizarAtividades: new Map(), apagarAtividades: [],
  };
  const falha = (i, op, mensagem) => erros.push({ indice: i, tipo: op?.tipo, mensagem });

  (ops || []).forEach((op, i) => {
    if (!TIPOS.includes(op?.tipo)) return falha(i, op, 'Operação desconhecida');
    const ehParada = op.tipo.endsWith('Stop');
    const mapa = ehParada ? stops : activities;
    const dados = semNulos(ehParada ? op.parada : op.atividade);
    const validar = ehParada ? validarParada : validarAtividade;
    const nome = (x) => (ehParada ? x.city : x.title);

    if (op.tipo === 'addStop' || op.tipo === 'addActivity') {
      if (ehParada && (dados.lat == null || dados.lng == null)) {
        return falha(i, op, `Cidade não encontrada: ${dados.city || 'sem nome'}${dados.uf ? `/${dados.uf}` : ''}`);
      }
      if (!ehParada && dados.order == null) {
        // Sem ordem, entra no fim do dia
        const doDia = [...activities.values()].filter(a => iso(a.date) === dados.date);
        dados.order = doDia.length ? Math.max(...doDia.map(a => a.order || 0)) + 1 : 0;
      }
      const r = validar({ ...dados, status: dados.status || 'PLANEJADA' }, trip);
      if (r.error) return falha(i, op, `${nome(dados) || 'Item novo'}: ${r.error}`);
      const id = `novo-${i}`;
      mapa.set(id, { ...r.data, id, _novo: true });
      (ehParada ? gravar.criarParadas : gravar.criarAtividades).push(r.data);
      diff.push({ acao: 'adicionar', tipo: ehParada ? 'parada' : 'atividade', titulo: nome(r.data), data: iso(r.data.date), mudancas: [] });
      return;
    }

    const alvo = mapa.get(String(op.alvoId || ''));
    if (!alvo || alvo._novo) return falha(i, op, `${ehParada ? 'Parada' : 'Atividade'} não encontrada neste roteiro`);

    if (op.tipo === 'removeStop' || op.tipo === 'removeActivity') {
      mapa.delete(alvo.id);
      (ehParada ? gravar.apagarParadas : gravar.apagarAtividades).push(alvo.id);
      (ehParada ? gravar.atualizarParadas : gravar.atualizarAtividades).delete(alvo.id);
      diff.push({ acao: 'remover', tipo: ehParada ? 'parada' : 'atividade', titulo: nome(alvo), data: iso(alvo.date), mudancas: [] });
      return;
    }

    // updateStop, updateActivity, moveActivity: o que vier substitui, o resto fica
    if (op.tipo === 'moveActivity') {
      for (const c of Object.keys(dados)) if (!['date', 'period', 'time', 'order'].includes(c)) delete dados[c];
    }
    if (ehParada && dados.city && dados.city !== alvo.city && (dados.lat == null || dados.lng == null)) {
      return falha(i, op, `Cidade não encontrada: ${dados.city}${dados.uf ? `/${dados.uf}` : ''}`);
    }
    const r = validar({ ...comoFormulario(alvo), ...dados }, trip);
    if (r.error) return falha(i, op, `${nome(alvo)}: ${r.error}`);
    const lista = mudancas(alvo, r.data, Object.keys(r.data));
    if (!lista.length) return;
    mapa.set(alvo.id, { ...alvo, ...r.data });
    (ehParada ? gravar.atualizarParadas : gravar.atualizarAtividades).set(alvo.id, r.data);
    diff.push({ acao: op.tipo === 'moveActivity' ? 'mover' : 'alterar', tipo: ehParada ? 'parada' : 'atividade', titulo: nome(alvo), data: iso(r.data.date), mudancas: lista });
  });

  return {
    erros,
    diff,
    gravar: {
      ...gravar,
      atualizarParadas: [...gravar.atualizarParadas.entries()].map(([id, data]) => ({ id, data })),
      atualizarAtividades: [...gravar.atualizarAtividades.entries()].map(([id, data]) => ({ id, data })),
    },
  };
}

/** O roteiro como a IA lê: compacto, com ids e datas em texto. */
export function roteiroParaIA(stops, activities) {
  return {
    paradas: stops.map(s => ({
      id: s.id, city: s.city, uf: s.uf, date: iso(s.date), order: s.order,
      lodgingName: s.lodgingName || null, arriveBy: s.arriveBy || null,
    })),
    atividades: activities.map(a => ({
      id: a.id, title: a.title, date: iso(a.date), time: a.time || null, period: a.period, place: a.place || null,
      category: a.category, pet: a.pet, status: a.status, estimatedCost: a.estimatedCost || null,
    })),
  };
}
