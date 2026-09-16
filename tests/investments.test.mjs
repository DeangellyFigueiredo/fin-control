/**
 * Investimentos: reconstruir o histórico e medir o rendimento.
 *
 * O caso que guia tudo: R$ 30.000 a 100% do CDI. De tempos em tempos a pessoa
 * abre o app do banco, vê R$ 30.412,50 e anota. O app precisa transformar isso
 * em rendimento sem pedir que ela faça a subtração.
 */
import {
  efeitoDe, serieDe, serieDaCarteira, previaDaAtualizacao,
  ultimaAtualizacao, totaisDaCarteira, rendimentoNoPeriodo,
} from '../src/lib/investments.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- efeito de cada tipo ---
ok('aporte entra nos dois', efeitoDe({ type: 'APORTE', amount: 1000 }), { saldo: 1000, investido: 1000 });
ok('resgate sai dos dois', efeitoDe({ type: 'RESGATE', amount: 500 }), { saldo: -500, investido: -500 });
ok('rendimento so no saldo', efeitoDe({ type: 'RENDIMENTO', amount: 412.5 }), { saldo: 412.5, investido: 0 });
ok('rendimento negativo e valido', efeitoDe({ type: 'RENDIMENTO', amount: -200 }), { saldo: -200, investido: 0 });

