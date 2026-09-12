import { NextResponse } from 'next/server';
import { userDb, NotOwnedError } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { utcParts } from '@/lib/calendar';

/** Tipo de transação que abate o saldo de cada direção. */
export const TIPO_QUE_ABATE = { OWE: 'EXPENSE', LENT: 'INCOME' };

/**
 * O quanto falta nunca é gravado: sai da soma dos pagamentos vinculados.
 * Guardar um saldo abriria espaço para ele divergir das transações — bastaria
 * apagar um pagamento pela tela de Transações para os números discordarem.
 *
 * Só conta a transação do tipo certo: numa dívida minha, uma entrada
 * vinculada por engano não pode parecer que eu paguei.
 */
function resumo(debt) {
  const esperado = TIPO_QUE_ABATE[debt.direction] || 'EXPENSE';
  const pagamentos = (debt.payments || []).filter(p => p.type === esperado);
  const pago = pagamentos.reduce((s, p) => s + p.amount, 0);
  const restante = Math.max(debt.originalAmount - pago, 0);
  const quitada = debt.isSettled || restante <= 0.009;

  // Ritmo: média por mês desde o primeiro pagamento, contando os meses sem
  // pagamento — são eles que fazem a dívida arrastar.
  const meses = new Set(pagamentos.map(p => {
    const { year, month } = utcParts(p.date);
    return year * 100 + month;
  }));

  let mesesDecorridos = 0;
  if (pagamentos.length) {
    const datas = pagamentos.map(p => new Date(p.date).getTime());
    const primeiro = utcParts(new Date(Math.min(...datas)));
    const agora = new Date();
    mesesDecorridos = Math.max(
      1,
      (agora.getFullYear() - primeiro.year) * 12 + (agora.getMonth() + 1 - primeiro.month) + 1,
    );
  }

  const mediaMensal = mesesDecorridos ? pago / mesesDecorridos : 0;
  const ultimo = pagamentos.length
    ? pagamentos.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b))
    : null;

  // Atrasada é o que passou do prazo e ainda tem saldo. Vale para os dois
  // lados, mas é no "me devem" que costuma passar em branco.
  const atrasada = Boolean(
    debt.dueDate && !debt.isSettled && restante > 0.009 && new Date(debt.dueDate) < new Date(),
  );

  return {
    ...debt,
    payments: pagamentos,
    atrasada,
    pago,
    restante,
    quitada,
    progresso: debt.originalAmount > 0 ? Math.min((pago / debt.originalAmount) * 100, 100) : 0,
    totalPagamentos: pagamentos.length,
    mesesComPagamento: meses.size,
    mesesDecorridos,
    mesesSemPagamento: Math.max(mesesDecorridos - meses.size, 0),
    mediaMensal,
    maiorPagamento: pagamentos.length ? Math.max(...pagamentos.map(p => p.amount)) : 0,
    ultimoPagamento: ultimo ? { date: ultimo.date, amount: ultimo.amount } : null,
    // Projeção grosseira, e assumida como tal: mantido o ritmo atual.
    mesesRestantes: mediaMensal > 0 && restante > 0 ? Math.ceil(restante / mediaMensal) : null,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  const debts = await db.debt.findMany({
    include: {
      payments: {
        select: { id: true, date: true, amount: true, description: true, type: true },
        orderBy: { date: 'desc' },
      },
    },
    orderBy: [{ isSettled: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json(debts.map(resumo));
}

function parseBody(body) {
  const {
    name, counterpart, direction, originalAmount,
    startDate, dueDate, color, icon, notes, isSettled,
  } = body;

  return {
    name: String(name || '').trim(),
    direction: direction === 'LENT' ? 'LENT' : 'OWE',
    counterpart: String(counterpart || '').trim(),
    originalAmount: parseFloat(originalAmount) || 0,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    color: color || '#e66767',
    icon: icon || '🤝',
    notes: notes || '',
    isSettled: Boolean(isSettled),
  };
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const data = parseBody(await request.json());

    if (!data.name) return NextResponse.json({ error: 'Descrição obrigatória' }, { status: 400 });
    if (!(data.originalAmount > 0)) {
      return NextResponse.json({ error: 'O valor total deve ser maior que zero' }, { status: 400 });
    }

    const debt = await db.debt.create({ data, include: { payments: true } });
    return NextResponse.json(resumo(debt), { status: 201 });
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create debt error:', error);
    return NextResponse.json({ error: 'Erro ao criar dívida' }, { status: 500 });
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
    if (!data.name) return NextResponse.json({ error: 'Descrição obrigatória' }, { status: 400 });
    if (!(data.originalAmount > 0)) {
      return NextResponse.json({ error: 'O valor total deve ser maior que zero' }, { status: 400 });
    }

    const debt = await db.debt.update({
      where: { id: body.id },
      data,
      include: { payments: { orderBy: { date: 'desc' } } },
    });

    return NextResponse.json(resumo(debt));
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });
    }
    console.error('Update debt error:', error);
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

  // Os pagamentos sobrevivem como saídas comuns (debt_id vira null):
  // o dinheiro saiu da conta e apagar a dívida não desfaz isso.
  const { count } = await db.debt.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

  return NextResponse.json({ success: true });
}
