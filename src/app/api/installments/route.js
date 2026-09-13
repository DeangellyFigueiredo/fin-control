import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getScope } from '@/lib/auth';
import { installmentFor, lastInstallmentMonth, remainingAmount } from '@/lib/installments';

/**
 * Compras parceladas.
 *
 * GET /api/installments?year=2026&month=9
 *   Devolve cada compra já com a parcela do mês pedido, o que falta pagar e
 *   o mês em que ela acaba — os três números que a tela mostra.
 */
export async function GET(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year'), 10) || now.getFullYear();
  const month = parseInt(searchParams.get('month'), 10) || now.getMonth() + 1;

  const compras = await db.installment.findMany({
    include: { creditCard: true, bankAccount: true, category: true },
    orderBy: { createdAt: 'desc' },
  });

  const lista = compras.map(compra => {
    const parcela = installmentFor(compra, year, month);
    const fim = lastInstallmentMonth(compra);

    return {
      ...compra,
      parcela,
      falta: remainingAmount(compra, year, month),
      fim,
      // Uma compra que já terminou some da lista principal, mas continua
      // acessível: o histórico explica o que foi pago no passado.
      encerrada: (fim.year * 100 + fim.month) < (year * 100 + month),
    };
  });

  return NextResponse.json(lista);
}

function parseBody(body) {
  const { description, totalAmount, count, firstDate, creditCardId, bankAccountId, categoryId, notes, active } = body;

  return {
    description: String(description || '').trim(),
    totalAmount: parseFloat(totalAmount),
    count: parseInt(count, 10),
    firstDate: firstDate ? new Date(firstDate) : null,
    creditCardId: creditCardId || null,
    bankAccountId: bankAccountId || null,
    categoryId: categoryId || null,
    notes: notes || '',
    active: active === undefined ? true : Boolean(active),
  };
}

function validar(data) {
  if (!data.description) return 'Descrição obrigatória';
  if (!(data.totalAmount > 0)) return 'O valor total deve ser maior que zero';
  if (!Number.isInteger(data.count) || data.count < 1 || data.count > 120) {
    return 'O número de parcelas deve estar entre 1 e 120';
  }
  if (!data.firstDate || Number.isNaN(data.firstDate.getTime())) return 'Informe a data da primeira parcela';
  // Sem cartão nem conta, a parcela não teria de onde sair
  if (!data.creditCardId && !data.bankAccountId) return 'Escolha o cartão ou a conta que paga';
  return null;
}

export async function POST(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  try {
    const data = parseBody(await request.json());

    const erro = validar(data);
    if (erro) return NextResponse.json({ error: erro }, { status: 400 });

    await assertOwned(db, {
      creditCardId: data.creditCardId,
      bankAccountId: data.bankAccountId,
      categoryId: data.categoryId,
    });

    const compra = await db.installment.create({
      data,
      include: { creditCard: true, bankAccount: true, category: true },
    });

    return NextResponse.json(compra, { status: 201 });
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create installment error:', error);
    return NextResponse.json({ error: 'Erro ao criar parcelamento' }, { status: 500 });
  }
}

export async function PUT(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const data = parseBody(body);
    const erro = validar(data);
    if (erro) return NextResponse.json({ error: erro }, { status: 400 });

    await assertOwned(db, {
      creditCardId: data.creditCardId,
      bankAccountId: data.bankAccountId,
      categoryId: data.categoryId,
    });

    const compra = await db.installment.update({
      where: { id: body.id },
      data,
      include: { creditCard: true, bankAccount: true, category: true },
    });

    return NextResponse.json(compra);
  } catch (error) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Update installment error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar parcelamento' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const { count } = await db.installment.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  return NextResponse.json({ success: true });
}