// --- a serie sai de tras para frente ---
// 30.000 aportados, dois rendimentos anotados; hoje o saldo e 30.712,50
const cdb = {
  currentValue: 30712.5,
  totalInvested: 30000,
  createdAt: '2026-08-20T00:00:00.000Z',
  entries: [
    { type: 'RENDIMENTO', amount: 412.5, date: '2026-09-01T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 300, date: '2026-09-15T00:00:00.000Z' },
  ],
};
const s = serieDe(cdb);
ok('origem, um ponto por movimento, e hoje', s.length, 4);
ok('a origem e o dia do cadastro', { d: s[0].date, saldo: s[0].saldo, investido: s[0].investido }, { d: '2026-08-20', saldo: 30000, investido: 30000 });
// o ponto carrega o saldo DEPOIS do movimento daquele dia, como no extrato
ok('no dia do primeiro rendimento ja conta ele', { d: s[1].date, saldo: s[1].saldo }, { d: '2026-09-01', saldo: 30412.5 });
ok('no dia do segundo, os dois', { d: s[2].date, saldo: s[2].saldo }, { d: '2026-09-15', saldo: 30712.5 });
ok('o mais novo bate com o saldo atual', s[s.length - 1].saldo, 30712.5);
ok('o investido nao se mexe com rendimento', s.map(p => p.investido), [30000, 30000, 30000, 30000]);

// investimento cadastrado sem movimento nenhum: a linha comeca no cadastro e
// vai reta ate hoje, em vez de aparecer do nada no ultimo dia
const semHistorico = { currentValue: 5000, totalInvested: 5000, createdAt: '2026-08-01T00:00:00.000Z', entries: [] };
const sh = serieDe(semHistorico);
ok('sem movimento, comeca no cadastro e chega hoje', sh.length, 2);
ok('e vale o saldo atual desde o cadastro', [sh[0].date, sh[0].saldo], ['2026-08-01', 5000]);

// movimento anterior ao cadastro empurra a origem para tras
const retroativo = serieDe({ currentValue: 1000, totalInvested: 1000, createdAt: '2026-09-10T00:00:00.000Z',
  entries: [{ type: 'APORTE', amount: 1000, date: '2026-09-01T00:00:00.000Z' }] });
ok('aporte retroativo puxa a origem', retroativo[0].date, '2026-08-31');

// aporte depois de rendimento: o investido sobe junto
const comAporte = {
  currentValue: 41000, totalInvested: 40000,
  createdAt: '2026-08-25T00:00:00.000Z',
  entries: [
    { type: 'RENDIMENTO', amount: 1000, date: '2026-09-01T00:00:00.000Z' },
    { type: 'APORTE', amount: 10000, date: '2026-09-10T00:00:00.000Z' },
  ],
};
const sa = serieDe(comAporte);
ok('antes de tudo: 30.000 investidos', { saldo: sa[0].saldo, investido: sa[0].investido }, { saldo: 30000, investido: 30000 });
ok('depois do aporte, investido sobe', sa[2].investido, 40000);
ok('e o saldo tambem', sa[2].saldo, 41000);

// dois movimentos no mesmo dia viram um ponto so, com o estado final
const mesmoDia = serieDe({ currentValue: 2500, totalInvested: 2000, entries: [
  { type: 'APORTE', amount: 2000, date: '2026-09-01T00:00:00.000Z' },
  { type: 'RENDIMENTO', amount: 500, date: '2026-09-01T00:00:00.000Z' },
] });
ok('mesmo dia, um ponto', mesmoDia.filter(p => p.date === '2026-09-01').length, 1);
ok('e o estado final do dia', mesmoDia.find(p => p.date === '2026-09-01').saldo, 2500);

// --- carteira: soma sem buracos ---
const a = { currentValue: 1000, totalInvested: 1000, createdAt: '2026-09-01T00:00:00.000Z', entries: [{ type: 'APORTE', amount: 1000, date: '2026-09-01T00:00:00.000Z' }] };
const b = { currentValue: 2000, totalInvested: 2000, createdAt: '2026-09-10T00:00:00.000Z', entries: [{ type: 'APORTE', amount: 2000, date: '2026-09-10T00:00:00.000Z' }] };

// um investimento sem movimento nenhum tambem entra na soma desde o cadastro
const parado = { currentValue: 500, totalInvested: 500, createdAt: '2026-09-05T00:00:00.000Z', entries: [] };
const comParado = serieDaCarteira([a, parado]);
ok('o parado entra desde o cadastro', comParado.find(p => p.date === '2026-09-05').saldo, 1500);
const carteira = serieDaCarteira([a, b]);
ok('o eixo junta as datas dos dois', carteira.length >= 3, true);
// No dia 10, o primeiro investimento nao tem ponto proprio — mas os 1000 dele
// continuam valendo. Sem isso, a carteira "cairia" nesse dia.
const dia10 = carteira.find(p => p.date === '2026-09-10');
ok('o saldo do outro nao desaparece', dia10.saldo, 3000);
ok('o ultimo ponto e a carteira inteira', carteira[carteira.length - 1].saldo, 3000);
ok('carteira vazia devolve vazio', serieDaCarteira([]), []);

// --- a previa enquanto digita ---
const hoje = new Date('2026-09-16T00:00:00.000Z');
const p = previaDaAtualizacao({ currentValue: 30412.5, entries: [{ type: 'RENDIMENTO', amount: 412.5, date: '2026-09-01T00:00:00.000Z' }] }, 30712.5, hoje);
ok('rendeu a diferenca', p.rendimento, 300);
ok('quinze dias desde a ultima', p.dias, 15);
ok('percentual sobre o saldo anterior', Number(p.percentual.toFixed(4)), 0.9864);
ok('projecao para 30 dias', p.aoMes, 600);

// saldo menor que o anterior: o fundo caiu
const queda = previaDaAtualizacao({ currentValue: 30000, entries: [] }, 29500, hoje);
ok('queda vira rendimento negativo', queda.rendimento, -500);
ok('sem anotacao anterior, sem intervalo', queda.dias, null);
ok('e sem projecao', queda.aoMes, null);

ok('valor invalido nao gera previa', previaDaAtualizacao({ currentValue: 100, entries: [] }, 'abc', hoje), null);
ok('saldo igual: rendeu zero', previaDaAtualizacao({ currentValue: 100, entries: [] }, 100, hoje).rendimento, 0);

// --- ultima atualizacao ignora aporte e resgate ---
ok('so rendimento conta como anotacao',
  ultimaAtualizacao({ entries: [
    { type: 'APORTE', amount: 1, date: '2026-09-20T00:00:00.000Z' },
    { type: 'RENDIMENTO', amount: 1, date: '2026-09-05T00:00:00.000Z' },
  ] })?.toISOString().slice(0, 10),
  '2026-09-05');
ok('nunca anotado', ultimaAtualizacao({ entries: [] }), null);

// --- totais ---
const t = totaisDaCarteira([{ currentValue: 30712.5, totalInvested: 30000 }, { currentValue: 5000, totalInvested: 5200 }]);
ok('saldo somado', t.saldo, 35712.5);
ok('investido somado', t.investido, 35200);
ok('lucro pode ser pequeno', t.lucro, 512.5);
ok('percentual do lucro', Number(t.percentual.toFixed(4)), 1.456);
ok('sem investimento, sem percentual', totaisDaCarteira([]).percentual, null);

// --- rendimento do periodo ---
ok('so o que esta dentro da janela',
  rendimentoNoPeriodo([cdb], new Date('2026-09-10T00:00:00.000Z')), 300);
ok('a janela inteira soma tudo',
  rendimentoNoPeriodo([cdb], new Date('2026-01-01T00:00:00.000Z')), 712.5);
ok('aporte nao conta como rendimento',
  rendimentoNoPeriodo([comAporte], new Date('2026-01-01T00:00:00.000Z')), 1000);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
