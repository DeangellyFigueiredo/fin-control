import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripsOf } from '@/lib/tripAccess';
import { validarViagem } from '@/lib/trips';

/**
 * Viagens de que a pessoa participa. Não passa por userDb: a viagem é da
 * pessoa, não da carteira, e é compartilhada — o filtro é a participação,
 * aplicado em tripsOf.
 */
export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const trips = await tripsOf(scope.userId);
  return NextResponse.json(trips);
}

export async function POST(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { data, error } = validarViagem(await request.json());
    if (error) return NextResponse.json({ error }, { status: 400 });

    // Quem cria entra como participante já na criação: sem essa linha, nem o
    // dono passaria pela checagem de acesso.
    const trip = await prisma.trip.create({
      data: {
        ...data,
        ownerId: scope.userId,
        members: { create: { userId: scope.userId, role: 'OWNER' } },
      },
    });

    return NextResponse.json(trip, { status: 201 });
  } catch (error) {
    console.error('Create trip error:', error);
    return NextResponse.json({ error: 'Erro ao criar viagem' }, { status: 500 });
  }
}
