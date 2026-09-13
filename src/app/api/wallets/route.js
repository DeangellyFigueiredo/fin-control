import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { walletsOf } from '@/lib/db';
import { getSession, getScope } from '@/lib/auth';
import { categoriesForWallet } from '@/lib/defaults';

const TIPOS = ['PF', 'PJ'];

/**
 * Carteiras do usuário.
 *
 * Uma carteira é um conjunto de finanças que se olha separado — a pessoa
 * física e a PJ, tipicamente. Não é um segundo usuário: é o mesmo dono, com
 * dois conjuntos de dados que não se misturam.
 */
export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const wallets = await walletsOf(scope.userId).findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({
    wallets,
    // Qual está ativa agora, para a tela marcar a escolhida sem adivinhar
    activeId: scope.walletId,
  });
}

export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { name, kind, color } = await request.json();

    const nome = String(name || '').trim();
    if (!nome) return NextResponse.json({ error: 'Dê um nome à carteira' }, { status: 400 });
    if (nome.length > 40) return NextResponse.json({ error: 'Nome muito longo' }, { status: 400 });

    const tipo = TIPOS.includes(kind) ? kind : 'PF';

    const quantas = await walletsOf(session.userId).count();
    if (quantas >= 10) {
      return NextResponse.json({ error: 'Limite de 10 carteiras' }, { status: 400 });
    }

    // Carteira nova nasce com as categorias do seu tipo: uma PJ não tem
    // "Lazer", e tem DAS, contador e pró-labore que a PF não tem.
    const wallet = await prisma.$transaction(async (tx) => {
      const criada = await tx.wallet.create({
        data: {
          name: nome,
          kind: tipo,
          color: color || (tipo === 'PJ' ? '#0984e3' : '#6c5ce7'),
          isDefault: quantas === 0,
          userId: session.userId,
        },
      });

      await tx.category.createMany({
        data: categoriesForWallet(tipo).map(c => ({
          ...c,
          userId: session.userId,
          walletId: criada.id,
        })),
      });

      return criada;
    });

    return NextResponse.json(wallet, { status: 201 });
  } catch (error) {
    console.error('Create wallet error:', error);
    return NextResponse.json({ error: 'Erro ao criar carteira' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { id, name, color, isDefault } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const dono = await walletsOf(session.userId).findFirst({ where: { id }, select: { id: true } });
    if (!dono) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

    // O tipo não muda depois de criada: as categorias já foram semeadas por
    // ele, e virar PJ não transformaria "Lazer" em "Contador".
    const data = {};
    if (name !== undefined) {
      const nome = String(name).trim();
      if (!nome) return NextResponse.json({ error: 'Dê um nome à carteira' }, { status: 400 });
      data.name = nome.slice(0, 40);
    }
    if (color !== undefined) data.color = color;

    if (isDefault) {
      // Exatamente uma padrão por usuário
      await walletsOf(session.userId).updateMany({ data: { isDefault: false } });
      data.isDefault = true;
    }

    const wallet = await prisma.wallet.update({ where: { id }, data });
    return NextResponse.json(wallet);
  } catch (error) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });
    console.error('Update wallet error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar carteira' }, { status: 500 });
  }
}

/**
 * Apagar uma carteira leva junto tudo que há dentro dela — contas, cartões,
 * lançamentos, metas, investimentos. Por isso exige o nome digitado por
 * extenso, e a última carteira não pode ser apagada.
 */
export async function DELETE(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const confirmacao = searchParams.get('confirm');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const wallet = await walletsOf(session.userId).findFirst({ where: { id } });
  if (!wallet) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

  const quantas = await walletsOf(session.userId).count();
  if (quantas <= 1) {
    return NextResponse.json({ error: 'Não dá para apagar a única carteira' }, { status: 400 });
  }

  if (confirmacao !== wallet.name) {
    return NextResponse.json(
      { error: `Para apagar, confirme digitando o nome da carteira: ${wallet.name}` },
      { status: 400 },
    );
  }

  await prisma.wallet.delete({ where: { id } });

  // Se a apagada era a padrão, a mais antiga assume
  if (wallet.isDefault) {
    const proxima = await walletsOf(session.userId).findFirst({ orderBy: { createdAt: 'asc' } });
    if (proxima) await prisma.wallet.update({ where: { id: proxima.id }, data: { isDefault: true } });
  }

  return NextResponse.json({ success: true });
}
