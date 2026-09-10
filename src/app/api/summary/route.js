import { NextResponse } from 'next/server';
import { userDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { shiftMonth, monthStartUTC, monthEndUTC, utcParts } from '@/lib/calendar';

/**
 * Um round-trip até o banco custa centenas de milissegundos, então o que pesa
 * aqui é o NÚMERO de consultas, não o tamanho de cada uma. Esta rota fazia
 * ~30 consultas sequenciais (duas por mês no laço de 6 meses, uma por conta
 * para o saldo, mais os agregados avulsos). Agora são 8 disparadas juntas, e
 * as somas acontecem em memória.
 */
export async function GET(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const currentYear = parseInt(searchParams.get('year'), 10) || now.getFullYear();
  const currentMonth = parseInt(searchParams.get('month'), 10) || now.getMonth() + 1;

  // Janela dos 6 meses exibidos, terminando no mês selecionado. O mês
  // anterior sempre cai dentro dela, então serve também para a comparação.
  const firstShown = shiftMonth(currentYear, currentMonth, -5);
  const windowStart = monthStartUTC(firstShown.year, firstShown.month);
  const windowEnd = monthEndUTC(currentYear, currentMonth);

  const [
    windowTx,
    balanceGroups,
    accounts,
    categories,
    recentTransactions,
    goals,
    investments,
    user,
  ] = await Promise.all([
    // Uma leitura cobre os 6 meses, o mês atual e a quebra por categoria
    db.transaction.findMany({
      where: { date: { gte: windowStart, lte: windowEnd } },
      select: { date: true, amount: true, type: true, categoryId: true },
    }),
    // Saldo de todas as contas numa consulta, em vez de uma por conta
    db.transaction.groupBy({
      by: ['bankAccountId', 'type'],
      _sum: { amount: true },
    }),
    db.bankAccount.findMany(),
    db.category.findMany(),
    db.transaction.findMany({
      include: { bankAccount: true, category: true },
      orderBy: { date: 'desc' },
      take: 5,
    }),
    db.financialGoal.findMany({ orderBy: { targetDate: 'asc' } }),
    db.investment.findMany(),
    db.user.findUnique({
      where: { id: session.userId },
      select: { savings: true },
    }),
  ]);

  // --- Totais mês a mês, em memória ---
  const keyOf = (y, m) => y * 100 + m;
  const buckets = new Map();
  const monthlySummaries = [];

  for (let i = 5; i >= 0; i--) {
    const { year, month } = shiftMonth(currentYear, currentMonth, -i);
    const bucket = { year, month, income: 0, expenses: 0, investments: 0, balance: 0 };
    buckets.set(keyOf(year, month), bucket);
    monthlySummaries.push(bucket);
  }

  for (const tx of windowTx) {
    const { year, month } = utcParts(tx.date);
    const bucket = buckets.get(keyOf(year, month));
    if (!bucket) continue;

    if (tx.type === 'INCOME') bucket.income += tx.amount;
    else if (tx.type === 'INVESTMENT') bucket.investments += tx.amount;
    else bucket.expenses += tx.amount;
  }

  for (const bucket of monthlySummaries) {
    bucket.balance = bucket.income - bucket.expenses - bucket.investments;
  }

  const current = buckets.get(keyOf(currentYear, currentMonth));
  const prev = shiftMonth(currentYear, currentMonth, -1);
  const prevBucket = buckets.get(keyOf(prev.year, prev.month));
  const prevBalance = prevBucket ? prevBucket.balance : 0;

  const variation = prevBalance !== 0
    ? ((current.balance - prevBalance) / Math.abs(prevBalance)) * 100
    : 0;

  // --- Saldo total das contas ---
  const accountSum = (accountId, type) =>
    balanceGroups.find(g => g.bankAccountId === accountId && g.type === type)?._sum?.amount || 0;

  const totalBalance = accounts.reduce((total, acc) => total
    + acc.initialBalance
    + accountSum(acc.id, 'INCOME')
    - accountSum(acc.id, 'EXPENSE')
    - accountSum(acc.id, 'INVESTMENT'), 0);

  // --- Quebra por categoria do mês selecionado ---
  const categoryById = new Map(categories.map(c => [c.id, c]));
  const breakdowns = { INCOME: new Map(), EXPENSE: new Map() };
  let uncategorizedCount = 0;

  for (const tx of windowTx) {
    const { year, month } = utcParts(tx.date);
    if (year !== currentYear || month !== currentMonth) continue;
    if (!tx.categoryId) uncategorizedCount++;

    const target = breakdowns[tx.type];
    if (!target) continue; // INVESTMENT não é despesa nem receita

    const key = tx.categoryId || 'none';
    const entry = target.get(key) || { amount: 0, count: 0 };
    entry.amount += tx.amount;
    entry.count += 1;
    target.set(key, entry);
  }

  const toList = (map) => [...map.entries()]
    .map(([id, { amount, count }]) => {
      const category = id === 'none' ? null : categoryById.get(id);
      return {
        id,
        name: category?.name || 'Sem categoria',
        color: category?.color || '#55556a',
        icon: category?.icon || '❓',
        amount,
        count,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const totalInvested = investments.reduce((sum, inv) => sum + inv.currentValue, 0);

  return NextResponse.json({
    year: currentYear,
    month: currentMonth,
    totalBalance,
    currentIncome: current.income,
    currentExpenses: current.expenses,
    currentInvestments: current.investments,
    currentBalance: current.balance,
    variation,
    monthlySummaries,
    byCategory: { EXPENSE: toList(breakdowns.EXPENSE), INCOME: toList(breakdowns.INCOME) },
    uncategorizedCount,
    recentTransactions,
    goals,
    totalInvested,
    savings: user?.savings || 0,
  });
}
