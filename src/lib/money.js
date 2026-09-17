/**
 * Máscara de dinheiro para os campos de valor.
 *
 * `<input type="number">` não aceita "1.000,00": o navegador só deixa passar
 * o que ele entende como número, então quem digita mil reais fica olhando
 * para "1000" e conferindo os zeros no dedo. Num app onde quase todo campo é
 * dinheiro, isso é a diferença entre digitar com confiança e digitar torcendo.
 *
 * A regra é a que a pessoa espera: os milhares aparecem enquanto se digita,
 * e os centavos são completados ao sair do campo. Digitar "1000" mostra
 * "1.000" e vira "1.000,00"; digitar "1000,5" vira "1.000,50".
 */

/**
 * Número a partir do que está escrito no campo.
 *
 * Não dá para reaproveitar o `parseAmount` do importador de extrato, apesar da
 * semelhança: lá "1.000" é **um**, porque um arquivo en-US usa ponto decimal.
 * Aqui "1.000" é **mil**, porque foi a própria máscara que pôs aquele ponto.
 * A mesma sequência de caracteres quer dizer coisas diferentes nos dois
 * lugares, e juntar os dois parsers faria um deles mentir.
 *
 * Aqui o texto sempre passou por `mascarar`, que já converteu um valor colado
 * em en-US para a forma brasileira. Então a regra é única: ponto é milhar,
 * vírgula é decimal.
 */
export function paraNumero(texto) {
  if (texto === null || texto === undefined || texto === '') return null;

  // Número já pronto (valor vindo do banco de dados) não precisa de conversão
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;

  const limpo = String(texto).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!/\d/.test(limpo)) return null;

  const valor = parseFloat(limpo);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Número a partir do valor de MÁQUINA — o que o formulário guarda e manda
 * para o servidor: um número, ou a string dele com ponto decimal ("36590.86").
 *
 * Existe separado do `paraNumero` porque os dois leem o ponto ao contrário, e
 * misturá-los já custou caro: passar `String(36590.86)` pelo parser de
 * exibição, onde ponto é milhar, transformava R$ 36.590,86 em R$ 3.659.086,00
 * na tela. Cem vezes o valor, num campo de dinheiro.
 *
 * A regra de qual usar é a origem do texto, não o formato dele:
 *
 *   - veio do que a pessoa digitou  → `paraNumero`  (ponto é milhar)
 *   - veio do estado ou do banco    → `valorBruto`  (ponto é decimal)
 */
export function valorBruto(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

  const texto = String(valor).trim();

  // Com vírgula é texto de exibição, não valor de máquina: lá o ponto é milhar
  if (texto.includes(',')) return paraNumero(texto);

  const numero = parseFloat(texto.replace(/[^\d.-]/g, ''));
  return Number.isFinite(numero) ? numero : null;
}

/** "1.000,00" a partir de um número. */
export function formatarValor(numero) {
  const v = Number(numero);
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Separador de milhar na parte inteira: "1000" → "1.000". */
function pontuarMilhares(inteiro) {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * O que mostrar enquanto a pessoa digita.
 *
 * Aqui os centavos NÃO são completados: quem está no meio de digitar "1.000"
 * não quer ver ",00" aparecer e o cursor pular. Isso fica para o `aoSair`.
 */
export function mascarar(texto) {
  const bruto = String(texto ?? '');

  // Só dígitos e a primeira vírgula. O ponto que a pessoa digita é ignorado
  // porque os pontos aqui são nossos, de milhar — exceto quando ele é
  // claramente o separador decimal de um valor colado (ver `normalizarColado`).
  const limpo = normalizarColado(bruto).replace(/[^\d,]/g, '');

  const [inteiroBruto, ...resto] = limpo.split(',');
  const temVirgula = resto.length > 0;
  const decimais = resto.join('').slice(0, 2);

  // Zeros à esquerda sobram: "007" é 7. Mas um zero sozinho é um zero.
  const inteiro = inteiroBruto.replace(/^0+(?=\d)/, '');

  if (!inteiro && !temVirgula) return '';

  const cabeca = pontuarMilhares(inteiro || '0');
  return temVirgula ? `${cabeca},${decimais}` : cabeca;
}

/**
 * Valor colado do banco no formato en-US ("1234.56") vira pt-BR antes de
 * entrar na máscara. Sem isto, colar "1234.56" daria "123.456".
 *
 * O sinal é um ponto sozinho seguido de uma ou duas casas — o que nenhum
 * separador de milhar brasileiro produz, já que milhar sempre agrupa três.
 */
function normalizarColado(texto) {
  if (texto.includes(',')) return texto;
  return /^\d+\.\d{1,2}$/.test(texto.trim()) ? texto.trim().replace('.', ',') : texto;
}

/**
 * O que mostrar quando a pessoa sai do campo: valor completo, com centavos.
 * Campo vazio continua vazio — preencher com "0,00" faria o formulário
 * parecer respondido quando não foi.
 */
export function aoSair(texto) {
  const numero = paraNumero(texto);
  return numero === null ? '' : formatarValor(numero);
}
