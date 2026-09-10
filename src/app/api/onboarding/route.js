import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ALL_CATEGORIES } from '@/lib/defaults';

/** Garante as categorias padrão — não há tela para cadastrá-las. */
async function ensureCategories() {
  const existing = await prisma.category.findMany({ select: { name: true, type: true } });
  const have = new Set(existing.map(c => `${c.type}:${c.name}`));
  const missing = ALL_CATEGORIES.filter(c => !have.has(`${c.type}:${c.name}`));

  if (missing.length) {
    await prisma.category.createMany({ data: missing });
  }
  return prisma.category.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
}

/**
 * Estado atual do onboarding: perfil e o que já existe cadastrado, para o
 * wizard começar preenchido em vez de duplicar registros.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const [user, accounts, cards, recurring, goals] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.bankAccount.findMany({ orderBy: { name: 'asc' } }),
    prisma.creditCard.findMany({ orderBy: { name: 'asc' } }),
    prisma.recurringEntry.findMany({ orderBy: [{ type: 'asc' }, { dayOfMonth: 'asc' }] }),
    prisma.financialGoal.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  return NextResponse.json({
    profile: {
      nickname: user.nickname || user.name || '',
      financialStatus: user.financialStatus || '',
      savings: user.savings || 0,
      onboardedAt: user.onboardedAt,
    },
    accounts,
    cards,
    recurring,
    goals,
  });
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const day = (v) => {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return null;
  return Math.min(Math.max(n, 1), 31);
};

/**
 * Grava tudo de uma vez. Linhas com `id` são atualizadas, o resto é criado —
 * assim rodar o passo a passo de novo ajusta os dados em vez de duplicá-los.
 */
export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  }

  const { profile = {}, accounts = [], cards = [], incomes = [], fixedExpenses = [], goals = [] } = body;

  if (!profile.nickname || !String(profile.nickname).trim()) {
    return NextResponse.json({ error: 'Diga como quer ser chamado' }, { status: 400 });
  }

  for (const card of cards) {
    if (!card.name?.trim()) continue; // linhas em branco são descartadas no save
    if (day(card.paymentDay) === null || day(card.openingDay) === null) {
      return NextResponse.json(
        { error: `Cartão "${card.name || 'sem nome'}": informe o dia de pagamento e o melhor dia de compra` },
        { status: 400 },
      );
    }
  }

  for (const entry of [...incomes, ...fixedExpenses]) {
    if (!entry.name?.trim()) continue;
    if (day(entry.dayOfMonth) === null) {
      return NextResponse.json(
        { error: `"${entry.name || 'sem descrição'}": informe o dia do mês` },
        { status: 400 },
      );
    }
  }

  try {
    const categories = await ensureCategories();
    const categoryByName = new Map(categories.map(c => [`${c.type}:${c.name}`, c.id]));
    const resolveCategory = (name, type) => categoryByName.get(`${type}:${name}`) || null;

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.userId },
        data: {
          nickname: String(profile.nickname).trim(),
          name: String(profile.nickname).trim(),
          financialStatus: profile.financialStatus || null,
          savings: num(profile.savings),
          onboardedAt: new Date(),
        },
      });

      // Contas bancárias — o saldo informado vira o saldo inicial
      const accountIdByKey = new Map();
      for (const acc of accounts) {
        if (!acc.name?.trim()) continue;
        const data = {
          name: acc.name.trim(),
          color: acc.color || '#6c5ce7',
          icon: acc.icon || '🏦',
          initialBalance: num(acc.initialBalance),
        };
        const saved = acc.id
          ? await tx.bankAccount.update({ where: { id: acc.id }, data })
          : await tx.bankAccount.create({ data });
        accountIdByKey.set(acc.key ?? saved.id, saved.id);
      }

      const resolveAccount = (key) => (key ? accountIdByKey.get(key) || null : null);

      // Cartões — "melhor dia de compra" é a abertura da fatura; sem
      // vencimento informado, ele acompanha o dia do pagamento.
      const cardIdByKey = new Map();
      for (const card of cards) {
        if (!card.name?.trim()) continue;
        const paymentDay = day(card.paymentDay);
        const data = {
          name: card.name.trim(),
          color: card.color || '#6c5ce7',
          icon: card.icon || '💳',
          limitAmount: num(card.limitAmount),
          openingDay: day(card.openingDay),
          dueDay: day(card.dueDay) ?? paymentDay,
          paymentDay,
          estimatedAmount: num(card.estimatedAmount),
          bankAccountId: resolveAccount(card.accountKey),
        };
        const saved = card.id
          ? await tx.creditCard.update({ where: { id: card.id }, data })
          : await tx.creditCard.create({ data });
        cardIdByKey.set(card.key ?? saved.id, saved.id);
      }

      // Entradas e contas fixas viram lançamentos recorrentes
      const saveRecurring = async (rows, type) => {
        for (const row of rows) {
          if (!row.name?.trim()) continue;
          const data = {
            name: row.name.trim(),
            type,
            amount: num(row.amount),
            dayOfMonth: day(row.dayOfMonth),
            frequency: 'MONTHLY',
            monthOfYear: null,
            bankAccountId: resolveAccount(row.accountKey),
            categoryId: resolveCategory(row.categoryName, type),
            creditCardId: row.cardKey ? cardIdByKey.get(row.cardKey) || null : null,
            notes: row.notes || '',
            active: true,
          };
          if (row.id) await tx.recurringEntry.update({ where: { id: row.id }, data });
          else await tx.recurringEntry.create({ data });
        }
      };

      await saveRecurring(incomes, 'INCOME');
      await saveRecurring(fixedExpenses, 'EXPENSE');

      // Metas
      for (const goal of goals) {
        if (!goal.name?.trim()) continue;
        const data = {
          name: goal.name.trim(),
          type: goal.type || 'OUTRO',
          targetAmount: num(goal.targetAmount),
          currentAmount: num(goal.currentAmount),
          targetDate: goal.targetDate ? new Date(goal.targetDate) : null,
          monthlyContribution: num(goal.monthlyContribution),
        };
        if (goal.id) await tx.financialGoal.update({ where: { id: goal.id }, data });
        else await tx.financialGoal.create({ data });
      }

      return {
        accounts: accountIdByKey.size,
        cards: cardIdByKey.size,
        incomes: incomes.length,
        fixedExpenses: fixedExpenses.length,
        goals: goals.length,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'Erro ao salvar o cadastro inicial' }, { status: 500 });
  }
}
