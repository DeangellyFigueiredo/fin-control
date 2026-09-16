import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getScope } from '@/lib/auth';

/**
 * Atualiza o saldo de um investimento a partir do que o banco mostra.
 *
 * POST { investmentId, balance, date }
 *
 * A pessoa abre o app do banco, vê R$ 30.412,50 e digita isso. O rendimento
 * é a diferença para o saldo anterior — pedir o rendimento direto obrigaria
 * a fazer a subtração de cabeça toda vez, e ninguém faz.
 *
 * A diferença vira uma movimentação de RENDIMENTO como qualquer outra, para o
 * histórico continuar sendo uma coisa só. Pode ser negativa: fundo cai, e o
 * saldo vem menor que o da última anotação.
 */
export async function POST(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(scope.userId, scope.walletId);

  try {
    const { investmentId, balance, date, description } = await request.json();

    if (!investmentId) return NextResponse.json({ error: 'Escolha o investimento' }, { status: 400 });

    const saldo = parseFloat(String(balance).replace(',', '.'));
    if (!Number.isFinite(saldo) || saldo < 0) {
      return NextResponse.json({ error: 'Informe o saldo que o banco mostra' }, { status: 400 });
    }

    await assertOwned(db, { investmentId });

    const investment = await db.investment.findFirst({ where: { id: investmentId } });
    if (!investment) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const quando = date ? new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(quando.getTime())) {
      return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    }

    const rendimento = Math.round((saldo - investment.currentValue) * 100) / 100;

    // Saldo igual ao anterior não é movimento: gravar um rendimento de zero
    // só encheria o histórico de linhas que não dizem nada.
    if (rendimento === 0) {
      return NextResponse.json({ investment, entry: null, rendimento: 0 });
    }

    const resultado = await db.$transaction(async (tx) => {
      const entry = await tx.investmentEntry.create({
        data: {
          investmentId,
          date: quando,
          type: 'RENDIMENTO',
          amount: rendimento,
          description: description || 'Saldo atualizado',
        },
      });

      const profit = saldo - investment.totalInvested;

      const atualizado = await tx.investment.update({
        where: { id: investmentId },
        data: {
          currentValue: saldo,
          profit,
          profitPercentage: investment.totalInvested > 0 ? (profit / investment.totalInvested) * 100 : 0,
        },
      });

      return { investment: atualizado, entry, rendimento };
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    console.error('Update balance error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar o saldo' }, { status: 500 });
  }
}
