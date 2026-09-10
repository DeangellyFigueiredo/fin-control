import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const goals = await prisma.financialGoal.findMany({
    include: { investment: true },
    orderBy: { targetDate: 'asc' },
  });

  return NextResponse.json(goals);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { name, type, targetAmount, currentAmount, targetDate, monthlyContribution, investmentId } = await request.json();
    if (!name || !type || !targetAmount) {
      return NextResponse.json({ error: 'Nome, tipo e valor alvo obrigatórios' }, { status: 400 });
    }

    const goal = await prisma.financialGoal.create({
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
    console.error('Create goal error:', error);
    return NextResponse.json({ error: 'Erro ao criar meta' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

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

    const goal = await prisma.financialGoal.update({ where: { id }, data: updateData });
    return NextResponse.json(goal);
  } catch (error) {
    console.error('Update goal error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  await prisma.financialGoal.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
