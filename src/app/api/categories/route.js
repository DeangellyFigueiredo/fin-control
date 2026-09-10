import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const categories = await prisma.category.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json(categories);
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { name, type, color, icon } = await request.json();
    if (!name || !type) return NextResponse.json({ error: 'Nome e tipo obrigatórios' }, { status: 400 });

    const category = await prisma.category.create({
      data: { name, type, color: color || '#6c5ce7', icon: icon || '📌' },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Create category error:', error);
    return NextResponse.json({ error: 'Erro ao criar categoria' }, { status: 500 });
  }
}
