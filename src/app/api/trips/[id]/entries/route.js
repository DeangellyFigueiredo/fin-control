import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { tripAccess, entryView } from '@/lib/tripAccess';
import { validarGasto } from '@/lib/trips';
import { carregarRegras, sugerir, marcarAcerto } from '@/lib/rules';

const naoEncontrada = () => NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });

/**
 * Lança um gasto na viagem, sempre em nome de quem está logado.
 *
 * No método CONTA o dinheiro sai de uma conta, então nasce também um
 * Transaction — pelo cliente escopado de quem lança, na carteira ativa, com
 * a conta conferida por assertOwned. Os dois são gravados juntos: um gasto de
 * viagem sem o lançamento na conta faria o saldo mentir.
 */
export async function POST(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return naoEncontrada();

  try {
    const body = await request.json();
    const { data, error } = validarGasto(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const base = { ...data, tripId, userId: scope.userId };

    if (data.method !== 'CONTA') {
      const entry = await prisma.tripEntry.create({ data: base });
      return NextResponse.json(entryView(entry, scope.userId), { status: 201 });
    }

    if (!body.bankAccountId) {
      return NextResponse.json({ error: 'Escolha a conta de onde saiu' }, { status: 400 });
    }

    const db = userDb(scope.userId, scope.walletId);
    await assertOwned(db, { bankAccountId: body.bankAccountId });

    // Mesma categorização de um lançamento comum: no extrato da conta, o
    // gasto da viagem não deve parecer diferente dos outros.
    let categoryId = null;
    let regraUsada = null;
    if (data.description) {
      const achado = sugerir(await carregarRegras(db), data.description, data.type);
      if (achado) {
        categoryId = achado.categoryId;
        regraUsada = achado.rule?.id || null;
      }
    }

    const entry = await db.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          date: data.date,
          amount: data.amount,
          type: data.type,
          description: data.description,
          bankAccountId: body.bankAccountId,
          categoryId,
        },
      });

      return tx.tripEntry.create({ data: { ...base, transactionId: transaction.id } });
    });

    await marcarAcerto(db, regraUsada);

    return NextResponse.json(entryView(entry, scope.userId), { status: 201 });
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create trip entry error:', error);
    return NextResponse.json({ error: 'Erro ao lançar na viagem' }, { status: 500 });
  }
}

/**
 * Edita um gasto próprio. "Próprio" está na consulta, não na tela: o
 * participante que mandar o id de um gasto de outra pessoa recebe 404.
 *
 * O lançamento ligado acompanha. É do mesmo usuário, mas pode estar em outra
 * carteira (lançado com a PJ aberta), por isso o filtro é por dono e não pelo
 * cliente escopado da carteira atual.
 */
export async function PUT(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return naoEncontrada();

  try {
    const body = await request.json();
    const { data, error } = validarGasto(body, { criando: false });
    if (error) return NextResponse.json({ error }, { status: 400 });

    const atual = await prisma.tripEntry.findFirst({
      where: { id: String(body.id || ''), tripId, userId: scope.userId },
    });
    if (!atual) return NextResponse.json({ error: 'Gasto não encontrado' }, { status: 404 });

    const entry = await prisma.$transaction(async (tx) => {
      const salvo = await tx.tripEntry.update({ where: { id: atual.id }, data });

      if (atual.transactionId) {
        await tx.transaction.updateMany({
          where: { id: atual.transactionId, userId: scope.userId },
          data: { date: data.date, amount: data.amount, type: data.type, description: data.description },
        });
      }

      return salvo;
    });

    return NextResponse.json(entryView(entry, scope.userId));
  } catch (error) {
    console.error('Update trip entry error:', error);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}

/**
 * Apaga um gasto próprio. No método CONTA apaga também o lançamento na conta:
 * os dois nasceram juntos, e deixar o lançamento sozinho manteria no saldo um
 * pagamento que a pessoa acabou de dizer que não existe.
 */
export async function DELETE(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return naoEncontrada();

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get('entryId') || '';

  const atual = await prisma.tripEntry.findFirst({
    where: { id: entryId, tripId, userId: scope.userId },
    select: { id: true, transactionId: true },
  });
  if (!atual) return NextResponse.json({ error: 'Gasto não encontrado' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // A cascata da FK apagaria o gasto junto com o lançamento; o deleteMany
    // do gasto cobre o caso em que o lançamento já não existia.
    if (atual.transactionId) {
      await tx.transaction.deleteMany({ where: { id: atual.transactionId, userId: scope.userId } });
    }
    await tx.tripEntry.deleteMany({ where: { id: atual.id } });
  });

  return NextResponse.json({ success: true });
}
