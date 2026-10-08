import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess } from '@/lib/tripAccess';
import { validarParada } from '@/lib/roteiro';

/**
 * Paradas do roteiro. Ver docs/rfc/0003-roteiro.md.
 *
 * Qualquer participante edita: o roteiro é um plano a dois. Toda consulta
 * leva `tripId` junto com o `id`, então um id de outra viagem dá 404 e nunca
 * mexe nela.
 */

const naoEncontrada = () => NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });
const paradaNaoEncontrada = () => NextResponse.json({ error: 'Parada não encontrada' }, { status: 404 });

async function acesso(params) {
  const scope = await getScope();
  if (!scope) return { resposta: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return { resposta: naoEncontrada() };
  return { tripId, trip: access.trip };
}

export async function POST(request, { params }) {
  const { resposta, tripId, trip } = await acesso(params);
  if (resposta) return resposta;

  try {
    const { data, error } = validarParada(await request.json(), trip);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const stop = await prisma.tripStop.create({ data: { ...data, tripId } });
    return NextResponse.json(stop, { status: 201 });
  } catch (error) {
    console.error('Create trip stop error:', error);
    return NextResponse.json({ error: 'Erro ao salvar parada' }, { status: 500 });
  }
}

/** Aceita o corpo parcial: o que não vier fica como está. */
export async function PUT(request, { params }) {
  const { resposta, tripId, trip } = await acesso(params);
  if (resposta) return resposta;

  try {
    const body = await request.json();
    const atual = await prisma.tripStop.findFirst({ where: { id: String(body.id || ''), tripId } });
    if (!atual) return paradaNaoEncontrada();

    const { data, error } = validarParada({ ...comoFormulario(atual), ...body }, trip);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const stop = await prisma.tripStop.update({ where: { id: atual.id }, data });
    return NextResponse.json(stop);
  } catch (error) {
    console.error('Update trip stop error:', error);
    return NextResponse.json({ error: 'Erro ao salvar parada' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { resposta, tripId } = await acesso(params);
  if (resposta) return resposta;

  const stopId = new URL(request.url).searchParams.get('stopId') || '';
  const { count } = await prisma.tripStop.deleteMany({ where: { id: stopId, tripId } });
  if (!count) return paradaNaoEncontrada();
  return NextResponse.json({ success: true });
}

/** O registro do banco no formato que a validação espera do formulário. */
function comoFormulario(s) {
  return { ...s, date: s.date.toISOString().slice(0, 10) };
}
