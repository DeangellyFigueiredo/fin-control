import prisma from './prisma.js';

/**
 * Cliente Prisma escopado a um usuário.
 *
 * São 60+ consultas espalhadas por 13 rotas; esquecer o filtro de dono em uma
 * única delas vaza dados financeiros de uma pessoa para outra. Em vez de
 * confiar na disciplina de escrever `where: { userId }` em todo lugar, o
 * filtro é injetado aqui, num ponto só.
 *
 * Modelos não listados (User) passam direto.
 *
 * ATENÇÃO: extensões do Prisma não interceptam `$queryRaw`/`$executeRaw`.
 * Consulta crua em tabela escopada precisa filtrar o dono na mão.
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

const withOwner = (where, userId) => ({ ...(where || {}), userId });

export function userDb(userId) {
  if (!userId) throw new Error('userDb exige um userId');

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);

          const next = { ...args };

          if (WHERE_OPS.has(operation)) {
            next.where = withOwner(next.where, userId);
          }

          // Toda criação nasce com dono, inclusive o lado `create` do upsert
          if (operation === 'create') {
            next.data = { ...next.data, userId };
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(next.data) ? next.data : [next.data];
            next.data = rows.map(row => ({ ...row, userId }));
          } else if (operation === 'upsert') {
            next.create = { ...next.create, userId };
          }

          return query(next);
        },
      },
    },
  });
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
