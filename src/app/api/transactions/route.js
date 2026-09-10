import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { monthStartUTC, monthEndUTC } from '@/lib/calendar';

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get('month')) || new Date().getMonth() + 1;
  const year = parseInt(searchParams.get('year')) || new Date().getFullYear();
  const type = searchParams.get('type');
  const accountId = searchParams.get('accountId');
  const categoryId = searchParams.get('categoryId');

  const startDate = monthStartUTC(year, month);
  const endDate = monthEndUTC(year, month);

  const where = {
    date: { gte: startDate, lte: endDate },
  };

  if (type) where.type = type;
  if (accountId) where.bankAccountId = accountId;
  if (categoryId) where.categoryId = categoryId;

  const transactions = await prisma.transaction.findMany({
    where,
    include: { bankAccount: true, category: true },
    orderBy: { date: 'desc' },
  });

  return NextResponse.json(transactions);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    const { date, amount, type, description, bankAccountId, categoryId } = body;

    if (!date || !amount || !type || !bankAccountId) {
      return NextResponse.json({ error: 'Campos obrigatórios: data, valor, tipo, conta' }, { status: 400 });
    }

    const transaction = await prisma.transaction.create({
      data: {
        date: new Date(date),
        amount: parseFloat(amount),
        type,
        description: description || '',
        bankAccountId,
        categoryId: categoryId || null,
      },
      include: { bankAccount: true, category: true },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error('Create transaction error:', error);
    return NextResponse.json({ error: 'Erro ao criar transação' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    const { id, date, amount, type, description, bankAccountId, categoryId } = body;

    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(date && { date: new Date(date) }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(type && { type }),
        ...(description !== undefined && { description }),
        ...(bankAccountId && { bankAccountId }),
        categoryId: categoryId || null,
      },
      include: { bankAccount: true, category: true },
    });

    return NextResponse.json(transaction);
  } catch (error) {
    console.error('Update transaction error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
