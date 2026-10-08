import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess, isOwner } from '@/lib/tripAccess';
import { analisarRoteiro } from '@/lib/importacao';

/**
 * Importa um roteiro inteiro colado como JSON: `{ stops, activities }`.
 * Ver docs/rfc/0003-roteiro.md.
 *
 * Só o dono, e só com o roteiro vazio. Mesclar com o que já existe exigiria
 * regra de conflito, e o caso real é cadastrar uma vez.
 */
export async function POST(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });
  if (!isOwner(access)) {
    return NextResponse.json({ error: 'Só quem criou a viagem pode importar o roteiro' }, { status: 403 });
  }

  let json;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Não é um JSON válido' }, { status: 400 });
  }

  // A mesma análise do preview, de novo aqui: o servidor não confia na tela.
  // Devolve todos os erros, para a tela mostrar a lista inteira.
  const { data, erros } = analisarRoteiro(json, access.trip);
  if (erros.length) {
    return NextResponse.json({ error: erros[0].mensagem, erros }, { status: 400 });
  }

  try {
    const criado = await prisma.$transaction(async (tx) => {
      const [paradas, atividades] = await Promise.all([
        tx.tripStop.count({ where: { tripId } }),
        tx.tripActivity.count({ where: { tripId } }),
      ]);
      if (paradas || atividades) return null;

      await tx.tripStop.createMany({ data: data.stops.map(s => ({ ...s, tripId })) });
      await tx.tripActivity.createMany({ data: data.activities.map(a => ({ ...a, tripId })) });
      return { paradas: data.stops.length, atividades: data.activities.length };
    });

    if (!criado) {
      return NextResponse.json({ error: 'O roteiro já tem itens. A importação só vale para roteiro vazio.' }, { status: 409 });
    }
    return NextResponse.json(criado, { status: 201 });
  } catch (error) {
    console.error('Import itinerary error:', error);
    return NextResponse.json({ error: 'Erro ao importar o roteiro' }, { status: 500 });
  }
}
