/**
 * A viagem responde "quanto posso gastar hoje". Um erro aqui não quebra a
 * tela: mostra um número plausível e errado, e a pessoa gasta confiando nele.
 */
import { resumoViagem, faseDe, diaDe, validarViagem, validarGasto } from '../src/lib/trips.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// Como vem do banco: meia-noite UTC
const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const gasto = (iso, amount, extra = {}) => ({
  date: d(iso), amount, type: 'EXPENSE', category: 'Alimentação', userId: 'u1', ...extra,
});

// 10 dias, de 01/10 a 10/10, R$ 5.000, dos quais R$ 2.000 reservados para
// passagem e hotel
const trip = { startDate: d('2026-10-01'), endDate: d('2026-10-10'), budget: 5000, prepBudget: 2000 };

// --- fases, inclusive nas bordas ---
ok('véspera é preparação', faseDe(trip, d('2026-09-30')), 'preparacao');
ok('dia da ida é destino', faseDe(trip, d('2026-10-01')), 'destino');
ok('dia da volta é destino', faseDe(trip, d('2026-10-10')), 'destino');
ok('dia seguinte é depois', faseDe(trip, d('2026-10-11')), 'depois');
// A data do input chega como string, e não pode depender do fuso de quem roda
ok('string e Date dão o mesmo dia', diaDe('2026-10-01'), diaDe(d('2026-10-01')));

// --- antes da viagem ---
{
  const r = resumoViagem(trip, [gasto('2026-09-01', 1500, { category: 'Transporte' })], '2026-09-25');
  ok('antes: status', r.status, 'antes');
  ok('antes: dias até a ida', r.diasAteIda, 6);
  ok('antes: sem limite de hoje', r.hoje, null);
  // A passagem (1.500) ainda não chegou na reserva (2.000): o destino
  // continua sem contar com os R$ 500 que faltam
  ok('antes: destino usa a reserva', r.destinoOrcado, 3000);
  ok('antes: limite planejado', r.limitePlanejado, 300);
  ok('antes: saldo', r.saldo, 3500);
}

// --- a preparação estourou a reserva ---
{
  const r = resumoViagem(trip, [gasto('2026-09-01', 2600, { category: 'Transporte' })], '2026-09-25');
  ok('estouro: o excesso sai do destino', r.destinoOrcado, 2400);
  ok('estouro: limite planejado cai', r.limitePlanejado, 240);
}

// --- durante: o gasto de hoje não mexe no limite de hoje ---
{
  const entries = [
    gasto('2026-09-01', 2000, { category: 'Hospedagem' }),
    gasto('2026-10-01', 400),
    gasto('2026-10-02', 200),
    gasto('2026-10-03', 90),
  ];
  const r = resumoViagem(trip, entries, '2026-10-03');
  ok('durante: status', r.status, 'durante');
  ok('durante: dia 3 de 10', r.hoje.diaDaViagem, 3);
  ok('durante: faltam 8 dias contando hoje', r.hoje.diasRestantes, 8);
  // (3.000 − 600 dos outros dias) ÷ 8
  ok('durante: limite de hoje', r.hoje.limite, 300);
  ok('durante: gasto de hoje', r.hoje.gasto, 90);
  ok('durante: resta hoje', r.hoje.resta, 210);

  // Gastar mais hoje reduz o que resta, não o limite
  const mais = resumoViagem(trip, [...entries, gasto('2026-10-03', 100)], '2026-10-03');
  ok('durante: limite fica parado', mais.hoje.limite, 300);
  ok('durante: resta encolhe', mais.hoje.resta, 110);
}

// --- gasto já marcado para um dia seguinte é dinheiro comprometido ---
{
  const r = resumoViagem(trip, [
    gasto('2026-10-01', 200),
    gasto('2026-10-06', 400, { category: 'Passeios' }), // passeio pago para o dia 6
  ], '2026-10-03');
  // (3.000 − 200 − 400) ÷ 8: o passeio do dia 6 já não está disponível hoje
  ok('futuro: entra no limite de hoje', r.hoje.limite, 300);
  ok('futuro: não conta como gasto de hoje', r.hoje.gasto, 0);
}

