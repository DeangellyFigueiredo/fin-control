import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { normalizeSettings } from '@/lib/settings';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { settings: true },
  });

  return NextResponse.json(normalizeSettings(user?.settings));
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await request.json();

    // normalizeSettings descarta qualquer chave ou valor fora do catálogo,
    // então o que chega do cliente nunca vira lixo no banco.
    const settings = normalizeSettings(body);

    await prisma.user.update({
      where: { id: session.userId },
      data: { settings },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Erro ao salvar preferências' }, { status: 500 });
  }
}
