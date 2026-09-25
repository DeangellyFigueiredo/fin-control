import prisma from './prisma.js';

/**
 * A única porta entre usuários. Ver docs/rfc/0002-viagens.md.
 *
 * Viagem é compartilhada, então não cabe no cliente escopado de db.js — lá
 * todo registro tem um dono só. Em vez de abrir uma exceção naquele filtro,
 * que protege todo o resto, o acesso à viagem mora aqui, e segue duas regras:
 *
 *   1. Nada é lido antes de confirmar que quem pede participa da viagem.
 *   2. Em nome de um participante, só se leem as tabelas trip_*. Nunca
 *      transactions, contas, cartões ou qualquer modelo escopado de outra
 *      pessoa — por isso TripEntry guarda cópia de data, valor e descrição.
 *
 * Quem não participa recebe o mesmo 404 de uma viagem que não existe: a
 * resposta não confirma nem que o id é válido.
 */

export async function tripAccess(userId, tripId) {
  if (!userId) throw new Error('tripAccess exige um userId');
  if (!tripId || typeof tripId !== 'string') return null;

  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    include: { trip: true },
  });

  return member ? { trip: member.trip, role: member.role } : null;
}

export const isOwner = (access) => access?.role === 'OWNER';

/** Viagens de que a pessoa participa, com o mínimo dos gastos para o resumo. */
export async function tripsOf(userId) {
  if (!userId) throw new Error('tripsOf exige um userId');

  return prisma.trip.findMany({
    where: { members: { some: { userId } } },
    include: {
      entries: { select: { date: true, amount: true, type: true, category: true, userId: true } },
    },
    orderBy: { startDate: 'desc' },
  });
}

/**
 * O que um participante pode ver de um gasto. Escolha explícita de campos:
 * um `include` a mais aqui mostraria a conta de outra pessoa. O vínculo com
 * o lançamento vira só um booleano, e só para quem lançou.
 */
export function entryView(entry, viewerId) {
  const mine = entry.userId === viewerId;
  return {
    id: entry.id,
    userId: entry.userId,
    date: entry.date,
    amount: entry.amount,
    type: entry.type,
    description: entry.description,
    category: entry.category,
    method: entry.method,
    mine,
    linked: mine ? Boolean(entry.transactionId) : undefined,
  };
}

/** Nome para exibir, sem email: o participante não precisa dele. */
export const memberView = (m) => ({
  userId: m.userId,
  role: m.role,
  name: m.user?.nickname || m.user?.name || 'Participante',
});
