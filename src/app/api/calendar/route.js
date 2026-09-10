import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import {
  daysInMonth, toISODate, shiftMonth, recurringDayFor, cardEventsFor,
  monthStartUTC, monthEndUTC, utcParts,
} from '@/lib/calendar';

/**
 * Day-by-day view of one or more months.
 *
 * GET /api/calendar?year=2026&month=9&months=3&projections=1
 *   year/month  first month of the range (defaults to today)
 *   months      how many consecutive months to return (1-24, default 1)
 *   projections include recurring entries and credit card cycles (default on)
 *   accountId   restrict to a single bank account
 */
export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const baseYear = parseInt(searchParams.get('year'), 10) || now.getFullYear();
  const baseMonth = parseInt(searchParams.get('month'), 10) || now.getMonth() + 1;
  const monthCount = Math.min(Math.max(parseInt(searchParams.get('months'), 10) || 1, 1), 24);
  const withProjections = searchParams.get('projections') !== '0';
  const accountId = searchParams.get('accountId');

  const last = shiftMonth(baseYear, baseMonth, monthCount - 1);
  const rangeStart = monthStartUTC(baseYear, baseMonth);
  const rangeEnd = monthEndUTC(last.year, last.month);

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: rangeStart, lte: rangeEnd },
      ...(accountId ? { bankAccountId: accountId } : {}),
    },
    include: { bankAccount: true, category: true },
    orderBy: { date: 'asc' },
  });

  const recurring = withProjections
    ? await prisma.recurringEntry.findMany({
        where: {
          active: true,
          ...(accountId ? { bankAccountId: accountId } : {}),
        },
        include: { bankAccount: true, category: true, creditCard: true },
      })
    : [];

  const cards = withProjections
    ? await prisma.creditCard.findMany({ where: { active: true } })
    : [];

  const months = [];

  for (let offset = 0; offset < monthCount; offset++) {
    const { year, month } = shiftMonth(baseYear, baseMonth, offset);
    const total = daysInMonth(year, month);

    const days = [];
    for (let d = 1; d <= total; d++) {
      days.push({
        day: d,
        date: toISODate(year, month, d),
        weekday: new Date(year, month - 1, d).getDay(),
        income: 0,
        expense: 0,
        net: 0,
        plannedIncome: 0,
        plannedExpense: 0,
        items: [],
        cardMarkers: [],
      });
    }

    // Realized transactions
    for (const tx of transactions) {
      const parts = utcParts(tx.date);
      if (parts.year !== year || parts.month !== month) continue;

      const cell = days[parts.day - 1];
      if (!cell) continue;

      if (tx.type === 'INCOME') cell.income += tx.amount;
      else cell.expense += tx.amount;

      cell.items.push({
        id: tx.id,
        kind: 'tx',
        type: tx.type,
        description: tx.description || (tx.category?.name ?? 'Sem descrição'),
        amount: tx.amount,
        category: tx.category ? { name: tx.category.name, color: tx.category.color, icon: tx.category.icon } : null,
        account: tx.bankAccount ? { name: tx.bankAccount.name, color: tx.bankAccount.color, icon: tx.bankAccount.icon } : null,
      });
    }

    // Projected recurring entries
    for (const entry of recurring) {
      const day = recurringDayFor(entry, year, month);
      if (!day) continue;

      const cell = days[day - 1];
      if (!cell) continue;

      if (entry.type === 'INCOME') cell.plannedIncome += entry.amount;
      else cell.plannedExpense += entry.amount;

      cell.items.push({
        id: `rec-${entry.id}-${year}-${month}`,
        kind: 'recurring',
        type: entry.type,
        description: entry.name,
        amount: entry.amount,
        category: entry.category ? { name: entry.category.name, color: entry.category.color, icon: entry.category.icon } : null,
        account: entry.bankAccount ? { name: entry.bankAccount.name, color: entry.bankAccount.color, icon: entry.bankAccount.icon } : null,
        card: entry.creditCard ? { name: entry.creditCard.name, color: entry.creditCard.color, icon: entry.creditCard.icon } : null,
      });
    }

    // Credit card cycle: abertura, vencimento e pagamento
    for (const card of cards) {
      for (const event of cardEventsFor(card, year, month)) {
        const cell = days[event.day - 1];
        if (!cell) continue;

        cell.cardMarkers.push({
          subtype: event.subtype,
          cardId: card.id,
          name: card.name,
          color: card.color,
          icon: card.icon,
        });

        if (event.subtype === 'payment' && event.amount > 0) {
          cell.plannedExpense += event.amount;
          cell.items.push({
            id: `card-${card.id}-${year}-${month}`,
            kind: 'card',
            type: 'EXPENSE',
            description: `Fatura ${card.name}`,
            amount: event.amount,
            card: { name: card.name, color: card.color, icon: card.icon },
          });
        }
      }
    }

    for (const cell of days) {
      cell.net = cell.income - cell.expense;
      cell.items.sort((a, b) => b.amount - a.amount);
    }

    const income = days.reduce((s, d) => s + d.income, 0);
    const expense = days.reduce((s, d) => s + d.expense, 0);
    const plannedIncome = days.reduce((s, d) => s + d.plannedIncome, 0);
    const plannedExpense = days.reduce((s, d) => s + d.plannedExpense, 0);

    // Two stat sets: realized only, and realized + projected — the client
    // picks one depending on whether projections are being shown.
    const statsFor = (outflow) => {
      const hits = days.filter(d => outflow(d) > 0);
      const biggest = hits.reduce((best, d) => (best && outflow(best) >= outflow(d) ? best : d), null);
      const sum = hits.reduce((s, d) => s + outflow(d), 0);

      return {
        daysInMonth: total,
        daysWithExpense: hits.length,
        daysWithoutExpense: total - hits.length,
        avgPerDay: hits.length ? sum / hits.length : 0,
        maxDay: biggest ? { day: biggest.day, date: biggest.date, expense: outflow(biggest) } : null,
      };
    };

    months.push({
      year,
      month,
      days,
      totals: {
        income,
        expense,
        net: income - expense,
        plannedIncome,
        plannedExpense,
        projectedNet: (income + plannedIncome) - (expense + plannedExpense),
      },
      stats: statsFor(d => d.expense),
      statsProjected: statsFor(d => d.expense + d.plannedExpense),
    });
  }

  return NextResponse.json({ months });
}
