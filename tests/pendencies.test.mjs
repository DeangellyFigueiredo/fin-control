/**
 * Pendências: a previsão vencida que não pode sumir.
 *
 * O bug que isto guarda: antes, uma recorrente cujo dia passava desaparecia
 * do calendário, e o saldo projetado MELHORAVA sozinho. Com conta de 5.000,
 * internet de 150 vencida e aluguel de 3.000 pela frente, o app dizia 2.000
 * quando o certo era 1.850.
 */
import {
  casaComRecorrente, estadoDaRecorrente, ocorrenciaKey, diasDeAtraso, pendenciasParaHoje,
} from '../src/lib/pendencies.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const HOJE = { year: 2026, month: 9, day: 16 };
const isFuture = (y, m, d) =>
  y * 10000 + m * 100 + d >= HOJE.year * 10000 + HOJE.month * 100 + HOJE.day;

const recorrente = (over = {}) => ({
  id: 'r1', name: 'Internet', type: 'EXPENSE', amount: 150,
  dayOfMonth: 10, active: true, frequency: 'MONTHLY',
  // Cadastrada há muito tempo, salvo quando o teste disser outra coisa
  createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

const tx = (over = {}) => ({
  date: '2026-09-10T00:00:00.000Z', type: 'EXPENSE', amount: 150, description: 'Internet', ...over,
});

const ctx = (over = {}) => ({ isFuture, transactions: [], resolvidas: new Set(), ...over });

// --- casamento por nome, nao por valor ---
ok('mesmo nome e valor', casaComRecorrente(tx(), recorrente()), true);
ok('valor diferente ainda casa', casaComRecorrente(tx({ amount: 175 }), recorrente()), true);
ok('acento e caixa nao atrapalham', casaComRecorrente(tx({ description: 'PRÓ-LABORE' }), recorrente({ name: 'Pro labore' })), true);
ok('nome diferente nao casa', casaComRecorrente(tx({ description: 'Luz' }), recorrente()), false);
ok('tipo diferente nao casa', casaComRecorrente(tx({ type: 'INCOME' }), recorrente()), false);
ok('descricao vazia nao casa', casaComRecorrente(tx({ description: '' }), recorrente()), false);

// --- os tres estados ---
ok('dia futuro e previsao', estadoDaRecorrente(recorrente({ dayOfMonth: 25 }), 2026, 9, ctx()), 'futura');
ok('hoje ainda e previsao', estadoDaRecorrente(recorrente({ dayOfMonth: 16 }), 2026, 9, ctx()), 'futura');
ok('venceu sem lancamento e pendencia', estadoDaRecorrente(recorrente(), 2026, 9, ctx()), 'pendente');
ok('venceu com lancamento sumiu', estadoDaRecorrente(recorrente(), 2026, 9, ctx({ transactions: [tx()] })), 'realizada');
ok('venceu com valor diferente tambem sumiu', estadoDaRecorrente(recorrente(), 2026, 9, ctx({ transactions: [tx({ amount: 175 })] })), 'realizada');

// lancamento de outro mes nao serve
ok('lancamento de agosto nao resolve setembro',
  estadoDaRecorrente(recorrente(), 2026, 9, ctx({ transactions: [tx({ date: '2026-08-10T00:00:00.000Z' })] })),
  'pendente');

// resposta manual encerra
ok('marcada como paga',
  estadoDaRecorrente(recorrente(), 2026, 9, ctx({ resolvidas: new Set([ocorrenciaKey('r1', 2026, 9)]) })),
  'realizada');
ok('marcada como cancelada tambem encerra',
  estadoDaRecorrente(recorrente(), 2026, 9, ctx({ resolvidas: new Set([ocorrenciaKey('r1', 2026, 9)]) })),
  'realizada');
ok('resposta de setembro nao vale para outubro',
  estadoDaRecorrente(recorrente(), 2026, 10, ctx({ resolvidas: new Set([ocorrenciaKey('r1', 2026, 9)]) })),
  'futura');

// recorrente que nao cai no mes
ok('anual fora do mes', estadoDaRecorrente(recorrente({ frequency: 'YEARLY', monthOfYear: 4 }), 2026, 9, ctx()), null);
ok('inativa', estadoDaRecorrente(recorrente({ active: false }), 2026, 9, ctx()), null);
ok('antes do inicio', estadoDaRecorrente(recorrente({ startDate: '2026-10-01T00:00:00.000Z' }), 2026, 9, ctx()), null);

// --- o cadastro nao gera cobranca retroativa inventada ---
// Registrar "Internet dia 10" hoje nao pode fazer nascerem pendencias de
// junho, julho e agosto: o app nao acompanhou aqueles meses.
const nova = recorrente({ createdAt: '2026-09-14T00:00:00.000Z' });
ok('mes anterior ao cadastro nao vira pendencia', estadoDaRecorrente(nova, 2026, 8, ctx()), null);
ok('o proprio mes, mas dia ja passado antes do cadastro', estadoDaRecorrente(nova, 2026, 9, ctx()), null);
ok('o mes seguinte volta a valer', estadoDaRecorrente(nova, 2026, 10, ctx()), 'futura');

// cadastrada dia 1: o dia 10 do mesmo mes ja conta
const cedo = recorrente({ createdAt: '2026-09-01T00:00:00.000Z' });
ok('cadastrada antes do vencimento conta', estadoDaRecorrente(cedo, 2026, 9, ctx()), 'pendente');

// startDate explicito continua mandando
const comInicio = recorrente({ createdAt: '2026-09-14T00:00:00.000Z', startDate: '2026-06-01T00:00:00.000Z' });
ok('startDate explicito vence o createdAt', estadoDaRecorrente(comInicio, 2026, 8, ctx()), 'pendente');

// --- atraso ---
ok('seis dias de atraso', diasDeAtraso(2026, 9, 10, HOJE), 6);
ok('hoje nao esta atrasado', diasDeAtraso(2026, 9, 16, HOJE), 0);
ok('futuro nao fica negativo', diasDeAtraso(2026, 9, 25, HOJE), 0);
ok('atravessa o mes', diasDeAtraso(2026, 8, 20, HOJE), 27);

// --- o que o modal pergunta ---
const itens = [
  { recurringId: 'a', year: 2026, month: 9, day: 10, atraso: 6 },
  { recurringId: 'b', year: 2026, month: 9, day: 16, atraso: 0 },
  { recurringId: 'c', year: 2026, month: 8, day: 20, atraso: 27 },
];
const doDia = pendenciasParaHoje(itens, HOJE);
ok('pergunta pelo atrasado e pelo de hoje', doDia.map(p => p.recurringId), ['c', 'a', 'b']);
ok('o mais atrasado vem primeiro', doDia[0].atraso, 27);

// nada que ainda nao venceu entra no modal
const comFuturo = pendenciasParaHoje(
  [...itens, { recurringId: 'd', year: 2026, month: 9, day: 25, atraso: 0 }], HOJE,
);
ok('o que vence depois fica fora', comFuturo.some(p => p.recurringId === 'd'), false);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
