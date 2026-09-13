import { normalize, extractPattern, findCategory, indexByName }
  from '../src/lib/categorize.js';

let falhas = 0;
const ok = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { falhas++; console.log(`  FALHOU ${nome}: ${a} != ${b}`); }
  else console.log(`  ok ${nome}`);
};

ok('acento vira letra', normalize('Alimentação'), 'ALIMENTACAO');
ok('agua', normalize('Conta de Água'), 'CONTA DE AGUA');
ok('lixo da fatura', normalize('PAG*IFOOD  *4829'), 'PAG IFOOD 4829');
ok('vazio', normalize(null), '');

ok('pega a loja', extractPattern('PAG*IFOOD *4829'), 'IFOOD');
ok('ignora ruido', extractPattern('COMPRA CARTAO NETFLIX'), 'NETFLIX');
ok('so ruido nao aprende', extractPattern('PIX ENVIADO'), null);
ok('so numero nao aprende', extractPattern('123 456'), null);
ok('mais longa ganha', extractPattern('PAG STARBUCKS SP'), 'STARBUCKS');
// empate fica com o primeiro: em fatura o estabelecimento vem na frente
ok('empate fica com o primeiro', extractPattern('UBER TRIP HELP'), 'UBER');

const cats = [
  { id: 'c-transp', name: 'Transporte' },
  { id: 'c-alim', name: 'Alimentação' },
  { id: 'c-assin', name: 'Assinaturas' },
  { id: 'c-outras', name: 'Outras Saídas' },
];
const idx = indexByName(cats);

ok('uber pela lista', findCategory('UBER *TRIP SAO PAULO', [], idx)?.categoryId, 'c-transp');
ok('ifood pela lista', findCategory('PAG*IFOOD', [], idx)?.categoryId, 'c-alim');
ok('netflix', findCategory('NETFLIX.COM', [], idx)?.categoryId, 'c-assin');
ok('carrefour cai em alimentacao', findCategory('CARREFOUR HIPER', [], idx)?.categoryId, 'c-alim');
ok('amazon cai em outras saidas', findCategory('AMAZON BR', [], idx)?.categoryId, 'c-outras');
ok('desconhecido fica sem', findCategory('QUITANDA DO ZE', [], idx), null);
ok('descricao vazia', findCategory('', [], idx), null);

// a regra do usuario ganha da lista padrao
const minhas = [{ pattern: 'UBER', categoryId: 'c-alim', hits: 3 }];
ok('regra do usuario vence', findCategory('UBER TRIP', minhas, idx)?.categoryId, 'c-alim');
ok('origem marcada', findCategory('UBER TRIP', minhas, idx)?.origem, 'regra');

// especifica vence generica
const duas = [
  { pattern: 'MERCADO', categoryId: 'c-alim', hits: 10 },
  { pattern: 'MERCADOLIVRE', categoryId: 'c-outras', hits: 1 },
];
ok('padrao mais longo vence', findCategory('MERCADOLIVRE PAGAMENTO', duas, idx)?.categoryId, 'c-outras');
ok('generica ainda pega', findCategory('MERCADO DIA', duas, idx)?.categoryId, 'c-alim');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
