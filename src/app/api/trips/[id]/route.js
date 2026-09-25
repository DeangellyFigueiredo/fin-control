import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess, isOwner, entryView, memberView } from '@/lib/tripAccess';
import { validarViagem } from '@/lib/trips';

const naoEncontrada = () => NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });

export async function GET(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const access = await tripAccess(scope.userId, id);
  if (!access) return naoEncontrada();

  const [members, entries] = await Promise.all([
    prisma.tripMember.findMany({
      where: { tripId: id },
      include: { user: { select: { name: true, nickname: true } } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.tripEntry.findMany({
      where: { tripId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  return NextResponse.json({
    trip: access.trip,
    role: access.role,
    me: scope.userId,
    members: members.map(memberView),
    entries: entries.map(e => entryView(e, scope.userId)),
  });
}

export async function PUT(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const access = await tripAccess(scope.userId, id);
  if (!access) return naoEncontrada();
  if (!isOwner(access)) {
    return NextResponse.json({ error: 'Só quem criou a viagem pode mudar datas e orçamento' }, { status: 403 });
  }

  try {
    const { data, error } = validarViagem(await request.json());
    if (error) return NextResponse.json({ error }, { status: 400 });

    const trip = await prisma.trip.update({ where: { id }, data });
    return NextResponse.json(trip);
  } catch (error) {
    console.error('Update trip error:', error);
    return NextResponse.json({ error: 'Erro ao salvar viagem' }, { status: 500 });
  }
}

/**
 * Leva junto participantes e gastos. Os lançamentos ligados ficam nas
 * contas: a FK é do gasto para o lançamento, então apagar o gasto não
 * desfaz um pagamento que aconteceu.
 */
export async function DELETE(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const access = await tripAccess(scope.userId, id);
  if (!access) return naoEncontrada();
  if (!isOwner(access)) {
    return NextResponse.json({ error: 'Só quem criou a viagem pode apagá-la' }, { status: 403 });
  }

  await prisma.trip.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
