import { installmentAmount, installmentFor, lastInstallmentMonth, remainingAmount, firstDateFromNext } from '../src/lib/installments.js';

let falhas = 0;
const ok = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { falhas++; console.log(`  FALHOU ${nome}: ${a} != ${b}`); }
  else console.log(`  ok ${nome}`);
};

// centavos que não dividem
const tres = [1, 2, 3].map(i => installmentAmount(1000, 3, i));
ok('1000 em 3x', tres, [333.33, 333.33, 333.34]);
ok('soma fecha', Math.round(tres.reduce((a, b) => a + b, 0) * 100) / 100, 1000);
ok('1764 em 10x', installmentAmount(1764, 10, 1), 176.4);

// viagem 1/10 a partir de setembro/2026
const viagem = { active: true, count: 10, totalAmount: 1764, firstDate: '2026-09-15T00:00:00.000Z' };
ok('setembro e a 1a', installmentFor(viagem, 2026, 9)?.index, 1);
ok('outubro e a 2a', installmentFor(viagem, 2026, 10)?.index, 2);
ok('junho/27 e a 10a', installmentFor(viagem, 2027, 6)?.index, 10);
ok('julho/27 ja acabou', installmentFor(viagem, 2027, 7), null);
ok('agosto/26 nao comecou', installmentFor(viagem, 2026, 8), null);
ok('ultima marcada', installmentFor(viagem, 2027, 6)?.isLast, true);
ok('ultimo mes', lastInstallmentMonth(viagem), { year: 2027, month: 6 });
ok('falta tudo em set', remainingAmount(viagem, 2026, 9), 1764);
ok('faltam 9 em out', Math.round(remainingAmount(viagem, 2026, 10) * 100) / 100, 1587.6);

// dia 31 num mes de 30
const dia31 = { active: true, count: 6, totalAmount: 600, firstDate: '2026-01-31T00:00:00.000Z' };
ok('31 vira 28 em fev', installmentFor(dia31, 2026, 2)?.day, 28);
ok('31 vira 30 em abr', installmentFor(dia31, 2026, 4)?.day, 30);

// cadastro de uma compra ja em andamento: "a proxima e a 2/5, em out/2026"
ok('playstation 2/5', firstDateFromNext(2, 2026, 10, 20), '2026-09-20');
ok('parcela 1 nao volta', firstDateFromNext(1, 2026, 10, 20), '2026-10-20');
ok('atravessa o ano', firstDateFromNext(4, 2026, 2, 10), '2025-11-10');

// desativada some
ok('inativa', installmentFor({ ...viagem, active: false }, 2026, 9), null);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
