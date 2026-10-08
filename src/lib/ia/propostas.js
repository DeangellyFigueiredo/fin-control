import prisma from '../prisma.js';
import { aplicarOperacoes, versaoDoRoteiro } from '../operacoes.js';
import { coordenadaDaCidade } from '../externo/cidade.js';

/**
 * Propostas da IA guardadas no servidor (RFC 0004). Confirmar aplica
 * exatamente o que foi guardado, uma vez só, e só se o roteiro não mudou
 * desde a proposta (o outro participante pode ter editado nesse meio-tempo).
 */

const VALIDADE_MS = 24 * 60 * 60 * 1000;

export async function roteiroAtual(tripId) {
  const [stops, activities] = await Promise.all([
    prisma.tripStop.findMany({ where: { tripId } }),
    prisma.tripActivity.findMany({ where: { tripId } }),
  ]);
  return { stops, activities, versao: versaoDoRoteiro(stops, activities) };
}

/**
 * A IA manda cidade e UF; a coordenada sai daqui (lugares.js, cache ou
 * Nominatim). Cidade não encontrada fica sem coordenada, e a operação vira
 * erro no preview, com o nome da cidade.
 */
export async function resolverCidades(operacoes) {
  const resolvidas = [];
  for (const op of operacoes) {
    const p = op?.parada;
    const precisa = p?.city && (op.tipo === 'addStop' || op.tipo === 'updateStop');
    if (!precisa) { resolvidas.push(op); continue; }
    const c = await coordenadaDaCidade(p.city, p.uf).catch(() => null);
    resolvidas.push(c?.encontrada
      ? { ...op, parada: { ...p, city: c.city, uf: c.uf || p.uf, lat: c.lat, lng: c.lng } }
      : op);
  }
  return resolvidas;
}

/** Guarda a proposta com o preview calculado agora. */
export async function criarProposta({ tripId, userId, trip, toolUseId, resumo, operacoes }) {
  const atual = await roteiroAtual(tripId);
  const ops = await resolverCidades(operacoes);
  const { erros, diff } = aplicarOperacoes(atual, ops, trip);
  return prisma.tripProposal.create({
    data: {
      tripId,
      userId,
      resumo: resumo.slice(0, 300),
      payload: { toolUseId, ops, diff, erros },
      baseVersion: atual.versao,
      expiresAt: new Date(Date.now() + VALIDADE_MS),
    },
  });
}

export function situacaoDaProposta(p, versaoAtual, agora = new Date()) {
  if (p.appliedAt) return 'aplicada';
  if (p.discardedAt) return 'descartada';
  if (p.expiresAt <= agora) return 'expirada';
  if (p.payload?.erros?.length) return 'com-erros';
  if (versaoAtual && versaoAtual !== p.baseVersion) return 'desatualizada';
  return 'pendente';
}

/** O que a IA fica sabendo, na próxima mensagem, sobre o que a pessoa fez com a proposta. */
export const RETORNO_PARA_IA = {
  aplicada: 'A pessoa aplicou estas mudanças; o roteiro atual já as inclui.',
  descartada: 'A pessoa descartou esta proposta; nada mudou.',
  expirada: 'A proposta expirou sem ser aplicada; nada mudou.',
  'com-erros': 'A proposta tinha erros e não pôde ser aplicada; nada mudou. Veja o roteiro atual.',
  desatualizada: 'O roteiro mudou antes de a pessoa decidir; a proposta não foi aplicada.',
  pendente: 'A pessoa ainda não decidiu sobre esta proposta; nada mudou por enquanto.',
};

export class ErroProposta extends Error {
  constructor(mensagem, status = 409) {
    super(mensagem);
    this.status = status;
  }
}

/**
 * Aplica a proposta `id`, de `userId`, na viagem. Reconfere tudo contra o
 * roteiro de agora e grava numa transação só. A "reserva" da proposta
 * (appliedAt) acontece dentro da mesma transação, com a validade no WHERE:
 * dois cliques ao mesmo tempo aplicam uma vez.
 */
export async function aplicarProposta({ id, tripId, userId, trip }) {
  const p = await prisma.tripProposal.findFirst({ where: { id, tripId, userId } });
  if (!p) throw new ErroProposta('Proposta não encontrada', 404);

  const atual = await roteiroAtual(tripId);
  const situacao = situacaoDaProposta(p, atual.versao);
  if (situacao !== 'pendente') {
    const motivo = {
      aplicada: 'Essa proposta já foi aplicada.',
      descartada: 'Essa proposta foi descartada.',
      expirada: 'Essa proposta expirou. Peça de novo à IA.',
      'com-erros': 'Essa proposta tem erros e não pode ser aplicada.',
      desatualizada: 'O roteiro mudou desde a proposta. Peça uma nova à IA.',
    }[situacao];
    throw new ErroProposta(motivo);
  }

  const { erros, gravar } = aplicarOperacoes(atual, p.payload.ops, trip);
  if (erros.length) throw new ErroProposta(`A proposta não vale mais: ${erros[0].mensagem}`);

  await prisma.$transaction(async (tx) => {
    const reserva = await tx.tripProposal.updateMany({
      where: { id, appliedAt: null, discardedAt: null, expiresAt: { gt: new Date() } },
      data: { appliedAt: new Date() },
    });
    if (reserva.count !== 1) throw new ErroProposta('Essa proposta já foi aplicada.');

    // De novo, dentro da transação: alguém pode ter editado entre a checagem
    // lá de cima e aqui
    const [s, a] = await Promise.all([
      tx.tripStop.findMany({ where: { tripId }, select: { id: true, updatedAt: true } }),
      tx.tripActivity.findMany({ where: { tripId }, select: { id: true, updatedAt: true } }),
    ]);
    if (versaoDoRoteiro(s, a) !== p.baseVersion) {
      throw new ErroProposta('O roteiro mudou desde a proposta. Peça uma nova à IA.');
    }

    if (gravar.criarParadas.length) {
      await tx.tripStop.createMany({ data: gravar.criarParadas.map(s => ({ ...s, tripId })) });
    }
    if (gravar.criarAtividades.length) {
      await tx.tripActivity.createMany({ data: gravar.criarAtividades.map(a => ({ ...a, tripId })) });
    }
    for (const { id: stopId, data } of gravar.atualizarParadas) {
      await tx.tripStop.updateMany({ where: { id: stopId, tripId }, data });
    }
    for (const { id: activityId, data } of gravar.atualizarAtividades) {
      await tx.tripActivity.updateMany({ where: { id: activityId, tripId }, data });
    }
    if (gravar.apagarParadas.length) {
      await tx.tripStop.deleteMany({ where: { id: { in: gravar.apagarParadas }, tripId } });
    }
    if (gravar.apagarAtividades.length) {
      await tx.tripActivity.deleteMany({ where: { id: { in: gravar.apagarAtividades }, tripId } });
    }
  });

  return {
    paradas: gravar.criarParadas.length + gravar.atualizarParadas.length + gravar.apagarParadas.length,
    atividades: gravar.criarAtividades.length + gravar.atualizarAtividades.length + gravar.apagarAtividades.length,
  };
}
