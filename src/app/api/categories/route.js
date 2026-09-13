import { NextResponse } from 'next/server';
import { userDb, NotOwnedError } from '@/lib/db';
import { getScope } from '@/lib/auth';

export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const categories = await db.category.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json(categories);
}

export async function POST(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  try {
    const { name, type, color, icon } = await request.json();
    if (!name || !type) return NextResponse.json({ error: 'Nome e tipo obrigatórios' }, { status: 400 });

    const category = await db.category.create({
      data: { name, type, color: color || '#6c5ce7' },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create category error:', error);
    return NextResponse.json({ error: 'Erro ao criar categoria' }, { status: 500 });
  }
}
