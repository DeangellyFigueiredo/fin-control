import prisma from './prisma.js';

/**
 * Cliente Prisma escopado a um usuário e a uma carteira.
 *
 * São 60+ consultas espalhadas por 17 rotas; esquecer o filtro de dono em uma
 * única delas vaza dados financeiros de uma pessoa para outra. Em vez de
 * confiar na disciplina de escrever `where: { userId }` em todo lugar, o
 * filtro é injetado aqui, num ponto só.
 *
 * São DOIS escopos, e a diferença entre eles importa:
 *
 *   - `userId` é segurança. Está sempre ligado, sem exceção e sem interruptor.
 *   - `walletId` é contexto. Separa a pessoa física da PJ, e um dia poderá ser
 *     afrouxado para uma visão consolidada.
 *
 * Eles são propositalmente independentes. Se compartilhassem o mesmo
 * interruptor, o dia em que alguém abrir a visão consolidada abriria também a
 * porta entre usuários — que é exatamente o buraco que este arquivo existe
 * para fechar.
 *
 * Modelos não listados (User, Wallet) passam direto; a carteira é filtrada
 * por dono na própria rota.
 *
 * ATENÇÃO: extensões do Prisma não interceptam `$queryRaw`/`$executeRaw`.
 * Consulta crua em tabela escopada precisa filtrar dono e carteira na mão.
 */
const SCOPED_MODELS = new Set([
  'BankAccount',
  'Category',
  'Transaction',
  'MonthlySummary',
  'Investment',
  'InvestmentEntry',
  'FinancialGoal',
  'RecurringEntry',
  'CreditCard',
  'Debt',
  'CardBill',
  'Installment',
  'CategoryRule',
  'ReminderEvent',
]);

/**
 * Operações que aceitam `where`. As de linha única (findUnique, update,
 * delete, upsert) entram aqui porque o Prisma 5 permite combinar um campo
 * único com filtros extras — com o dono errado a operação levanta P2025 em
 * vez de atingir a linha.
 */
const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow',
  'findFirst', 'findFirstOrThrow',
  'findMany',
  'count', 'aggregate', 'groupBy',
  'update', 'updateMany',
  'delete', 'deleteMany',
  'upsert',
]);

export function userDb(userId, walletId) {
  if (!userId) throw new Error('userDb exige um userId');
  // Sem carteira, uma consulta varreria as duas de uma vez e o número na tela
  // misturaria PF com PJ em silêncio. Melhor estourar do que mentir.
  if (!walletId) throw new Error('userDb exige um walletId');

  const escopo = { userId, walletId };

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);

          const next = { ...args };

          if (WHERE_OPS.has(operation)) {
            next.where = { ...(next.where || {}), ...escopo };
          }

          // Toda criação nasce com dono e carteira, inclusive o lado `create`
          // do upsert
          if (operation === 'create') {
            next.data = { ...next.data, ...escopo };
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(next.data) ? next.data : [next.data];
            next.data = rows.map(row => ({ ...row, ...escopo }));
          } else if (operation === 'upsert') {
            next.create = { ...next.create, ...escopo };
          }

          return query(next);
        },
      },
    },
  });
}

/**
 * Cliente escopado só ao usuário, para mexer nas próprias carteiras.
 *
 * Não passa pela extensão acima: `Wallet` não está entre os modelos escopados,
 * então o filtro de dono é responsabilidade de quem chama — e é por isso que
 * este atalho existe, para deixar isso explícito em vez de disfarçado.
 */
export function walletsOf(userId) {
  if (!userId) throw new Error('walletsOf exige um userId');
  return {
    findMany: (args = {}) => prisma.wallet.findMany({ ...args, where: { ...(args.where || {}), userId } }),
    findFirst: (args = {}) => prisma.wallet.findFirst({ ...args, where: { ...(args.where || {}), userId } }),
    count: (args = {}) => prisma.wallet.count({ ...args, where: { ...(args.where || {}), userId } }),
    create: (args) => prisma.wallet.create({ ...args, data: { ...args.data, userId } }),
    updateMany: (args) => prisma.wallet.updateMany({ ...args, where: { ...(args.where || {}), userId } }),
    deleteMany: (args) => prisma.wallet.deleteMany({ ...args, where: { ...(args.where || {}), userId } }),
  };
}

export default userDb;

/**
 * Modelos por trás de cada chave estrangeira aceita do cliente.
 */
const FK_MODEL = {
  bankAccountId: 'bankAccount',
  categoryId: 'category',
  investmentId: 'investment',
  creditCardId: 'creditCard',
  debtId: 'debt',
};

/**
 * Erro de referência que não pertence ao usuário.
 */
export class NotOwnedError extends Error {
  constructor(field) {
    super(`Referência inválida: ${field}`);
    this.name = 'NotOwnedError';
    this.field = field;
  }
}

/**
 * Garante que toda chave estrangeira informada pelo cliente aponta para um
 * registro do próprio usuário.
 *
 * O cliente escopado protege a linha que está sendo escrita, mas não os ids
 * que vêm no corpo da requisição: sem esta checagem, alguém poderia criar um
 * lançamento próprio apontando para a conta ou o investimento de outra
 * pessoa — e o `include` da relação devolveria dados alheios.
 */
export async function assertOwned(db, refs) {
  await Promise.all(
    Object.entries(refs)
      .filter(([, id]) => Boolean(id))
      .map(async ([field, id]) => {
        const model = FK_MODEL[field];
        if (!model) throw new Error(`Chave estrangeira desconhecida: ${field}`);

        const found = await db[model].findFirst({ where: { id }, select: { id: true } });
        if (!found) throw new NotOwnedError(field);
      }),
  );
}
