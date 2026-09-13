import { faturaDeUmaCompra, buildInsights }
  from '../src/lib/insights.js';
import { buildBuckets }
  from '../src/lib/buckets.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- prazo de cartao: os numeros reais do usuario ---
const santander = { id: 's', name: 'Santander', openingDay: 11, paymentDay: 15, estimatedAmount: 2745 };
const inter = { id: 'i', name: 'Inter', openingDay: 19, paymentDay: 25, estimatedAmount: 2820 };

ok('santander dia 13 -> 15/10', faturaDeUmaCompra(santander, 2026, 9, 13), { year: 2026, month: 10, day: 15, dias: 32 });
ok('santander dia 5 -> 15/09', faturaDeUmaCompra(santander, 2026, 9, 5), { year: 2026, month: 9, day: 15, dias: 10 });
ok('santander no proprio dia 11', faturaDeUmaCompra(santander, 2026, 9, 11).dias, 34);
ok('inter dia 13 -> 25/09', faturaDeUmaCompra(inter, 2026, 9, 13), { year: 2026, month: 9, day: 25, dias: 12 });
ok('inter dia 19 vira', faturaDeUmaCompra(inter, 2026, 9, 19).dias, 36);
// paga antes de abrir: o ciclo pula um mes
const estranho = { id: 'e', name: 'X', openingDay: 20, paymentDay: 5 };
ok('paga antes de abrir', faturaDeUmaCompra(estranho, 2026, 9, 25), { year: 2026, month: 11, day: 5, dias: 41 });
// dia 31 num mes de 30
const fim = { id: 'f', name: 'Y', openingDay: 1, paymentDay: 31 };
ok('31 cai no ultimo dia', faturaDeUmaCompra(fim, 2026, 3, 5).day, 30);

// --- mes que nao atravessa ---
const dias = (saldos) => saldos.map((b, i) => ({
  day: i + 1, balance: b, expense: 0, plannedExpense: 0, items: [],
}));
const mesRuim = {
  year: 2026, month: 9, days: dias([500, 400, -100, -300]),
  totals: { expense: 800, plannedExpense: 0 }, closingBalance: -300,
};
const d1 = buildInsights({ month: mesRuim, hoje: { year: 2026, month: 9, day: 1 } });
ok('alerta de dia apertado', d1[0].id, 'dia-apertado');
ok('alerta vem primeiro', d1[0].nivel, 'alerta');
ok('nao diz onde fecha se nao atravessa', d1.some(x => x.id === 'fecha-com'), false);

// --- baldes: a fatura e decomposta, nao somada inteira ---
const b = buildBuckets({
  transactions: [],
  recurring: [{ type: 'EXPENSE', name: 'Aluguel', amount: 3172, dayOfMonth: 20, active: true, frequency: 'MONTHLY' },
               { type: 'INCOME', name: 'Salario', amount: 10000, dayOfMonth: 5, active: true, frequency: 'MONTHLY' }],
  installments: [{ id: 'p1', description: 'Viagem', totalAmount: 1764, count: 10,
                   firstDate: '2026-09-15T00:00:00.000Z', creditCardId: 's', active: true }],
  cards: [santander],
  faturas: new Map(),
}, 2026, 9);

ok('recebimentos', b.recebimentos, 10000);
ok('parcelas', b.parcelamentos, 176.4);
ok('fixos', b.assinaturas, 3172);
ok('fatura entra so o que nao e parcela', Math.round(b.variaveis * 100) / 100, 2568.6);
ok('nao conta a parcela duas vezes', Math.round((b.parcelamentos + b.variaveis) * 100) / 100, 2745);
ok('comprometido', Math.round(b.comprometidoPct), 33);

// --- lancamento manual repetindo a recorrente nao dobra ---
const b2 = buildBuckets({
  transactions: [{ type: 'EXPENSE', description: 'Aluguel', amount: 3172 }],
  recurring: [{ type: 'EXPENSE', name: 'Aluguel', amount: 3172, dayOfMonth: 20, active: true, frequency: 'MONTHLY' }],
  installments: [], cards: [], faturas: new Map(),
}, 2026, 9);
ok('aluguel nao dobra', b2.saidas, 3172);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
