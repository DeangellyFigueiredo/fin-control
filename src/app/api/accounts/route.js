import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const accounts = await prisma.bankAccount.findMany({
    orderBy: { name: 'asc' },
  });

  // Calculate current balance for each account
  const accountsWithBalance = await Promise.all(
    accounts.map(async (acc) => {
      const result = await prisma.transaction.groupBy({
        by: ['type'],
        where: { bankAccountId: acc.id },
        _sum: { amount: true },
      });

      const sumOf = (type) => result.find(r => r.type === type)?._sum?.amount || 0;
      // Aporte sai da conta como qualquer saída, mesmo não sendo despesa.
      const currentBalance = acc.initialBalance
        + sumOf('INCOME') - sumOf('EXPENSE') - sumOf('INVESTMENT');

      return { ...acc, currentBalance };
    })
  );

  return NextResponse.json(accountsWithBalance);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { name, color, icon, initialBalance } = await request.json();
    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    const account = await prisma.bankAccount.create({
      data: {
        name,
        color: color || '#6c5ce7',
        icon: icon || '🏦',
        initialBalance: parseFloat(initialBalance) || 0,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error('Create account error:', error);
    return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { id, name, color, icon, initialBalance } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const account = await prisma.bankAccount.update({
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
    console.error('Update account error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  await prisma.bankAccount.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
