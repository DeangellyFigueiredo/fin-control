import { NextResponse } from 'next/server';
import { userDb, assertOwned, NotOwnedError } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { parseExtrato, chaveDuplicata } from '@/lib/import';
import { carregarRegras, sugerir, marcarAcerto } from '@/lib/rules';

/** Teto de segurança: extrato de um ano cabe folgado, arquivo colado errado não. */
const MAX_LINHAS = 2000;
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Importação de extrato/fatura em dois passos.
 *
 * POST { conteudo }            → pré-visualização: lê, categoriza e marca
 *                                o que já existe. Não grava nada.
 * POST { confirmar: [linhas] } → grava as linhas escolhidas.
 *
 * São dois passos de propósito: importar é a operação mais fácil de errar
 * feio (arquivo errado, mês errado, tudo duplicado), e a mais chata de
 * desfazer à mão depois.
 */
export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const db = userDb(session.userId);

  try {
    const body = await request.json();

    return Array.isArray(body.confirmar)
      ? await gravar(db, body)
      : await prever(db, body);
  } catch (error) {
    if (error instanceof NotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Erro ao importar' }, { status: 500 });
  }
}

async function prever(db, { conteudo, inverterSinal }) {
  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 });
  }
  if (conteudo.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo grande demais (máximo 4 MB)' }, { status: 400 });
  }

  const { rows, erro, formato, colunas } = parseExtrato(conteudo);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: 'Nenhuma transação reconhecida' }, { status: 400 });
  if (rows.length > MAX_LINHAS) {
    return NextResponse.json({ error: `Arquivo com ${rows.length} linhas; o limite é ${MAX_LINHAS}` }, { status: 400 });
  }

  // Fatura de cartão costuma vir com tudo positivo: uma chave inverte o lote
  const linhas = inverterSinal
    ? rows.map(r => ({ ...r, type: r.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE' }))
    : rows;

  const datas = linhas.map(r => r.date).sort();
  const contexto = await carregarRegras(db);

  // Só o intervalo do arquivo: comparar com o histórico inteiro seria varrer
  // a tabela para achar duplicata de um extrato de 30 dias.
  const existentes = await db.transaction.findMany({
    where: {
      date: {
        gte: new Date(`${datas[0]}T00:00:00.000Z`),
        lte: new Date(`${datas[datas.length - 1]}T23:59:59.999Z`),
      },
    },
    select: { date: true, amount: true, description: true },
  });

  const jaTem = new Set(
    existentes.map(t => chaveDuplicata(t.date.toISOString(), t.amount, t.description)),
  );

  // Duplicata dentro do próprio arquivo também conta
  const vistas = new Set();

  const preview = linhas.map((linha, i) => {
    const chave = chaveDuplicata(linha.date, linha.amount, linha.description);
    const duplicada = jaTem.has(chave) || vistas.has(chave);
    vistas.add(chave);

    const achado = sugerir(contexto, linha.description, linha.type);

    return {
      i,
      ...linha,
      duplicada,
      categoryId: achado?.categoryId || null,
      categoria: achado?.categoria?.name || null,
      origemCategoria: achado?.origem || null,
      ruleId: achado?.rule?.id || null,
    };
  });

  return NextResponse.json({
    formato,
    colunas,
    total: preview.length,
    duplicadas: preview.filter(l => l.duplicada).length,
    categorizadas: preview.filter(l => l.categoryId).length,
    linhas: preview,
  });
}

async function gravar(db, { confirmar, bankAccountId }) {
  if (!bankAccountId) return NextResponse.json({ error: 'Escolha a conta de destino' }, { status: 400 });
  if (!confirmar.length) return NextResponse.json({ error: 'Nenhuma linha selecionada' }, { status: 400 });
  if (confirmar.length > MAX_LINHAS) {
    return NextResponse.json({ error: `Limite de ${MAX_LINHAS} linhas por importação` }, { status: 400 });
  }

  await assertOwned(db, { bankAccountId });

  const categorias = new Set(confirmar.map(l => l.categoryId).filter(Boolean));
  await Promise.all([...categorias].map(categoryId => assertOwned(db, { categoryId })));

  const dados = [];
  for (const linha of confirmar) {
    const valor = Math.abs(parseFloat(linha.amount));
    if (!(valor > 0)) continue;
    if (!['INCOME', 'EXPENSE'].includes(linha.type)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(linha.date))) continue;

    dados.push({
      date: new Date(`${linha.date}T00:00:00.000Z`),
      amount: valor,
      type: linha.type,
      description: String(linha.description || '').slice(0, 200),
      bankAccountId,
      categoryId: linha.categoryId || null,
      // Importar é sempre olhar para trás: o saldo do investimento e as
      // projeções não devem se mexer por causa de um extrato de agosto.
      isRetroactive: true,
    });
  }

  if (!dados.length) return NextResponse.json({ error: 'Nenhuma linha válida' }, { status: 400 });

  const { count } = await db.transaction.createMany({ data: dados });

  // As regras que acertaram ganham peso para os próximos desempates
  const acertos = new Map();
  for (const linha of confirmar) {
    if (linha.ruleId) acertos.set(linha.ruleId, true);
  }
  await Promise.all([...acertos.keys()].map(id => marcarAcerto(db, id)));

  return NextResponse.json({ importadas: count }, { status: 201 });
}
