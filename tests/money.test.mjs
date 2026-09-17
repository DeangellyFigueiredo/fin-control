/**
 * Máscara de dinheiro.
 *
 * O pedido que originou isto: "ao colocar mil reais faça ficar 1.000,00".
 */
import { mascarar, aoSair, paraNumero, valorBruto, formatarValor } from '../src/lib/money.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- o caso do pedido ---
ok('mil reais enquanto digita', mascarar('1000'), '1.000');
ok('e ao sair do campo', aoSair('1000'), '1.000,00');

// --- digitando dígito a dígito, o milhar aparece na hora certa ---
ok('1', mascarar('1'), '1');
ok('10', mascarar('10'), '10');
ok('100', mascarar('100'), '100');
ok('1000', mascarar('1000'), '1.000');
ok('10000', mascarar('10000'), '10.000');
ok('100000', mascarar('100000'), '100.000');
ok('1000000', mascarar('1000000'), '1.000.000');

// --- centavos ---
ok('virgula sozinha fica visivel', mascarar('1000,'), '1.000,');
ok('uma casa', mascarar('1000,5'), '1.000,5');
ok('duas casas', mascarar('1000,50'), '1.000,50');
ok('a terceira e descartada', mascarar('1000,567'), '1.000,56');
ok('so a primeira virgula vale', mascarar('10,00,99'), '10,0099'.slice(0, 5));
ok('meia virgula completa ao sair', aoSair('1000,5'), '1.000,50');

// --- o que a pessoa digita errado ---
ok('letras somem', mascarar('1a0b0c0'), '1.000');
ok('R$ some', mascarar('R$ 1000'), '1.000');
ok('vazio continua vazio', mascarar(''), '');
ok('so letras da vazio', mascarar('abc'), '');
ok('zeros a esquerda somem', mascarar('007'), '7');
ok('zero sozinho sobrevive', mascarar('0'), '0');
ok('nulo nao quebra', mascarar(null), '');

// --- colar do banco ---
// "1234.56" em en-US precisa virar 1.234,56, e nao 123.456
ok('colado en-US vira decimal', mascarar('1234.56'), '1.234,56');
ok('colado en-US com uma casa', mascarar('1234.5'), '1.234,5');
ok('colado pt-BR se mantem', mascarar('1.234,56'), '1.234,56');
// tres casas depois do ponto e milhar, nao decimal
ok('milhar colado continua milhar', mascarar('1.234'), '1.234');

// --- o numero que vai para o servidor ---
ok('mascarado vira numero', paraNumero('1.000,00'), 1000);
ok('meio digitado tambem', paraNumero('1.000,5'), 1000.5);
ok('sem centavos', paraNumero('1.000'), 1000);
// O texto do campo sempre passou pela mascara, que ja converteu en-US para
// pt-BR. Entao aqui ponto e SEMPRE milhar — ao contrario do parser do
// importador de extrato, onde "1.000" vale um.
ok('ponto e milhar, nunca decimal', paraNumero('1.234'), 1234);
ok('numero cru passa direto', paraNumero(1234.56), 1234.56);
ok('en-US chega ja convertido pela mascara', paraNumero(mascarar('1234.56')), 1234.56);
ok('vazio e nulo, nao zero', paraNumero(''), null);
ok('nulo e nulo', paraNumero(null), null);
ok('lixo nao vira numero', paraNumero('abc'), null);

// --- exibicao a partir de numero ---
ok('numero formata', formatarValor(1000), '1.000,00');
ok('centavos preservados', formatarValor(1234.5), '1.234,50');
ok('arredonda a terceira casa', formatarValor(1234.567), '1.234,57');
ok('zero mostra zero', formatarValor(0), '0,00');
ok('nao numero da vazio', formatarValor('abc'), '');

// --- ida e volta: o que sai do campo volta igual ---
for (const valor of [0, 1, 99.99, 1000, 1234.56, 30412.5, 1000000]) {
  const texto = formatarValor(valor);
  ok(`ida e volta ${valor}`, paraNumero(texto), valor);
}

// campo vazio nao vira "0,00": um formulario em branco tem que parecer em branco
ok('vazio ao sair continua vazio', aoSair(''), '');

// --- valor de MAQUINA: o que o formulario guarda, com ponto decimal ---
//
// O bug que isto guarda: o simulador passava String(36590.86) para o campo, e
// o parser de exibicao lia aquele ponto como milhar. R$ 36.590,86 aparecia
// como R$ 3.659.086,00 — cem vezes o valor, num campo de dinheiro.
//
// Os dois parsers leem o ponto ao contrario de proposito. A regra e a ORIGEM
// do texto: digitado pela pessoa usa paraNumero; vindo do estado ou do banco
// usa valorBruto.
ok('o caso relatado', valorBruto('36590.86'), 36590.86);
ok('e como ele aparece', formatarValor(valorBruto('36590.86')), '36.590,86');
ok('numero cru tambem', valorBruto(36590.86), 36590.86);
ok('inteiro em string', valorBruto('1000'), 1000);
ok('uma casa decimal', valorBruto('1000.5'), 1000.5);
ok('zero e zero, nao vazio', valorBruto('0'), 0);
ok('vazio e nulo', valorBruto(''), null);
ok('nulo e nulo', valorBruto(null), null);
ok('lixo e nulo', valorBruto('abc'), null);

// com virgula e texto de exibicao, e ai o ponto volta a ser milhar
ok('texto de exibicao ainda funciona', valorBruto('1.000,00'), 1000);
ok('exibicao com milhao', valorBruto('1.234.567,89'), 1234567.89);

// os dois parsers discordam de proposito sobre a mesma string
ok('paraNumero le ponto como milhar', paraNumero('36590.86'), 3659086);
ok('valorBruto le ponto como decimal', valorBruto('36590.86'), 36590.86);

// --- o ciclo completo: digitar, guardar, reabrir ---
// E aqui que o bug morava: o valor voltava do estado multiplicado por cem.
for (const digitado of ['36590,86', '1000', '1.234,56', '0,99']) {
  const naTela = mascarar(digitado);
  const guardado = String(paraNumero(naTela));      // o que vai para o estado
  const aoReabrir = formatarValor(valorBruto(guardado)); // o que o campo mostra depois
  ok(`ciclo ${digitado}`, aoReabrir, aoSair(digitado));
}

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
