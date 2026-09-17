/**
 * Projeção de investimento.
 *
 * Os valores esperados aqui foram conferidos contra a fórmula fechada de
 * juros compostos com aporte, FV = P(1+i)^n + PMT·[((1+i)^n − 1)/i], e não
 * contra o próprio código — senão o teste só confirmaria o que o código faz,
 * inclusive se estiver errado.
 */
import {
  mensalDeAnual, anualDeMensal, taxaObservada, aporteMedioMensal, simular, mesesPara,
} from '../src/lib/simulate.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};
const perto = (n, real, esp, tol = 0.01) => {
  if (Math.abs(real - esp) > tol) { falhas++; console.log(`  FALHOU ${n}: ${real} != ${esp} (tol ${tol})`); }
  else console.log(`  ok ${n}`);
};

// --- conversão de taxa ---
// 12% ao ano compondo dá 0,9489% ao mês, não 1%
perto('12% ao ano vira mensal', mensalDeAnual(12) * 100, 0.9489, 0.0001);
perto('e volta', anualDeMensal(mensalDeAnual(12)), 12, 0.000001);
perto('1% ao mes vira 12,68% ao ano', anualDeMensal(0.01), 12.6825, 0.0001);
ok('taxa invalida', mensalDeAnual('abc'), null);
ok('zero e zero', mensalDeAnual(0), 0);

// --- a projeção ---
// R$ 1.000 a 1% ao mês por 12 meses, sem aporte: 1000 × 1,01^12 = 1126,83
const semAporte = simular({ inicial: 1000, aporte: 0, taxaMensal: 0.01, meses: 12 });
perto('so juros compostos', semAporte.final, 1126.83);
ok('aportado nao muda sem aporte', semAporte.aportado, 1000);
perto('o juro e a diferenca', semAporte.juros, 126.83);

// R$ 100/mês a 1% por 12 meses, do zero: 100 × [(1,01^12 − 1)/0,01] = 1268,25
const soAporte = simular({ inicial: 0, aporte: 100, taxaMensal: 0.01, meses: 12 });
perto('so aportes', soAporte.final, 1268.25);
ok('aportou 1200', soAporte.aportado, 1200);
perto('rendeu 68,25', soAporte.juros, 68.25);

// os dois juntos
const juntos = simular({ inicial: 1000, aporte: 100, taxaMensal: 0.01, meses: 12 });
perto('inicial mais aportes', juntos.final, 1126.83 + 1268.25);

// o aporte entra no FIM do mês: no mês 1 ele ainda não rendeu
const primeiro = simular({ inicial: 0, aporte: 100, taxaMensal: 0.10, meses: 1 });
ok('o aporte do mes 1 nao rende no mes 1', primeiro.final, 100);

// --- bordas ---
ok('taxa zero e so soma', simular({ inicial: 1000, aporte: 100, taxaMensal: 0, meses: 10 }).final, 2000);
ok('zero meses devolve o inicial', simular({ inicial: 5000, aporte: 900, taxaMensal: 0.05, meses: 0 }).final, 5000);
ok('e um ponto so', simular({ inicial: 5000, meses: 0 }).pontos.length, 1);
ok('doze meses, treze pontos', simular({ inicial: 0, meses: 12 }).pontos.length, 13);
ok('meses negativos nao quebram', simular({ inicial: 100, meses: -5 }).final, 100);
ok('tudo vazio', simular({}).final, 0);

// taxa negativa: o dinheiro encolhe, e a projeção tem que dizer isso
const encolhe = simular({ inicial: 1000, aporte: 0, taxaMensal: -0.01, meses: 12 });
ok('saldo menor que o inicial', encolhe.final < 1000, true);
ok('e o juro fica negativo', encolhe.juros < 0, true);

// --- quanto do resultado e juro ---
const longo = simular({ inicial: 0, aporte: 1000, taxaMensal: 0.01, meses: 240 });
ok('em 20 anos o juro passa o aporte', longo.juros > longo.aportado, true);
perto('e e a maior parte', longo.parteDeJuros, (longo.juros / longo.final) * 100);

// --- inflação: o poder de compra de hoje ---
const comInflacao = simular({ inicial: 1000, aporte: 0, taxaMensal: 0.01, meses: 12, inflacaoAnual: 12 });
// rendeu ~12,68% e a inflacao comeu 12%: sobra pouco
perto('o real fica abaixo do nominal', comInflacao.finalReal, 1126.83 / 1.12, 0.5);
ok('sem inflacao informada, real = nominal', simular({ inicial: 1000, taxaMensal: 0.01, meses: 12 }).finalReal, semAporte.final);
// rendimento igual à inflação: o poder de compra não muda
const empata = simular({ inicial: 1000, aporte: 0, taxaMensal: mensalDeAnual(10), meses: 12, inflacaoAnual: 10 });
perto('rendeu o que a inflacao comeu', empata.finalReal, 1000, 0.5);

// --- taxa medida no histórico ---
const semHistorico = { currentValue: 1000, entries: [] };
ok('sem historico, sem taxa', taxaObservada(semHistorico), null);
ok('uma anotacao so nao e taxa', taxaObservada({ currentValue: 1010, entries: [
  { type: 'RENDIMENTO', amount: 10, date: '2026-09-01T00:00:00.000Z' },
] }), null);

// tres anotações de ~1% ao mês, com 30 dias entre elas
const regular = {
  currentValue: 1030.301,
  entries: [
    { type: 'APORTE', amount: 1000, date: '2026-06-01T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 10, date: '2026-07-01T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 10.1, date: '2026-07-31T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 10.201, date: '2026-08-30T00:00:00.000Z' },
  ],
};
const medida = taxaObservada(regular);
perto('mede 1% ao mes', medida.mensal * 100, 1, 0.05);
ok('duas observacoes uteis', medida.amostras, 2);

// um mês atípico não desloca a mediana
const comOutlier = {
  currentValue: 2000,
  entries: [
    { type: 'APORTE', amount: 1000, date: '2026-05-01T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 10, date: '2026-06-01T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 10, date: '2026-07-01T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 10, date: '2026-07-31T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 970, date: '2026-08-30T00:00:00.000Z' },
  ],
};
ok('a mediana resiste ao mes atipico', taxaObservada(comOutlier).mensal < 0.05, true);

// --- aporte médio ---
ok('sem aporte, sem media', aporteMedioMensal({ entries: [] }), null);
ok('rendimento nao conta como aporte', aporteMedioMensal({ entries: [
  { type: 'RENDIMENTO', amount: 500, date: '2026-01-01T00:00:00.000Z' },
] }), null);

// --- quanto tempo para chegar a um alvo ---
ok('ja alcancado e zero', mesesPara({ inicial: 100000, alvo: 50000 }), 0);
// No mes 31 o saldo e 4.974,60; so no 32 passa dos 5.000
ok('1.000 a 1% com 100/mes chega a 5.000', mesesPara({ inicial: 1000, aporte: 100, taxaMensal: 0.01, alvo: 5000 }), 32);
ok('parado nunca chega', mesesPara({ inicial: 100, aporte: 0, taxaMensal: 0, alvo: 1000 }), null);
ok('longe demais devolve null', mesesPara({ inicial: 1, aporte: 1, taxaMensal: 0, alvo: 1e9 }), null);
ok('alvo invalido', mesesPara({ inicial: 100, alvo: 'abc' }), null);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
