import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { investmentId, date, type, amount, description } = await request.json();
    if (!investmentId || !date || !type || !amount) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    const entry = await prisma.investmentEntry.create({
      data: {
        investmentId,
        date: new Date(date),
        type,
        amount: parseFloat(amount),
        description: description || '',
      },
    });

    // Update investment totals
    const investment = await prisma.investment.findUnique({ where: { id: investmentId } });
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

      await prisma.investment.update({
        where: { id: investmentId },
        data: { totalInvested, currentValue, profit, profitPercentage },
      });
    }

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Create entry error:', error);
    return NextResponse.json({ error: 'Erro ao criar movimentação' }, { status: 500 });
  }
}
