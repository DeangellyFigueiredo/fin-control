import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { monthStartUTC, monthEndUTC } from '@/lib/calendar';

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

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

  const transactions = await db.transaction.findMany({
    where,
    include: { bankAccount: true, category: true },
    orderBy: { date: 'desc' },
  });

  return NextResponse.json(transactions);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const body = await request.json();
    const {
      date, amount, type, description, bankAccountId, categoryId,
      investmentId, isRetroactive,
    } = body;

    if (!date || !amount || !type || !bankAccountId) {
      return NextResponse.json({ error: 'Campos obrigatórios: data, valor, tipo, conta' }, { status: 400 });
    }

    if (!['INCOME', 'EXPENSE', 'INVESTMENT'].includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }

    const value = parseFloat(amount);
    if (!(value > 0)) {
      return NextResponse.json({ error: 'Valor deve ser maior que zero' }, { status: 400 });
    }

    if (type === 'INVESTMENT' && !investmentId) {
      return NextResponse.json({ error: 'Escolha em qual investimento aportar' }, { status: 400 });
    }

    const retro = Boolean(isRetroactive);

    await assertOwned(db, { bankAccountId, categoryId, investmentId });

    const transaction = await db.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          date: new Date(date),
          amount: value,
          type,
          description: description || '',
          bankAccountId,
          categoryId: categoryId || null,
          investmentId: type === 'INVESTMENT' ? investmentId : null,
          isRetroactive: retro,
        },
        include: { bankAccount: true, category: true, investment: true },
      });

      if (type !== 'INVESTMENT') return created;

      // O aporte entra sempre no histórico do investimento...
      await tx.investmentEntry.create({
        data: {
          investmentId,
          date: new Date(date),
          type: 'APORTE',
          amount: value,
          description: description || '',
          isRetroactive: retro,
        },
      });

      // ...mas só move o saldo quando não é retroativo: um aporte antigo já
      // está embutido no valor atual que foi informado.
      if (!retro) {
        const inv = await tx.investment.findUnique({ where: { id: investmentId } });
        if (inv) {
          const totalInvested = inv.totalInvested + value;
          const currentValue = inv.currentValue + value;
          const profit = currentValue - totalInvested;

          await tx.investment.update({
            where: { id: investmentId },
            data: {
              totalInvested,
              currentValue,
              profit,
              profitPercentage: totalInvested > 0 ? (profit / totalInvested) * 100 : 0,
            },
          });
        }
      }

      return created;
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create transaction error:', error);
    return NextResponse.json({ error: 'Erro ao criar transação' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const body = await request.json();
    const { id, date, amount, type, description, bankAccountId, categoryId } = body;

    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    await assertOwned(db, { bankAccountId, categoryId });

    const transaction = await db.transaction.update({
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
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Update transaction error:', error);
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
  const { count } = await db.transaction.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  return NextResponse.json({ success: true });
}
