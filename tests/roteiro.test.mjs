/**
 * O roteiro diz onde a viagem está e se ela está no ritmo. Um erro aqui põe
 * o carro na cidade errada ou diz "no ritmo" com o orçamento estourando.
 * Ver docs/rfc/0003-roteiro.md.
 */
import { readFileSync } from 'fs';
import {
  estadias, paradaDoDia, progressoDaRota, diasDoRoteiro, ritmo, foraDasDatas,
  enquadrar, trechosSuaves, validarParada, validarAtividade, validarRoteiroImportado,
} from '../src/lib/roteiro.js';
import { resumoViagem } from '../src/lib/trips.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);

// A viagem real que motivou a RFC, como vem do banco
const fixture = JSON.parse(readFileSync(new URL('./amostras/roteiro-serra-gaucha.json', import.meta.url), 'utf8'));
const trip = { startDate: d('2026-12-11'), endDate: d('2026-12-18'), budget: 6000, prepBudget: 2000 };
const importado = validarRoteiroImportado(fixture, trip);
ok('fixture importa sem erro', importado.error, undefined);
const stops = importado.data.stops.map((s, i) => ({ ...s, id: `s${i}` }));
const activities = importado.data.activities.map((a, i) => ({ ...a, id: `a${i}` }));

// --- estadias ---
{
  const e = estadias(stops);
  ok('tipos pela posição', e.map(s => s.tipo), ['origem', 'pernoite', 'pernoite', 'pernoite', 'fim']);
  ok('noites', e.map(s => s.noites), [0, 2, 3, 2, 0]);
  ok('saída é a chegada da seguinte', e[2].saida, '2026-12-16');
  // Passagem: chega e sai no mesmo dia
  const comPassagem = estadias([
    { date: d('2026-12-01'), city: 'A' },
    { date: d('2026-12-01'), city: 'B', order: 1 },
    { date: d('2026-12-01'), city: 'C', order: 2 },
    { date: d('2026-12-03'), city: 'D' },
  ]);
  ok('passagem', comPassagem.map(s => s.tipo), ['origem', 'passagem', 'pernoite', 'fim']);
}

// --- onde a viagem está em cada dia ---
{
  const ida = paradaDoDia(stops, '2026-12-11');
  ok('dia da ida: manhã na origem', ida.manha.city, 'Itapema');
  ok('dia da ida: noite em Cambará', ida.noite.city, 'Cambará do Sul');
  ok('dia da ida: um trecho de 330 km', ida.trechos.map(t => t.km), [330]);

  const meio = paradaDoDia(stops, '2026-12-12');
  ok('dia sem trecho: mesmo lugar', [meio.manha.city, meio.noite.city], ['Cambará do Sul', 'Cambará do Sul']);
  ok('dia sem trecho: sem trechos', meio.trechos.length, 0);

  const troca = paradaDoDia(stops, '2026-12-13');
  ok('dia de troca: nas duas', [troca.manha.city, troca.noite.city], ['Cambará do Sul', 'Gramado']);

  const saidaDeGramado = paradaDoDia(stops, '2026-12-16');
  ok('saída de Gramado', [saidaDeGramado.manha.city, saidaDeGramado.noite.city], ['Gramado', 'Bento Gonçalves']);

  const volta = paradaDoDia(stops, '2026-12-18');
  ok('volta: noite em casa', volta.noite.tipo, 'fim');

  const antes = paradaDoDia(stops, '2026-12-01');
  ok('antes da primeira parada: nenhuma', [antes.manha, antes.noite], [null, null]);
}

// --- tracking pela data ---
ok('antes da ida: na origem', progressoDaRota(stops, '2026-12-01'), { posicao: 0, total: 4, emTrecho: false });
ok('dia da ida: no meio do trecho', progressoDaRota(stops, '2026-12-11'), { posicao: 0.5, total: 4, emTrecho: true });
ok('meio da estadia: parado', progressoDaRota(stops, '2026-12-14'), { posicao: 2, total: 4, emTrecho: false });
ok('último dia: voltando', progressoDaRota(stops, '2026-12-18'), { posicao: 3.5, total: 4, emTrecho: true });
ok('depois da volta: rota inteira', progressoDaRota(stops, '2026-12-20'), { posicao: 4, total: 4, emTrecho: false });
ok('sem paradas', progressoDaRota([], '2026-12-14'), { posicao: 0, total: 0, emTrecho: false });

