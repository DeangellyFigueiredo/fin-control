import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getScope } from '@/lib/auth';
import {
  monthStartUTC, monthEndUTC, shiftMonth, recurringDayFor, toISODate, daysInMonth,
} from '@/lib/calendar';
import { estadoDaRecorrente, ocorrenciaKey, diasDeAtraso, pendenciasParaHoje } from '@/lib/pendencies';

/**
 * Pendências: recorrentes que venceram sem ninguém confirmar.
 *
 * GET  → a lista, para o painel e para o modal do dia
 * POST → a resposta: foi lançada, foi vinculada a um lançamento existente,
 *        ou foi cancelada neste mês
 * DELETE → desfaz a resposta, devolvendo a ocorrência para pendente
 */

/** Meses que valem olhar para trás. Antes disso vira arqueologia. */
const MESES_ATRAS = 3;

export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const now = new Date();
  const hoje = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const inicio = shiftMonth(hoje.year, hoje.month, -MESES_ATRAS);

  const [recurring, transactions, settlements] = await Promise.all([
    db.recurringEntry.findMany({
      where: { active: true },
      include: { bankAccount: true, category: true, creditCard: true },
    }),
    db.transaction.findMany({
      where: {
        date: {
          gte: monthStartUTC(inicio.year, inicio.month),
          lte: monthEndUTC(hoje.year, hoje.month),
        },
      },
      select: { id: true, date: true, type: true, amount: true, description: true },
    }),
    db.reminderEvent.findMany({ select: { recurringId: true, year: true, month: true } }),
  ]);

  const contexto = {
    // Aqui só interessa o passado: o modal pergunta sobre o que já venceu.
    isFuture: (y, m, d) => y * 10000 + m * 100 + d >= hoje.year * 10000 + hoje.month * 100 + hoje.day,
    transactions,
    resolvidas: new Set(settlements.map(s => ocorrenciaKey(s.recurringId, s.year, s.month))),
  };

  const itens = [];
  for (let i = 0; i <= MESES_ATRAS; i++) {
    const { year, month } = shiftMonth(inicio.year, inicio.month, i);

    for (const entry of recurring) {
      if (estadoDaRecorrente(entry, year, month, contexto) !== 'pendente') continue;

      const day = recurringDayFor(entry, year, month);
      itens.push({
        recurringId: entry.id,
        year,
        month,
        day,
        date: toISODate(year, month, day),
        name: entry.name,
        type: entry.type,
        amount: entry.amount,
        atraso: diasDeAtraso(year, month, day, hoje),
        bankAccountId: entry.bankAccountId,
        categoryId: entry.categoryId,
        account: entry.bankAccount ? { id: entry.bankAccount.id, name: entry.bankAccount.name } : null,
        category: entry.category ? { name: entry.category.name, color: entry.category.color } : null,
        card: entry.creditCard ? { name: entry.creditCard.name, color: entry.creditCard.color } : null,
      });
    }
  }

  itens.sort((a, b) => b.atraso - a.atraso || a.day - b.day);

  return NextResponse.json({
    hoje: toISODate(hoje.year, hoje.month, hoje.day),
    total: itens.length,
    // O modal só interrompe pelo que venceu ou vence hoje
    doDia: pendenciasParaHoje(itens, hoje),
    itens,
  });
}

const ACOES = ['PAID', 'LINK', 'SKIP'];

