import { NextResponse } from 'next/server';
import { userDb } from '@/lib/db';
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

  const db = userDb(session.userId);

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const baseYear = parseInt(searchParams.get('year'), 10) || now.getFullYear();
  const baseMonth = parseInt(searchParams.get('month'), 10) || now.getMonth() + 1;
  const monthCount = Math.min(Math.max(parseInt(searchParams.get('months'), 10) || 1, 1), 24);
  const withProjections = searchParams.get('projections') !== '0';
  // Quando desligado, cada mês começa do zero: útil para quem varre o saldo
  // para investimentos no fim do mês e quer ver só o fluxo daquele mês.
  const carryOver = searchParams.get('carryOver') !== '0';
  const accountId = searchParams.get('accountId');

  const last = shiftMonth(baseYear, baseMonth, monthCount - 1);
  const rangeStart = monthStartUTC(baseYear, baseMonth);
  const rangeEnd = monthEndUTC(last.year, last.month);

  // Todas independentes: disparar juntas troca 5 idas ao banco por 1.
  const [transactions, recurring, cards, accountsForBalance, priorGrouped] = await Promise.all([
    db.transaction.findMany({
      where: {
        date: { gte: rangeStart, lte: rangeEnd },
        ...(accountId ? { bankAccountId: accountId } : {}),
      },
      include: { bankAccount: true, category: true, investment: true, debt: true },
      orderBy: { date: 'asc' },
    }),

    withProjections
      ? db.recurringEntry.findMany({
          where: {
            active: true,
            ...(accountId ? { bankAccountId: accountId } : {}),
          },
          include: { bankAccount: true, category: true, creditCard: true },
        })
      : [],

    withProjections
      ? db.creditCard.findMany({ where: { active: true } })
      : [],

    // Saldo de abertura: o que existe nas contas mais tudo lançado antes.
    carryOver
      ? db.bankAccount.findMany({
          where: accountId ? { id: accountId } : undefined,
          select: { initialBalance: true },
        })
      : [],

    carryOver
      ? db.transaction.groupBy({
          by: ['type'],
          where: {
            date: { lt: rangeStart },
            ...(accountId ? { bankAccountId: accountId } : {}),
          },
          _sum: { amount: true },
        })
      : [],
  ]);

  const priorOf = (type) => priorGrouped.find(g => g.type === type)?._sum?.amount || 0;

  // Aportes também saem da conta corrente, embora não sejam despesa.
  let runningBalance = carryOver
    ? accountsForBalance.reduce((s, a) => s + a.initialBalance, 0)
      + priorOf('INCOME') - priorOf('EXPENSE') - priorOf('INVESTMENT')
    : 0;

  // O passado é o que realmente aconteceu: previsões só valem de hoje em
  // diante. Sem isso, um lançamento já registrado somaria duas vezes com a
  // recorrência que o originou, e o saldo acumulado ficaria errado.
  const todayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const isFuture = (y, m, d) => y * 10000 + m * 100 + d >= todayKey;

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
        investment: 0,
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
      else if (tx.type === 'INVESTMENT') cell.investment += tx.amount;
      else cell.expense += tx.amount;

      cell.items.push({
        id: tx.id,
        kind: 'tx',
        type: tx.type,
        description: tx.description || (tx.category?.name ?? 'Sem descrição'),
        amount: tx.amount,
        category: tx.category ? { name: tx.category.name, color: tx.category.color, icon: tx.category.icon } : null,
        account: tx.bankAccount ? { name: tx.bankAccount.name, color: tx.bankAccount.color, icon: tx.bankAccount.icon } : null,
        investment: tx.investment ? { name: tx.investment.name } : null,
        debt: tx.debt ? { name: tx.debt.name, icon: tx.debt.icon } : null,
        isRetroactive: tx.isRetroactive,
      });
    }

    // Projected recurring entries
    for (const entry of recurring) {
      const day = recurringDayFor(entry, year, month);
      if (!day || !isFuture(year, month, day)) continue;

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

        if (event.subtype === 'payment' && event.amount > 0 && isFuture(year, month, event.day)) {
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

    if (!carryOver) runningBalance = 0;
    const openingBalance = runningBalance;

    for (const cell of days) {
      cell.net = cell.income - cell.expense;
      cell.items.sort((a, b) => b.amount - a.amount);

      // Saldo acumulado: fecha o dia anterior e aplica o movimento deste dia.
      runningBalance += (cell.income + cell.plannedIncome)
        - (cell.expense + cell.plannedExpense) - cell.investment;
      cell.balance = runningBalance;
      cell.hasMovement = cell.items.length > 0;
    }

    const income = days.reduce((s, d) => s + d.income, 0);
    const expense = days.reduce((s, d) => s + d.expense, 0);
    const plannedIncome = days.reduce((s, d) => s + d.plannedIncome, 0);
    const plannedExpense = days.reduce((s, d) => s + d.plannedExpense, 0);
    const investment = days.reduce((s, d) => s + d.investment, 0);

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
        investment,
        net: income - expense,
        plannedIncome,
        plannedExpense,
        projectedNet: (income + plannedIncome) - (expense + plannedExpense) - investment,
      },
      openingBalance,
      closingBalance: runningBalance,
      carryOver,
      stats: statsFor(d => d.expense),
      statsProjected: statsFor(d => d.expense + d.plannedExpense),
    });
  }

  return NextResponse.json({ months });
}
