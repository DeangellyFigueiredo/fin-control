import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  const cards = await db.creditCard.findMany({
    include: { bankAccount: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(cards);
}

function parseBody(body) {
  const {
    name, color, icon, limitAmount, openingDay, dueDay, paymentDay,
    estimatedAmount, bankAccountId, active,
  } = body;

  return {
    name,
    color: color || '#6c5ce7',
    icon: icon || '💳',
    limitAmount: parseFloat(limitAmount) || 0,
    openingDay: parseInt(openingDay, 10),
    dueDay: parseInt(dueDay, 10),
    paymentDay: parseInt(paymentDay, 10),
    estimatedAmount: parseFloat(estimatedAmount) || 0,
    bankAccountId: bankAccountId || null,
    active: active === undefined ? true : Boolean(active),
  };
}

function invalidDay(...days) {
  return days.some(d => !Number.isInteger(d) || d < 1 || d > 31);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    const data = parseBody(body);
    await assertOwned(db, { bankAccountId: data.bankAccountId });

    if (invalidDay(data.openingDay, data.dueDay, data.paymentDay)) {
      return NextResponse.json({ error: 'Abertura, vencimento e pagamento devem ser dias entre 1 e 31' }, { status: 400 });
    }

    const card = await db.creditCard.create({ data, include: { bankAccount: true } });
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create card error:', error);
    return NextResponse.json({ error: 'Erro ao criar cartão' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const data = parseBody(body);
    await assertOwned(db, { bankAccountId: data.bankAccountId });

    if (invalidDay(data.openingDay, data.dueDay, data.paymentDay)) {
      return NextResponse.json({ error: 'Abertura, vencimento e pagamento devem ser dias entre 1 e 31' }, { status: 400 });
    }

    const card = await db.creditCard.update({
      where: { id: body.id },
      data,
      include: { bankAccount: true },
    });

    return NextResponse.json(card);
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Update card error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  // deleteMany em vez de delete: com o cliente escopado, um id de
  // outro usuário simplesmente não casa, e vira 404 em vez de erro.
  const { count } = await db.creditCard.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  return NextResponse.json({ success: true });
}