export async function POST(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  try {
    const { recurringId, year, month, action, amount, date, bankAccountId, categoryId, transactionId } =
      await request.json();

    if (!recurringId) return NextResponse.json({ error: 'Ocorrência obrigatória' }, { status: 400 });
    if (!ACOES.includes(action)) return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

    const ano = parseInt(year, 10);
    const mes = parseInt(month, 10);
    if (!(ano > 1900 && mes >= 1 && mes <= 12)) {
      return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
    }

    // A recorrente precisa ser desta carteira. O cliente escopado garante isso,
    // mas a busca explícita transforma um id alheio em 404 em vez de erro solto.
    const entry = await db.recurringEntry.findFirst({ where: { id: recurringId } });
    if (!entry) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

    if (action === 'SKIP') {
      const evento = await registrar(db, { recurringId, ano, mes, status: 'SKIPPED', transactionId: null });
      return NextResponse.json(evento, { status: 201 });
    }

    if (action === 'LINK') {
      if (!transactionId) return NextResponse.json({ error: 'Escolha o lançamento' }, { status: 400 });

      const tx = await db.transaction.findFirst({ where: { id: transactionId }, select: { id: true } });
      if (!tx) return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 });

      const evento = await registrar(db, { recurringId, ano, mes, status: 'DONE', transactionId });
      return NextResponse.json(evento, { status: 201 });
    }

    // PAID: cria o lançamento e dá a baixa na mesma transação de banco, para
    // não sobrar baixa sem lançamento nem lançamento sem baixa.
    const valor = amount === undefined || amount === null || amount === ''
      ? entry.amount
      : parseFloat(String(amount).replace(',', '.'));

    if (!(valor > 0)) return NextResponse.json({ error: 'Valor deve ser maior que zero' }, { status: 400 });

    const dia = Math.min(
      parseInt(String(date || '').slice(8, 10), 10) || recurringDayFor(entry, ano, mes) || 1,
      daysInMonth(ano, mes),
    );
    const quando = new Date(`${toISODate(ano, mes, dia)}T00:00:00.000Z`);

    const conta = bankAccountId || entry.bankAccountId;
    if (!conta) return NextResponse.json({ error: 'Escolha a conta' }, { status: 400 });

    const categoria = categoryId === undefined ? entry.categoryId : (categoryId || null);
    await assertOwned(db, { bankAccountId: conta, categoryId: categoria });

    const resultado = await db.$transaction(async (tx) => {
      const criado = await tx.transaction.create({
        data: {
          date: quando,
          amount: valor,
          type: entry.type,
          description: entry.name,
          bankAccountId: conta,
          categoryId: categoria,
          // Já aconteceu: não deve mexer em saldo de investimento nem em
          // projeção futura.
          isRetroactive: true,
        },
      });

      const evento = await registrar(tx, {
        recurringId, ano, mes, status: 'DONE', transactionId: criado.id,
      });

      return { evento, transaction: criado };
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    console.error('Pendency error:', error);
    return NextResponse.json({ error: 'Erro ao resolver a pendência' }, { status: 500 });
  }
}

/**
 * `upsert` com a chave composta não passa pelo cliente escopado do jeito que
 * se esperaria: a extensão injeta dono e carteira como campos soltos no
 * `where`, e a chave composta espera tudo dentro dela. Por isso, buscar e
 * então criar ou atualizar — que também mantém o escopo valendo.
 */
async function registrar(db, { recurringId, ano, mes, status, transactionId }) {
  const existente = await db.reminderEvent.findFirst({
    where: { recurringId, year: ano, month: mes },
    select: { id: true },
  });

  return existente
    ? db.reminderEvent.update({
        where: { id: existente.id },
        data: { status, transactionId, settledAt: new Date() },
      })
    : db.reminderEvent.create({
        data: { recurringId, year: ano, month: mes, status, transactionId },
      });
}

/** Desfaz a resposta: a ocorrência volta a ser pendente. */
export async function DELETE(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const { searchParams } = new URL(request.url);
  const recurringId = searchParams.get('recurringId');
  const year = parseInt(searchParams.get('year'), 10);
  const month = parseInt(searchParams.get('month'), 10);

  if (!recurringId || !year || !month) {
    return NextResponse.json({ error: 'Informe a ocorrência' }, { status: 400 });
  }

  const { count } = await db.reminderEvent.deleteMany({ where: { recurringId, year, month } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

  return NextResponse.json({ success: true });
}
