import { NextResponse } from 'next/server';
import { userDb } from '@/lib/db';
import { getScope } from '@/lib/auth';
import { monthStartUTC, monthEndUTC } from '@/lib/calendar';
import { buildBuckets } from '@/lib/buckets';

/**
 * Os quatro baldes de um mês.
 *
 * GET /api/brief?year=2026&month=9
 *
 * As dicas não saem daqui: elas precisam do saldo dia a dia, que o cliente
 * já tem do /api/calendar. Calcular de novo no servidor seria repetir seis
 * consultas para chegar no mesmo número.
 */
export async function GET(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year'), 10) || now.getFullYear();
  const month = parseInt(searchParams.get('month'), 10) || now.getMonth() + 1;

  // Independentes: uma ida ao banco em vez de cinco.
  const [transactions, recurring, installments, cards, bills] = await Promise.all([
    db.transaction.findMany({
      where: { date: { gte: monthStartUTC(year, month), lte: monthEndUTC(year, month) } },
      select: { type: true, amount: true, description: true, date: true },
    }),
    db.recurringEntry.findMany({ where: { active: true } }),
    db.installment.findMany({
      where: { active: true },
      include: { creditCard: { select: { name: true } } },
    }),
    db.creditCard.findMany({ where: { active: true } }),
    db.cardBill.findMany({ where: { year, month } }),
  ]);

  const faturas = new Map(bills.map(b => [`${b.creditCardId}:${b.year}:${b.month}`, b.amount]));

  const buckets = buildBuckets({ transactions, recurring, installments, cards, faturas }, year, month);

  return NextResponse.json({
    year,
    month,
    buckets,
    // O cliente monta as dicas com isto mais o calendário que já carregou
    cards: cards.map(c => ({
      id: c.id, name: c.name, color: c.color,
      openingDay: c.openingDay, dueDay: c.dueDay, paymentDay: c.paymentDay,
      estimatedAmount: c.estimatedAmount,
    })),
    installments: installments.map(i => ({
      id: i.id, description: i.description, totalAmount: i.totalAmount, count: i.count,
      firstDate: i.firstDate, active: i.active, creditCardId: i.creditCardId,
      cardName: i.creditCard?.name || null,
    })),
  });
}
