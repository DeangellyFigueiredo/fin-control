/**
 * Preview da importação. O caso real: um JSON gerado por outra IA, que a
 * tela antiga recusava um erro por vez. Ver docs/rfc/0004-roteiro-inteligente.md.
 */
import { readFileSync } from 'fs';
import { analisarRoteiro, aplicarCorrecoes, corrigiveis } from '../src/lib/importacao.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const trip = { startDate: d('2026-12-11'), endDate: d('2026-12-18') };
const amostra = (nome) => readFileSync(new URL(`./amostras/${nome}`, import.meta.url), 'utf8');

// --- o JSON que deu erro: tudo de uma vez ---
{
  const texto = amostra('roteiro-com-erros.json');
  const a = analisarRoteiro(texto, trip);
  const porCampo = (campo) => a.erros.filter(e => e.campo === campo);

  ok('não importa com erro', a.data, null);
  ok('10 categorias inventadas', porCampo('category').length, 10);
  ok('Natureza vira Passeios', porCampo('category').find(e => e.alvo.includes('Fortaleza')).correcao, { tipo: 'trocar', para: 'Passeios' });
  ok('Gastronomia vira Alimentação', porCampo('category').find(e => e.alvo.includes('Fondue')).correcao, { tipo: 'trocar', para: 'Alimentação' });
  ok('Deslocamento vira Transporte', porCampo('category').find(e => e.alvo.includes('Retorno')).correcao, { tipo: 'trocar', para: 'Transporte' });
  ok('hour vira time', porCampo('hour')[0].correcao, { tipo: 'renomear', para: 'time' });
  ok('DIA vira MANHA', porCampo('period')[0].correcao, { tipo: 'trocar', para: 'MANHA' });
  ok('dia 19 sai da viagem', porCampo('date').map(e => [e.alvo, e.correcao]),
    [['Atividade 23 (Dia livre em Itapema)', { tipo: 'remover' }]]);
  ok('mensagem diz o período', porCampo('date')[0].mensagem, '19/12 está fora da viagem (11/12 a 18/12)');
  ok('todos corrigíveis', corrigiveis(a), a.erros.length);
  ok('aviso: falta a saída', a.avisos.some(v => v.mensagem.startsWith('A primeira parada é o ponto de saída')), true);

  // Aplicar as correções resolve tudo, e o show fica à noite pela hora
  const novo = aplicarCorrecoes(a.json, a);
  const b = analisarRoteiro(novo, trip);
  ok('corrigido: sem erros', b.erros, []);
  ok('corrigido: 22 atividades', b.data.activities.length, 22);
  const show = b.data.activities.find(x => x.title.startsWith('Show'));
  ok('corrigido: show às 20h, à noite', [show.time, show.period, show.category], ['20:00', 'NOITE', 'Passeios']);
  ok('não mexe no original', JSON.parse(texto).activities.length, 23);
}

// --- o JSON correto passa, com o aviso da ordem ---
{
  const a = analisarRoteiro(amostra('roteiro-serra-gaucha.json'), trip);
  ok('fixture correta passa', [a.erros.length, a.data.stops.length, a.data.activities.length], [0, 5, 25]);
  ok('fixture com order não avisa', a.avisos, []);

  const semOrdem = JSON.parse(amostra('roteiro-serra-gaucha.json'));
  delete semOrdem.stops[1].order;
  const b = analisarRoteiro(semOrdem, trip);
  ok('mesmo dia sem order: aviso, não erro', [b.erros.length, b.avisos.map(v => v.alvo)],
    [0, ['Parada 1 (Itapema) e Parada 2 (Cambará do Sul)']]);
}

// --- erros sem correção automática ---
{
  const a = analisarRoteiro({
    stops: [{ city: 'Lugar Nenhum', date: '2026-12-11' }],
    activities: [
      { title: '', date: '2026-12-12', category: 'Xablau', period: 'MADRUGADA', pet: 'TALVEZ', link: 'javascript:alert(1)' },
      { title: 'Ok', date: '2026-12-12', category: 'Passeios', time: '25:00' },
    ],
  }, trip);
  ok('parada sem coordenada', a.erros.filter(e => e.tipo === 'stop').map(e => e.campo), ['lat']);
  const primeira = a.erros.filter(e => e.indice === 0 && e.tipo === 'activity');
  ok('todos os problemas da atividade', primeira.map(e => e.campo).sort(), ['category', 'link', 'period', 'pet', 'title']);
  ok('categoria desconhecida lista as opções', primeira.find(e => e.campo === 'category').mensagem,
    'A categoria "Xablau" não existe. Use uma de: Transporte, Hospedagem, Alimentação, Passeios, Compras, Outros');
  ok('TALVEZ vira VERIFICAR', primeira.find(e => e.campo === 'pet').correcao, { tipo: 'trocar', para: 'VERIFICAR' });
  ok('hora inválida, sem erro repetido de período', a.erros.filter(e => e.indice === 1).map(e => e.campo), ['time']);
}

// --- campos traduzidos e desconhecidos ---
{
  const a = analisarRoteiro({
    stops: [{ cidade: 'Gramado', uf: 'RS', latitude: -29.37, longitude: -50.87, data: '2026-12-11', foo: 1 }],
    activities: [],
  }, trip);
  ok('campos em português viram renomeação', a.erros.map(e => [e.campo, e.correcao.para]).sort(),
    [['cidade', 'city'], ['data', 'date'], ['latitude', 'lat'], ['longitude', 'lng']]);
  ok('campo desconhecido é só aviso', a.avisos.map(v => v.mensagem), ['O campo "foo" não é usado e será ignorado']);
  ok('renomeado passa', analisarRoteiro(aplicarCorrecoes(a.json, a), trip).erros, []);
}

// --- texto que nem é JSON ---
{
  ok('vazio', analisarRoteiro('   ', trip).erros[0].mensagem, 'Cole o roteiro em JSON');
  ok('JSON quebrado', analisarRoteiro('{ "stops": [ }', trip).erros[0].mensagem.startsWith('Não é um JSON válido'), true);
  ok('lista no lugar de objeto', analisarRoteiro('[]', trip).erros[0].mensagem,
    'O roteiro precisa ser um objeto com "stops" e "activities"');
  ok('objeto vazio', analisarRoteiro('{}', trip).erros[0].mensagem, 'O roteiro está vazio');
}

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
