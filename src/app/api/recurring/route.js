import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  const entries = await prisma.recurringEntry.findMany({
    where: type ? { type } : undefined,
    include: { bankAccount: true, category: true, creditCard: true },
    orderBy: [{ type: 'asc' }, { dayOfMonth: 'asc' }],
  });

  return NextResponse.json(entries);
}

function parseBody(body) {
  const {
    name, type, amount, dayOfMonth, frequency, monthOfYear,
    startDate, endDate, bankAccountId, categoryId, creditCardId, notes, active,
  } = body;

  return {
    name,
    type,
    amount: parseFloat(amount),
    dayOfMonth: parseInt(dayOfMonth, 10),
    frequency: frequency || 'MONTHLY',
    monthOfYear: frequency === 'YEARLY' && monthOfYear ? parseInt(monthOfYear, 10) : null,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    bankAccountId: bankAccountId || null,
    categoryId: categoryId || null,
    creditCardId: creditCardId || null,
    notes: notes || '',
    active: active === undefined ? true : Boolean(active),
  };
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    if (!body.name || !body.type || !body.amount || !body.dayOfMonth) {
      return NextResponse.json({ error: 'Campos obrigatórios: nome, tipo, valor e dia' }, { status: 400 });
    }

    const data = parseBody(body);
    if (data.dayOfMonth < 1 || data.dayOfMonth > 31) {
      return NextResponse.json({ error: 'O dia deve estar entre 1 e 31' }, { status: 400 });
    }

    const entry = await prisma.recurringEntry.create({
      data,
      include: { bankAccount: true, category: true, creditCard: true },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Create recurring error:', error);
    return NextResponse.json({ error: 'Erro ao criar lançamento recorrente' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const entry = await prisma.recurringEntry.update({
      where: { id: body.id },
      data: parseBody(body),
      include: { bankAccount: true, category: true, creditCard: true },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Update recurring error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  await prisma.recurringEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
