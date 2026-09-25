import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess, isOwner } from '@/lib/tripAccess';

/**
 * Tira alguém da viagem: o dono remove outra pessoa, ou o participante sai.
 *
 * Os gastos dessa pessoa na viagem vão junto. Os lançamentos pela conta
 * ficam no extrato dela, porque o dinheiro saiu de fato; só deixam de fazer
 * parte da viagem.
 *
 * O dono não sai. Uma viagem sem dono não teria quem convidar nem quem
 * apagá-la, e o caminho para "não quero mais" é apagar a viagem.
 */
export async function DELETE(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });

  const alvo = new URL(request.url).searchParams.get('userId') || '';
  const saindo = alvo === scope.userId;

  if (saindo && isOwner(access)) {
    return NextResponse.json({ error: 'Quem criou a viagem não sai dela. Para encerrar, apague a viagem.' }, { status: 400 });
  }
  if (!saindo && !isOwner(access)) {
    return NextResponse.json({ error: 'Só quem criou a viagem pode remover participantes' }, { status: 403 });
  }

  // role MEMBER no filtro: nem o dono remove a si mesmo por aqui
  const membro = await prisma.tripMember.findFirst({
    where: { tripId, userId: alvo, role: 'MEMBER' },
    select: { id: true },
  });
  if (!membro) return NextResponse.json({ error: 'Participante não encontrado' }, { status: 404 });

  await prisma.$transaction([
    prisma.tripEntry.deleteMany({ where: { tripId, userId: alvo } }),
    prisma.tripMember.delete({ where: { id: membro.id } }),
  ]);

  return NextResponse.json({ success: true });
}
