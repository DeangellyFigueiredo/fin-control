import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getScope } from '@/lib/auth';
import { normalize } from '@/lib/categorize';

/**
 * Regras de categorização: "UBER" → Transporte.
 *
 * Ficam visíveis de propósito. Se um lançamento caiu em Transporte, existe
 * uma linha aqui explicando por quê, e dá para apagá-la.
 */
export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const rules = await db.categoryRule.findMany({
    include: { category: true },
    orderBy: [{ hits: 'desc' }, { pattern: 'asc' }],
  });

  return NextResponse.json(rules);
}

export async function POST(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  try {
    const { pattern, categoryId } = await request.json();

    const limpo = normalize(pattern);
    if (!limpo || limpo.length < 3) {
      return NextResponse.json({ error: 'O padrão precisa de pelo menos 3 letras' }, { status: 400 });
    }
    if (!categoryId) return NextResponse.json({ error: 'Escolha a categoria' }, { status: 400 });

    await assertOwned(db, { categoryId });

    // Mesmo padrão duas vezes vira atualização, não duplicata
    const existente = await db.categoryRule.findFirst({ where: { pattern: limpo }, select: { id: true } });

    const rule = existente
      ? await db.categoryRule.update({
          where: { id: existente.id }, data: { categoryId }, include: { category: true },
        })
      : await db.categoryRule.create({
          data: { pattern: limpo, categoryId }, include: { category: true },
        });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create rule error:', error);
    return NextResponse.json({ error: 'Erro ao criar regra' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const { count } = await db.categoryRule.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

  return NextResponse.json({ success: true });
}
