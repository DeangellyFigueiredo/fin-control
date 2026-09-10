import { NextResponse } from 'next/server';
import { userDb, NotOwnedError } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  const goals = await db.financialGoal.findMany({
    include: { investment: true },
    orderBy: { targetDate: 'asc' },
  });

  return NextResponse.json(goals);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const { name, type, targetAmount, currentAmount, targetDate, monthlyContribution, investmentId } = await request.json();
    if (!name || !type || !targetAmount) {
      return NextResponse.json({ error: 'Nome, tipo e valor alvo obrigatórios' }, { status: 400 });
    }

    const goal = await db.financialGoal.create({
      data: {
        name, type,
        targetAmount: parseFloat(targetAmount),
        currentAmount: parseFloat(currentAmount) || 0,
        targetDate: targetDate ? new Date(targetDate) : null,
        monthlyContribution: parseFloat(monthlyContribution) || 0,
        investmentId: investmentId || null,
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create goal error:', error);
    return NextResponse.json({ error: 'Erro ao criar meta' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.targetAmount !== undefined) updateData.targetAmount = parseFloat(data.targetAmount);
    if (data.currentAmount !== undefined) updateData.currentAmount = parseFloat(data.currentAmount);
    if (data.targetDate !== undefined) updateData.targetDate = data.targetDate ? new Date(data.targetDate) : null;
    if (data.monthlyContribution !== undefined) updateData.monthlyContribution = parseFloat(data.monthlyContribution);
    if (data.investmentId !== undefined) updateData.investmentId = data.investmentId || null;
    if (data.isCompleted !== undefined) updateData.isCompleted = data.isCompleted;

    const goal = await db.financialGoal.update({ where: { id }, data: updateData });
    return NextResponse.json(goal);
  } catch (error) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Update goal error:', error);
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
  const { count } = await db.financialGoal.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  return NextResponse.json({ success: true });
}