// --- dias do roteiro, estimado contra real ---
{
  const entries = [
    { date: d('2026-12-14'), amount: 380.45, type: 'EXPENSE', activityId: 'a13', category: 'Alimentação' },
    { date: d('2026-12-14'), amount: 0.1, type: 'EXPENSE', category: 'Outros' },
    { date: d('2026-12-14'), amount: 0.2, type: 'EXPENSE', category: 'Outros' },
    // Reembolso de parte do fondue
    { date: d('2026-12-14'), amount: 30.45, type: 'INCOME', activityId: 'a13', category: 'Alimentação' },
  ];
  const dias = diasDoRoteiro(trip, stops, activities, entries);
  ok('um item por dia', dias.length, 8);
  ok('numeração', [dias[0].numero, dias[7].numero], [1, 8]);
  ok('dia da semana (11/12/2026 é sexta)', dias[0].semana, 5);
  const d14 = dias[3];
  ok('centavos fecham', d14.gasto, 350.3);
  ok('estimado do dia', d14.estimado, 470);
  ok('real da atividade com reembolso', d14.atividades.find(a => a.id === 'a13').gasto, 350);
  ok('período da hora', dias[2].porPeriodo.NOITE.map(a => a.title), ['Show de Acendimento do Natal Luz']);

  const pulando = activities.map(a => (a.id === 'a13' ? { ...a, status: 'PULADA' } : a));
  ok('pulada sai do estimado', diasDoRoteiro(trip, stops, pulando, [])[3].estimado, 120);

  // 11/12 tem exatamente 5h: só "mais de" 5h pesa
  ok('5h e 3 atividades não pesa', dias[0].pesado, false);
  ok('7h com 1 atividade não pesa', dias[7].pesado, false);
  const cheio = [...activities, ...[1, 2].map(i => ({ id: `x${i}`, date: d('2026-12-18'), period: 'NOITE', title: 'x', category: 'Outros', status: 'PLANEJADA' }))];
  ok('7h com 3 atividades pesa', diasDoRoteiro(trip, stops, cheio, [])[7].pesado, true);
}

// --- ritmo ---
{
  // Orçamento 6000, reserva 2000 → 4000 / 8 dias = 500 por dia
  const gasto = (iso, amount, type = 'EXPENSE') => ({ date: d(iso), amount, type, category: 'Passeios', userId: 'u1' });

  const antes = ritmo(trip, [], activities, stops, '2026-12-01');
  ok('antes: sem comparação', antes.dinheiro, { estado: 'antes', diferenca: 0 });
  ok('antes: limite do dia', antes.limiteDia, 500);
  ok('antes: sem real', antes.serie.every(p => p.real === null), true);

  const entries = [gasto('2026-11-01', 2000), gasto('2026-12-11', 600), gasto('2026-12-12', 580)];
  const r = ritmo(trip, entries, activities, stops, '2026-12-12');
  ok('acima do planejado', r.dinheiro, { estado: 'acima', diferenca: 180 });
  ok('série: real acumulado só até hoje', r.serie.slice(0, 3).map(p => p.real), [600, 1180, null]);
  ok('série: planejado acumulado', r.serie.slice(0, 2).map(p => p.planejado), [500, 1000]);

  // Bate com resumoViagem: o que sobra no ritmo é o mesmo destino da 0002
  const resumo = resumoViagem(trip, entries, '2026-12-12');
  ok('ritmo usa o limite da 0002', r.limiteDia, resumo.limitePlanejado);

  const folga = ritmo(trip, [gasto('2026-12-11', 410)], activities, stops, '2026-12-11');
  ok('abaixo do planejado', folga.dinheiro, { estado: 'abaixo', diferenca: 90 });

  const justo = ritmo(trip, [gasto('2026-12-11', 540)], activities, stops, '2026-12-11');
  ok('dentro de 10% é no ritmo', justo.dinheiro.estado, 'no-ritmo');

  // Reembolso abate
  const reembolso = ritmo(trip, [gasto('2026-12-11', 600), gasto('2026-12-11', 100, 'INCOME')], activities, stops, '2026-12-11');
  ok('reembolso abate no ritmo', reembolso.dinheiro.estado, 'no-ritmo');

  const depois = ritmo(trip, [gasto('2026-12-19', 999)], activities, stops, '2026-12-25');
  ok('depois da volta não entra no destino', depois.serie[7].real, 0);

  const feitas = activities.map((a, i) => (i < 3 ? { ...a, status: 'FEITA' } : i === 3 ? { ...a, status: 'PULADA' } : a));
  const rr = ritmo(trip, [], feitas, stops, '2026-12-12');
  ok('atividades: feitas, até hoje, total', rr.atividades, { feitas: 3, ateHoje: 4, total: activities.length - 1 });
  ok('km rodados até hoje', rr.km, { rodados: 330, total: 1075 });
}

