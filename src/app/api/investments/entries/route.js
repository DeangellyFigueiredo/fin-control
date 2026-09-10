import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const { investmentId, date, type, amount, description } = await request.json();
    if (!investmentId || !date || !type || !amount) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    await assertOwned(db, { investmentId });

    const entry = await db.investmentEntry.create({
      data: {
        investmentId,
        date: new Date(date),
        type,
        amount: parseFloat(amount),
        description: description || '',
      },
    });

    // Update investment totals
    const investment = await db.investment.findUnique({ where: { id: investmentId } });
    if (investment) {
      let { totalInvested, currentValue } = investment;
      if (type === 'APORTE') {
        totalInvested += parseFloat(amount);
        currentValue += parseFloat(amount);
      } else if (type === 'RESGATE') {
        currentValue -= parseFloat(amount);
      } else if (type === 'RENDIMENTO') {
        currentValue += parseFloat(amount);
      }
      const profit = currentValue - totalInvested;
      const profitPercentage = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

      await db.investment.update({
        where: { id: investmentId },
        data: { totalInvested, currentValue, profit, profitPercentage },
      });
    }

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create entry error:', error);
    return NextResponse.json({ error: 'Erro ao criar movimentação' }, { status: 500 });
  }
}
