import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getScope } from '@/lib/auth';
import { shiftMonth } from '@/lib/calendar';

/**
 * Valor da fatura de um cartão num mês específico.
 *
 * Sem registro aqui, o calendário usa CreditCard.estimatedAmount, que é o
 * mesmo palpite para todo mês futuro. Quando a fatura real chega, o valor
 * daquele mês entra aqui e passa a valer no lugar do palpite.
 */

const mesValido = (y, m) => Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12;

/** GET /api/cards/bills?year=&month=&months=N — faturas informadas na janela */
export async function GET(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year'), 10) || now.getFullYear();
  const month = parseInt(searchParams.get('month'), 10) || now.getMonth() + 1;
  const count = Math.min(Math.max(parseInt(searchParams.get('months'), 10) || 12, 1), 36);

  // A chave é (ano, mês), então a janela vira uma lista de pares em vez de
  // um intervalo de datas.
  const janela = Array.from({ length: count }, (_, i) => shiftMonth(year, month, i));

  const bills = await db.cardBill.findMany({
    where: { OR: janela.map(({ year: y, month: m }) => ({ year: y, month: m })) },
  });

  return NextResponse.json(bills);
}

/** PUT — define (ou substitui) o valor da fatura de um mês */
export async function PUT(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  try {
    const { creditCardId, year, month, amount } = await request.json();

    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const valor = parseFloat(amount);

    if (!creditCardId) return NextResponse.json({ error: 'Cartão obrigatório' }, { status: 400 });
    if (!mesValido(y, m)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
    if (!Number.isFinite(valor) || valor < 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    await assertOwned(db, { creditCardId });

    // findFirst + create/update em vez de upsert: o cliente escopado injeta
    // o dono no where, e a chave composta do upsert não o acomodaria.
    const existente = await db.cardBill.findFirst({
      where: { creditCardId, year: y, month: m },
      select: { id: true },
    });

    const bill = existente
      ? await db.cardBill.update({ where: { id: existente.id }, data: { amount: valor } })
      : await db.cardBill.create({ data: { creditCardId, year: y, month: m, amount: valor } });

    return NextResponse.json(bill);
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Save card bill error:', error);
    return NextResponse.json({ error: 'Erro ao salvar a fatura' }, { status: 500 });
  }
}

/** DELETE — remove o valor informado; o mês volta a usar a estimativa */
export async function DELETE(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const { searchParams } = new URL(request.url);
  const creditCardId = searchParams.get('creditCardId');
  const y = parseInt(searchParams.get('year'), 10);
  const m = parseInt(searchParams.get('month'), 10);

  if (!creditCardId || !mesValido(y, m)) {
    return NextResponse.json({ error: 'Cartão e mês são obrigatórios' }, { status: 400 });
  }

  const { count } = await db.cardBill.deleteMany({
    where: { creditCardId, year: y, month: m },
  });

  if (count === 0) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

  return NextResponse.json({ success: true });
}
