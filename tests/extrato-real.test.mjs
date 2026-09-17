/**
 * Um extrato de banco de verdade, contra o qual o parser falhava inteiro.
 *
 * O arquivo é o exportado pelo Inter, com os nomes de pessoas trocados. O que
 * importa aqui é a FORMA: quatro linhas de preâmbulo antes do cabeçalho, ponto
 * e vírgula como separador, duas colunas de texto e — a mais traiçoeira —
 * duas colunas que parecem dinheiro: "Valor" e "Saldo".
 *
 * A conferência final não olha para o que o parser devolveu, e sim para o que
 * o próprio extrato afirma: a soma dos valores lidos tem que fechar com a
 * variação da coluna de saldo. Um parser que escolhesse a coluna errada, ou
 * perdesse linhas, não teria como fechar essa conta por acaso.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV, parseAmount } from '../src/lib/import.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const aqui = path.dirname(fileURLToPath(import.meta.url));
const texto = fs.readFileSync(path.join(aqui, 'amostras', 'extrato-inter.csv'), 'utf8');

const { rows, colunas, erro } = parseCSV(texto);

ok('leu sem erro', erro, undefined);
ok('achou o ponto e virgula', colunas.separador, ';');
ok('pulou as quatro linhas de preambulo', colunas.preambulo, 4);
ok('reconheceu o cabecalho', colunas.cabecalho, true);
ok('a data e a primeira coluna', colunas.data, 0);
// A quarta coluna é "Valor"; a quinta é "Saldo", o acumulado
ok('pegou Valor, e nao Saldo', colunas.valor, 3);
ok('juntou as duas colunas de texto', colunas.descricao, [1, 2]);

const dados = texto.split(/\r?\n/).filter(Boolean).slice(5).map(l => l.split(';'));
ok('leu todas as linhas', rows.length, dados.length);

// --- a conferência independente ---
const saldoAntesDoPrimeiro = parseAmount(dados[dados.length - 1][4]) - parseAmount(dados[dados.length - 1][3]);
const saldoFinal = parseAmount(dados[0][4]);
const variacao = Math.round((saldoFinal - saldoAntesDoPrimeiro) * 100) / 100;
const soma = Math.round(rows.reduce((s, r) => s + (r.type === 'INCOME' ? r.amount : -r.amount), 0) * 100) / 100;

ok('a soma dos valores fecha com o saldo do extrato', soma, variacao);

// --- o sinal virou tipo corretamente ---
ok('saida tem sinal negativo no arquivo', rows[0].type, 'EXPENSE');
ok('e o valor entra positivo', rows[0].amount, 15);
const entrada = rows.find(r => r.type === 'INCOME');
ok('entrada existe', Boolean(entrada), true);
ok('entradas e saidas somam o total', rows.filter(r => r.type === 'INCOME').length + rows.filter(r => r.type === 'EXPENSE').length, rows.length);

// --- a descrição carrega o tipo E a contraparte ---
ok('descricao junta as duas colunas', rows[0].description, 'Pix enviado · Pessoa 1');
ok('sem sobra de ponto e virgula', rows.every(r => !r.description.includes(';')), true);
ok('nenhuma descricao vazia', rows.every(r => r.description.length > 0), true);

// --- nada de lixo: toda data e todo valor são válidos ---
ok('toda data no formato certo', rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date)), true);
ok('todo valor positivo', rows.every(r => r.amount > 0), true);
ok('datas dentro do periodo do extrato', rows.every(r => r.date >= '2026-08-19' && r.date <= '2026-09-17'), true);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
