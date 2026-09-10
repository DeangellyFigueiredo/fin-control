import { NextResponse } from 'next/server';
import { userDb, NotOwnedError } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  // Uma consulta de saldos para todas as contas, em vez de uma por conta.
  const [accounts, groups] = await Promise.all([
    db.bankAccount.findMany({ orderBy: { name: 'asc' } }),
    db.transaction.groupBy({
      by: ['bankAccountId', 'type'],
      _sum: { amount: true },
    }),
  ]);

  const sumOf = (accountId, type) =>
    groups.find(g => g.bankAccountId === accountId && g.type === type)?._sum?.amount || 0;

  const accountsWithBalance = accounts.map(acc => ({
    ...acc,
    // Aporte sai da conta como qualquer saída, mesmo não sendo despesa.
    currentBalance: acc.initialBalance
      + sumOf(acc.id, 'INCOME') - sumOf(acc.id, 'EXPENSE') - sumOf(acc.id, 'INVESTMENT'),
  }));

  return NextResponse.json(accountsWithBalance);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const { name, color, icon, initialBalance } = await request.json();
    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    const account = await db.bankAccount.create({
      data: {
        name,
        color: color || '#6c5ce7',
        icon: icon || '🏦',
        initialBalance: parseFloat(initialBalance) || 0,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create account error:', error);
    return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const { id, name, color, icon, initialBalance } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const account = await db.bankAccount.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(color && { color }),
        ...(icon && { icon }),
        ...(initialBalance !== undefined && { initialBalance: parseFloat(initialBalance) }),
      },
    });

    return NextResponse.json(account);
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Update account error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  // deleteMany em vez de delete: com o cliente escopado, um id de
  // outro usuário simplesmente não casa, e vira 404 em vez de erro.
  const { count } = await db.bankAccount.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  return NextResponse.json({ success: true });
}
