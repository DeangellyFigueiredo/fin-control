import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess, isOwner } from '@/lib/tripAccess';
import { gerarConvite, condicaoDeValido } from '@/lib/tripInvites';

/**
 * Convites da viagem. Tudo aqui é do dono: quem participa lança e vê, mas
 * não traz mais gente.
 */
async function donoOuErro(tripId) {
  const scope = await getScope();
  if (!scope) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const access = await tripAccess(scope.userId, tripId);
  if (!access) return { erro: NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 }) };
  if (!isOwner(access)) {
    return { erro: NextResponse.json({ error: 'Só quem criou a viagem pode convidar' }, { status: 403 }) };
  }

  return { scope };
}

/** Convites ainda em aberto. O token não volta: o banco nem o tem. */
export async function GET(request, { params }) {
  const { id } = await params;
  const { erro } = await donoOuErro(id);
  if (erro) return erro;

  const invites = await prisma.tripInvite.findMany({
    where: { tripId: id, ...condicaoDeValido() },
    select: { id: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(invites);
}

/**
 * Gera um convite. O token sai nesta resposta e em nenhum outro lugar: se a
 * pessoa perder o link, revoga e gera outro.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const { scope, erro } = await donoOuErro(id);
  if (erro) return erro;

  const { token, tokenHash, expiresAt } = gerarConvite();
  const invite = await prisma.tripInvite.create({
    data: { tripId: id, tokenHash, expiresAt, createdById: scope.userId },
    select: { id: true, createdAt: true, expiresAt: true },
  });

  return NextResponse.json({ ...invite, token }, { status: 201 });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { erro } = await donoOuErro(id);
  if (erro) return erro;

  const inviteId = new URL(request.url).searchParams.get('inviteId') || '';

  // tripId no filtro: o id de um convite de outra viagem não casa
  const { count } = await prisma.tripInvite.updateMany({
    where: { id: inviteId, tripId: id, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 });

  return NextResponse.json({ success: true });
}
