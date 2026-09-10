import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { shiftMonth, monthStartUTC, monthEndUTC } from '@/lib/calendar';

export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const currentYear = parseInt(searchParams.get('year'), 10) || now.getFullYear();
  const currentMonth = parseInt(searchParams.get('month'), 10) || now.getMonth() + 1;

  const monthBounds = (y, m) => [monthStartUTC(y, m), monthEndUTC(y, m)];

  const sumFor = async (type, start, end) =>
    (await prisma.transaction.aggregate({
      where: { type, date: { gte: start, lte: end } },
      _sum: { amount: true },
    }))._sum.amount || 0;

  // Last 6 months ending on the selected month
  const monthlySummaries = [];
  for (let i = 5; i >= 0; i--) {
    const { year: y, month: m } = shiftMonth(currentYear, currentMonth, -i);
    const [startDate, endDate] = monthBounds(y, m);

    const income = await sumFor('INCOME', startDate, endDate);
    const expenses = await sumFor('EXPENSE', startDate, endDate);

    monthlySummaries.push({ year: y, month: m, income, expenses, balance: income - expenses });
  }

  const [currentStart, currentEnd] = monthBounds(currentYear, currentMonth);
  const currentIncome = await sumFor('INCOME', currentStart, currentEnd);
  const currentExpenses = await sumFor('EXPENSE', currentStart, currentEnd);
  const currentInvestments = await sumFor('INVESTMENT', currentStart, currentEnd);

  const { year: prevYear, month: prevMonth } = shiftMonth(currentYear, currentMonth, -1);
  const [prevStart, prevEnd] = monthBounds(prevYear, prevMonth);
  const prevBalance = (await sumFor('INCOME', prevStart, prevEnd)) - (await sumFor('EXPENSE', prevStart, prevEnd));

  const currentBalance = currentIncome - currentExpenses;
  const variation = prevBalance !== 0 ? ((currentBalance - prevBalance) / Math.abs(prevBalance)) * 100 : 0;

  // Total balance across all accounts
  const accounts = await prisma.bankAccount.findMany();
  let totalBalance = 0;
  for (const acc of accounts) {
    const grouped = await prisma.transaction.groupBy({
      by: ['type'],
      where: { bankAccountId: acc.id },
      _sum: { amount: true },
    });
    const sumOf = (type) => grouped.find(g => g.type === type)?._sum?.amount || 0;
    totalBalance += acc.initialBalance
      + sumOf('INCOME') - sumOf('EXPENSE') - sumOf('INVESTMENT');
  }

  // Breakdown by category for the selected month
  const categories = await prisma.category.findMany();
  const categoryById = new Map(categories.map(c => [c.id, c]));

  const buildBreakdown = async (type) => {
    const grouped = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { type, date: { gte: currentStart, lte: currentEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    return grouped
      .map(g => {
        const category = g.categoryId ? categoryById.get(g.categoryId) : null;
        return {
          id: g.categoryId || 'none',
          name: category?.name || 'Sem categoria',
          color: category?.color || '#55556a',
          icon: category?.icon || '❓',
          amount: g._sum.amount || 0,
          count: g._count._all,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  };

  const byCategory = {
    EXPENSE: await buildBreakdown('EXPENSE'),
    INCOME: await buildBreakdown('INCOME'),
  };

  const uncategorizedCount = await prisma.transaction.count({
    where: { categoryId: null, date: { gte: currentStart, lte: currentEnd } },
  });

  const recentTransactions = await prisma.transaction.findMany({
    include: { bankAccount: true, category: true },
    orderBy: { date: 'desc' },
    take: 5,
  });

  const goals = await prisma.financialGoal.findMany({ orderBy: { targetDate: 'asc' } });

  const investments = await prisma.investment.findMany();
  const totalInvested = investments.reduce((sum, inv) => sum + inv.currentValue, 0);

  // Informado no passo a passo inicial
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { savings: true },
  });

  return NextResponse.json({
    year: currentYear,
    month: currentMonth,
    totalBalance,
    currentIncome,
    currentExpenses,
    currentInvestments,
    currentBalance,
    variation,
    monthlySummaries,
    byCategory,
    uncategorizedCount,
    recentTransactions,
    goals,
    totalInvested,
    savings: user?.savings || 0,
  });
}
