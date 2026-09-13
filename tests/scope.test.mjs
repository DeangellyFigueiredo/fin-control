/**
 * O escopo é a peça de segurança do app: um filtro esquecido mistura o
 * dinheiro de duas pessoas, ou a PF com a PJ. Estes testes seguram as
 * invariantes que não podem ceder.
 */
import { userDb, walletsOf } from '../src/lib/db.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const estoura = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// Sem um dos dois escopos a consulta varreria mais do que devia. Melhor
// derrubar a requisição do que devolver número errado em silêncio.
ok('sem usuario estoura', estoura(() => userDb(null, 'w1')), 'userDb exige um userId');
ok('sem carteira estoura', estoura(() => userDb('u1', null)), 'userDb exige um walletId');
ok('sem nada estoura', estoura(() => userDb()), 'userDb exige um userId');
ok('com os dois passa', estoura(() => userDb('u1', 'w1')), null);
ok('walletsOf exige usuario', estoura(() => walletsOf(null)), 'walletsOf exige um userId');

// O cliente escopado precisa expor os modelos usados pelas rotas
const db = userDb('u1', 'w1');
const MODELOS = ['bankAccount', 'category', 'transaction', 'investment', 'financialGoal',
  'recurringEntry', 'creditCard', 'debt', 'cardBill', 'installment', 'categoryRule'];
ok('modelos disponiveis', MODELOS.filter(m => !db[m]), []);

// Wallet NAO passa pela extensão: quem mexe nela filtra o dono na mão,
// e é por isso que walletsOf existe.
const carteiras = walletsOf('u1');
ok('walletsOf cobre o necessario',
  ['findMany', 'findFirst', 'count', 'create', 'updateMany', 'deleteMany'].filter(m => typeof carteiras[m] !== 'function'),
  []);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