// --- datas da viagem encolhendo ---
ok('nada fora', foraDasDatas(stops, activities, '2026-12-11', '2026-12-18'), { paradas: 0, atividades: 0 });
ok('encolher a volta deixa itens fora', foraDasDatas(stops, activities, '2026-12-11', '2026-12-17'), { paradas: 1, atividades: 1 });

// --- mapa ---
{
  const proj = enquadrar(stops, 400, 300, 24);
  const pts = stops.map(s => proj(s.lat, s.lng));
  const dentro = pts.every(p => p.x >= 24 - 1e-9 && p.x <= 376 + 1e-9 && p.y >= 24 - 1e-9 && p.y <= 276 + 1e-9);
  ok('paradas dentro do viewBox', dentro, true);
  ok('norte fica em cima', proj(-27, -50).y < proj(-29, -50).y, true);
  ok('uma parada só: centro', enquadrar([{ lat: -29, lng: -50 }], 400, 300, 24)(-29, -50), { x: 200, y: 150 });
  ok('sem paradas: centro', enquadrar([], 400, 300)(-29, -50), { x: 200, y: 150 });
  ok('um path por trecho', trechosSuaves(pts).length, 4);
  ok('path começa na parada', trechosSuaves([{ x: 0, y: 0 }, { x: 10, y: 0 }])[0].startsWith('M0 0 C'), true);
}

// --- validação ---
{
  const p = { city: 'Gramado', uf: 'rs', lat: '-29.38', lng: '-50.87', date: '2026-12-13', legKm: '110', legMinutes: '120' };
  ok('parada válida', validarParada(p, trip).error, undefined);
  ok('uf em maiúscula', validarParada(p, trip).data.uf, 'RS');
  ok('parada fora da viagem', validarParada({ ...p, date: '2026-12-19' }, trip).error, 'A data precisa estar dentro da viagem');
  ok('sem coordenada', validarParada({ ...p, lat: '' }, trip).error, 'Escolha a cidade na lista ou cole as coordenadas');
  ok('latitude impossível', validarParada({ ...p, lat: '-129' }, trip).error, 'Escolha a cidade na lista ou cole as coordenadas');
  ok('km negativo', validarParada({ ...p, legKm: '-1' }, trip).error, 'Distância inválida');
  ok('trecho vazio vira nulo', validarParada({ ...p, legKm: '', legMinutes: '' }, trip).data.legKm, null);
  ok('link javascript recusado', validarParada({ ...p, lodgingUrl: 'javascript:alert(1)' }, trip).error,
    'Link precisa começar com http:// ou https://');

  const a = { title: 'Fondue', date: '2026-12-14', period: 'NOITE', category: 'Alimentação', estimatedCost: '349.99', pet: 'VERIFICAR' };
  ok('atividade válida', validarAtividade(a, trip).error, undefined);
  ok('custo em centavos', validarAtividade(a, trip).data.estimatedCost, 349.99);
  ok('hora define o período', validarAtividade({ ...a, time: '09:30', period: 'NOITE' }, trip).data.period, 'MANHA');
  ok('hora inválida', validarAtividade({ ...a, time: '25:00' }, trip).error, 'Hora inválida');
  ok('pet fora da lista', validarAtividade({ ...a, pet: 'TALVEZ' }, trip).error, 'Informe se aceita pet');
  ok('status fora da lista', validarAtividade({ ...a, status: 'ADIADA' }, trip).error, 'Status inválido');
  ok('categoria fora da lista', validarAtividade({ ...a, category: 'Vinho' }, trip).error, 'Escolha uma categoria');
  ok('status padrão', validarAtividade(a, trip).data.status, 'PLANEJADA');

  ok('importação vazia', validarRoteiroImportado({}, trip).error, 'O roteiro está vazio');
  ok('importação aponta o item com erro',
    validarRoteiroImportado({ stops: [{ city: 'Gramado', lat: 1, lng: 1, date: '2027-01-01' }] }, trip).error,
    'Parada 1 (Gramado): A data precisa estar dentro da viagem');
}

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
