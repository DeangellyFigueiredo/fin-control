import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { hashToken, pareceToken, condicaoDeValido, estadoDoConvite } from '@/lib/tripInvites';

/**
 * Aceita ou recusa um convite de viagem.
 *
 * Token inexistente, usado, revogado ou expirado dão a mesma resposta. Uma
 * mensagem diferente para cada caso diria a quem testa tokens quais existem.
 */
const invalido = () => NextResponse.json({ error: 'Convite inválido ou expirado' }, { status: 404 });

class ConviteInvalido extends Error {}

export async function POST(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { token, action = 'accept' } = await request.json();
    if (!pareceToken(token)) return invalido();
    if (!['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    const invite = await prisma.tripInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, tripId: true, usedAt: true, revokedAt: true, expiresAt: true },
    });
    if (!invite) return invalido();

    // Participação antes da validade, na mesma ordem da página do convite.
    // Quem já está na viagem só é levado a ela: o próprio dono testando o
    // link não gasta o convite, e quem aceitou e clica de novo no link usado
    // não recebe um "inválido" sem sentido.
    const jaParticipa = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId: invite.tripId, userId: scope.userId } },
      select: { id: true },
    });
    if (jaParticipa) return NextResponse.json({ tripId: invite.tripId, already: true });

    if (estadoDoConvite(invite) !== 'valido') return invalido();

    if (action === 'decline') {
      const { count } = await prisma.tripInvite.updateMany({
        where: { id: invite.id, ...condicaoDeValido() },
        data: { revokedAt: new Date() },
      });
      return count ? NextResponse.json({ success: true }) : invalido();
    }

    await prisma.$transaction(async (tx) => {
      // A condição de validade vai no WHERE, e não num if antes: entre ler o
      // convite e gravar, outro aceite pode ter chegado. Aqui só um passa.
      const { count } = await tx.tripInvite.updateMany({
        where: { id: invite.id, ...condicaoDeValido() },
        data: { usedAt: new Date(), usedById: scope.userId },
      });
      if (count === 0) throw new ConviteInvalido();

      await tx.tripMember.create({
        data: { tripId: invite.tripId, userId: scope.userId, role: 'MEMBER' },
      });
    });

    return NextResponse.json({ tripId: invite.tripId });
  } catch (error) {
    if (error instanceof ConviteInvalido) return invalido();
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: 'Erro ao aceitar convite' }, { status: 500 });
  }
}
