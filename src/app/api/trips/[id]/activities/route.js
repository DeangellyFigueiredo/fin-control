import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess } from '@/lib/tripAccess';
import { validarAtividade } from '@/lib/roteiro';

/**
 * Atividades do roteiro. Ver docs/rfc/0003-roteiro.md.
 *
 * O PUT aceita corpo parcial, porque a tela manda só o que mudou: o status
 * num toque, a ordem pelas setas, o dia pelo "mover para…". O registro é
 * completado com o que está no banco e validado inteiro.
 */

const naoEncontrada = () => NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });
const atividadeNaoEncontrada = () => NextResponse.json({ error: 'Atividade não encontrada' }, { status: 404 });

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
    const { data, error } = validarAtividade(await request.json(), trip);
    if (error) return NextResponse.json({ error }, { status: 400 });

    // Sem ordem informada, entra no fim do dia
    if (!data.order) {
      const ultima = await prisma.tripActivity.findFirst({
        where: { tripId, date: data.date },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      data.order = ultima ? ultima.order + 1 : 0;
    }

    const activity = await prisma.tripActivity.create({ data: { ...data, tripId } });
    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    console.error('Create trip activity error:', error);
    return NextResponse.json({ error: 'Erro ao salvar atividade' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { resposta, tripId, trip } = await acesso(params);
  if (resposta) return resposta;

  try {
    const body = await request.json();
    const atual = await prisma.tripActivity.findFirst({ where: { id: String(body.id || ''), tripId } });
    if (!atual) return atividadeNaoEncontrada();

    const base = { ...atual, date: atual.date.toISOString().slice(0, 10) };
    const { data, error } = validarAtividade({ ...base, ...body }, trip);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const activity = await prisma.tripActivity.update({ where: { id: atual.id }, data });
    return NextResponse.json(activity);
  } catch (error) {
    console.error('Update trip activity error:', error);
    return NextResponse.json({ error: 'Erro ao salvar atividade' }, { status: 500 });
  }
}

/** Os gastos ligados ficam na viagem, só sem a atividade (SetNull). */
export async function DELETE(request, { params }) {
  const { resposta, tripId } = await acesso(params);
  if (resposta) return resposta;

  const activityId = new URL(request.url).searchParams.get('activityId') || '';
  const { count } = await prisma.tripActivity.deleteMany({ where: { id: activityId, tripId } });
  if (!count) return atividadeNaoEncontrada();
  return NextResponse.json({ success: true });
}
