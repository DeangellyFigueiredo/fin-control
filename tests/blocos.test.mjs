/**
 * Blocos por cidade: cada dia da viagem precisa cair em exatamente um bloco,
 * senão o gasto do dia aparece em dois lugares ou some.
 */
import { readFileSync } from 'fs';
import { blocosDoRoteiro, blocoDoDia } from '../src/lib/blocos.js';
import { estadias, diasDoRoteiro, validarRoteiroImportado } from '../src/lib/roteiro.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const trip = { startDate: d('2026-12-11'), endDate: d('2026-12-18'), budget: 6000, prepBudget: 2000 };
const fixture = JSON.parse(readFileSync(new URL('./amostras/roteiro-serra-gaucha.json', import.meta.url), 'utf8'));
const { data } = validarRoteiroImportado(fixture, trip);
const stops = data.stops.map((s, i) => ({ ...s, id: `s${i}` }));
const activities = data.activities.map((a, i) => ({ ...a, id: `a${i}` }));
const entries = [
  { date: d('2026-12-14'), amount: 350, type: 'EXPENSE' },
  { date: d('2026-12-17'), amount: 120.5, type: 'EXPENSE' },
];

const lista = estadias(stops);
const dias = diasDoRoteiro(trip, stops, activities, entries);
const blocos = blocosDoRoteiro(lista, dias);

ok('um bloco por parada', blocos.map(b => b.titulo),
  ['Saída de Itapema', 'Cambará do Sul', 'Gramado', 'Bento Gonçalves', 'Volta para Itapema']);
ok('tipos', blocos.map(b => b.tipo), ['saida', 'estadia', 'estadia', 'estadia', 'volta']);
ok('dias de cada bloco', blocos.map(b => b.dias.map(x => x.data.slice(8))),
  [[], ['11', '12'], ['13', '14', '15'], ['16', '17'], ['18']]);

const contagem = new Map();
for (const b of blocos) for (const x of b.dias) contagem.set(x.data, (contagem.get(x.data) || 0) + 1);
ok('cada dia em exatamente um bloco', [contagem.size, [...contagem.values()].every(n => n === 1)], [8, true]);

ok('trecho da saída sai de Itapema', [blocos[0].trecho.de.city, blocos[0].trecho.para.city, blocos[0].trecho.km], ['Itapema', 'Cambará do Sul', 330]);
ok('trecho de Gramado vem de Cambará', [blocos[2].trecho.de.city, blocos[2].trecho.km], ['Cambará do Sul', 110]);
ok('gasto e estimado por bloco', [blocos[2].gasto, blocos[2].estimado, blocos[3].gasto], [350, 470, 120.5]);
ok('atividades do bloco', [blocos[2].atividades, blocos[1].atividades], [13, 5]);
ok('noites', blocos.map(b => b.noites), [0, 2, 3, 2, 0]);
ok('bloco do dia', [blocoDoDia(blocos, '2026-12-15').titulo, blocoDoDia(blocos, '2026-12-30')], ['Gramado', null]);

// Sem volta para casa: o último bloco é uma chegada
const soIda = estadias(stops.slice(0, 3));
ok('sem volta: chegada', blocosDoRoteiro(soIda, diasDoRoteiro(trip, stops.slice(0, 3), [], [])).at(-1).titulo, 'Chegada em Gramado');
ok('sem paradas: sem blocos', blocosDoRoteiro([], dias), []);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
