/**
 * Operações da IA sobre o roteiro (RFC 0004): o preview e a gravação saem da
 * mesma função, e um erro em qualquer operação impede a proposta inteira.
 */
import { aplicarOperacoes, versaoDoRoteiro, roteiroParaIA, SCHEMA_PROPOSTA } from '../src/lib/operacoes.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const trip = { startDate: d('2026-12-11'), endDate: d('2026-12-18') };
const atual = {
  stops: [
    { id: 's1', city: 'Itapema', uf: 'SC', lat: -27.09, lng: -48.61, date: d('2026-12-11'), order: 0, updatedAt: d('2026-10-01') },
    { id: 's2', city: 'Gramado', uf: 'RS', lat: -29.38, lng: -50.87, date: d('2026-12-13'), order: 0, legKm: 110, updatedAt: d('2026-10-01') },
  ],
  activities: [
    { id: 'a1', title: 'Lago Negro', date: d('2026-12-14'), period: 'MANHA', order: 0, category: 'Passeios', pet: 'SIM', status: 'PLANEJADA', updatedAt: d('2026-10-01') },
    { id: 'a2', title: 'Fondue', date: d('2026-12-14'), period: 'NOITE', order: 1, category: 'Alimentação', pet: 'VERIFICAR', status: 'PLANEJADA', estimatedCost: 300, updatedAt: d('2026-10-01') },
  ],
};
const nada = { parada: null, atividade: null, alvoId: null };

{
  const r = aplicarOperacoes(atual, [
    { ...nada, tipo: 'addStop', parada: { city: 'Canela', uf: 'RS', date: '2026-12-15', lat: -29.36, lng: -50.81, order: null, lodgingName: null, notes: null, legNotes: null, arriveBy: null } },
    { ...nada, tipo: 'addActivity', atividade: { title: 'Catedral de Pedra', date: '2026-12-14', period: 'TARDE', category: 'Passeios', pet: 'SIM' } },
    { ...nada, tipo: 'updateActivity', alvoId: 'a2', atividade: { estimatedCost: 350, title: null } },
    { ...nada, tipo: 'moveActivity', alvoId: 'a1', atividade: { date: '2026-12-15', period: 'MANHA', title: 'ignorado no mover' } },
    { ...nada, tipo: 'removeStop', alvoId: 's2' },
  ], trip);
  ok('sem erros', r.erros, []);
  ok('diff na ordem', r.diff.map(x => [x.acao, x.tipo, x.titulo]), [
    ['adicionar', 'parada', 'Canela'], ['adicionar', 'atividade', 'Catedral de Pedra'],
    ['alterar', 'atividade', 'Fondue'], ['mover', 'atividade', 'Lago Negro'], ['remover', 'parada', 'Gramado'],
  ]);
  ok('alterar mostra antes e depois', r.diff[2].mudancas, [{ campo: 'custo estimado', antes: 300, depois: 350 }]);
  ok('mover só mexe em data e período', r.diff[3].mudancas, [{ campo: 'data', antes: '2026-12-14', depois: '2026-12-15' }]);
  ok('atividade nova entra no fim do dia', r.gravar.criarAtividades[0].order, 2);
  ok('o que gravar', [r.gravar.criarParadas.length, r.gravar.criarAtividades.length, r.gravar.atualizarAtividades.map(x => x.id), r.gravar.apagarParadas],
    [1, 1, ['a2', 'a1'], ['s2']]);
  ok('null não apaga o campo', r.gravar.atualizarAtividades[0].data.title, 'Fondue');
}

{
  const r = aplicarOperacoes(atual, [
    { ...nada, tipo: 'addActivity', atividade: { title: 'Ok', date: '2026-12-14', category: 'Passeios' } },
    { ...nada, tipo: 'addActivity', atividade: { title: 'Fora', date: '2026-12-25', category: 'Passeios' } },
    { ...nada, tipo: 'removeActivity', alvoId: 'id-de-outra-viagem' },
    { ...nada, tipo: 'addStop', parada: { city: 'Lugar Nenhum', uf: 'RS', date: '2026-12-15' } },
    { ...nada, tipo: 'apagarTudo' },
  ], trip);
  ok('todos os erros, cada um com o motivo', r.erros.map(e => [e.indice, e.mensagem]), [
    [1, 'Fora: A data precisa estar dentro da viagem'],
    [2, 'Atividade não encontrada neste roteiro'],
    [3, 'Cidade não encontrada: Lugar Nenhum/RS'],
    [4, 'Operação desconhecida'],
  ]);
}

{
  const r = aplicarOperacoes(atual, [
    { ...nada, tipo: 'updateStop', alvoId: 's2', parada: { city: 'Canela' } },
  ], trip);
  ok('trocar a cidade exige coordenada', r.erros[0].mensagem, 'Cidade não encontrada: Canela');
  ok('mudança vazia não entra no diff', aplicarOperacoes(atual, [{ ...nada, tipo: 'updateActivity', alvoId: 'a1', atividade: { title: 'Lago Negro' } }], trip).diff, []);
  ok('remover e depois alterar o mesmo: erro', aplicarOperacoes(atual, [
    { ...nada, tipo: 'removeActivity', alvoId: 'a1' }, { ...nada, tipo: 'updateActivity', alvoId: 'a1', atividade: { title: 'x' } },
  ], trip).erros.length, 1);
}

// --- versão do roteiro ---
{
  const v1 = versaoDoRoteiro(atual.stops, atual.activities);
  ok('mesma entrada, mesma versão', versaoDoRoteiro([...atual.stops].reverse(), atual.activities), v1);
  const editado = atual.activities.map(a => (a.id === 'a1' ? { ...a, updatedAt: d('2026-10-02') } : a));
  ok('editar muda a versão', versaoDoRoteiro(atual.stops, editado) !== v1, true);
  ok('apagar muda a versão', versaoDoRoteiro(atual.stops, atual.activities.slice(1)) !== v1, true);
}

ok('roteiro para a IA: compacto, com ids', roteiroParaIA(atual.stops, []).paradas[1],
  { id: 's2', city: 'Gramado', uf: 'RS', date: '2026-12-13', order: 0, lodgingName: null, arriveBy: null });
ok('schema strict: todo objeto fecha', JSON.stringify(SCHEMA_PROPOSTA).match(/"additionalProperties":false/g).length, 4);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
