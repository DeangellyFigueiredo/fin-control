import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const investments = await prisma.investment.findMany({
    include: { entries: { orderBy: { date: 'desc' }, take: 10 } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(investments);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { name, type, institution, currentValue, totalInvested, profit, profitPercentage, cdiPercentage } = await request.json();
    if (!name || !type) return NextResponse.json({ error: 'Nome e tipo obrigatórios' }, { status: 400 });

    const investment = await prisma.investment.create({
      data: {
        name, type,
        institution: institution || '',
        currentValue: parseFloat(currentValue) || 0,
        totalInvested: parseFloat(totalInvested) || 0,
        profit: parseFloat(profit) || 0,
        profitPercentage: parseFloat(profitPercentage) || 0,
        cdiPercentage: parseFloat(cdiPercentage) || 0,
      },
    });

    return NextResponse.json(investment, { status: 201 });
  } catch (error) {
    console.error('Create investment error:', error);
    return NextResponse.json({ error: 'Erro ao criar investimento' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const numericFields = ['currentValue', 'totalInvested', 'profit', 'profitPercentage', 'cdiPercentage'];
    const updateData = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateData[key] = numericFields.includes(key) ? parseFloat(value) : value;
      }
    }

    const investment = await prisma.investment.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(investment);
  } catch (error) {
    console.error('Update investment error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  await prisma.investment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