// --- entrada abate da fase em que cai ---
{
  const r = resumoViagem(trip, [
    gasto('2026-10-01', 500),
    gasto('2026-10-01', 200, { type: 'INCOME', category: 'Outros' }),
  ], '2026-10-02');
  ok('entrada: destino líquido', r.gasto.destino, 300);
  // (3.000 − 300) ÷ 9
  ok('entrada: limite de hoje', r.hoje.limite, 300);
}

// --- depois da volta: soma no total, não no destino ---
{
  const r = resumoViagem(trip, [gasto('2026-10-11', 80, { category: 'Transporte' })], '2026-10-12');
  ok('depois: status', r.status, 'encerrada');
  ok('depois: fora do destino', r.gasto.destino, 0);
  ok('depois: no total', r.gasto.total, 80);
  ok('depois: sem limite de hoje', r.hoje, null);
}

// --- viagem de um dia ---
{
  const bate = { startDate: d('2026-10-05'), endDate: d('2026-10-05'), budget: 300, prepBudget: 0 };
  const r = resumoViagem(bate, [], '2026-10-05');
  ok('um dia: total de dias', r.totalDias, 1);
  ok('um dia: limite é o orçamento', r.hoje.limite, 300);
}

// --- centavos ---
{
  // 0,1 + 0,2 em Float dá 0,30000000000000004
  const r = resumoViagem(trip, [gasto('2026-10-01', 0.1), gasto('2026-10-01', 0.2)], '2026-10-02');
  ok('centavos: soma exata', r.gasto.destino, 0.3);

  // R$ 1.000 em 3 dias: o limite arredonda para baixo, e os três dias
  // somados não passam do orçamento
  const tres = { startDate: d('2026-10-01'), endDate: d('2026-10-03'), budget: 1000, prepBudget: 0 };
  const t = resumoViagem(tres, [], '2026-10-01');
  ok('centavos: limite para baixo', t.hoje.limite, 333.33);
}

// --- agrupamentos ---
{
  const r = resumoViagem(trip, [
    gasto('2026-10-01', 50, { userId: 'u1' }),
    gasto('2026-10-02', 30, { userId: 'u2', category: 'Passeios' }),
    gasto('2026-10-02', 20, { userId: 'u1' }),
  ], '2026-10-03');
  ok('por dia, mais recente primeiro', r.porDia, [{ data: '2026-10-02', valor: 50 }, { data: '2026-10-01', valor: 50 }]);
  ok('por categoria, maior primeiro', r.porCategoria, [{ categoria: 'Alimentação', valor: 70 }, { categoria: 'Passeios', valor: 30 }]);
  ok('por pessoa', r.porPessoa, [{ userId: 'u1', valor: 70 }, { userId: 'u2', valor: 30 }]);
}

// --- validação ---
const base = { name: 'Salvador', startDate: '2026-10-01', endDate: '2026-10-10', budget: '5000', prepBudget: '2000' };
ok('viagem válida', validarViagem(base).error, undefined);
ok('volta antes da ida', validarViagem({ ...base, endDate: '2026-09-30' }).error, 'A volta não pode ser antes da ida');
ok('sem orçamento', validarViagem({ ...base, budget: '' }).error, 'Informe o orçamento da viagem');
ok('reserva maior que o orçamento', validarViagem({ ...base, prepBudget: '6000' }).error,
  'A reserva de preparação não pode passar do orçamento');
ok('reserva vazia vira zero', validarViagem({ ...base, prepBudget: '' }).data.prepBudget, 0);
ok('data vai para meia-noite UTC', validarViagem(base).data.startDate.toISOString(), '2026-10-01T00:00:00.000Z');

const g = { type: 'EXPENSE', amount: '42.5', date: '2026-10-02', category: 'Passeios', method: 'CARTAO' };
ok('gasto válido', validarGasto(g).error, undefined);
ok('categoria fora da lista', validarGasto({ ...g, category: 'Mercado' }).error, 'Escolha uma categoria');
ok('método inválido', validarGasto({ ...g, method: 'PIX' }).error, 'Escolha como foi pago');
ok('investimento não entra', validarGasto({ ...g, type: 'INVESTMENT' }).error, 'Tipo inválido');
ok('valor zero', validarGasto({ ...g, amount: '0' }).error, 'Valor deve ser maior que zero');
// Na edição o método não muda, então nem é lido
ok('edição ignora o método', validarGasto({ ...g, method: 'PIX' }, { criando: false }).data.method, undefined);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
