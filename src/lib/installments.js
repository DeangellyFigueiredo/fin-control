/**
 * Parcelas de uma compra dividida: "Viagem 1/10", "Playstation 2/5".
 *
 * Nada é gravado como transação futura — a parcela é calculada na hora, do
 * mesmo jeito que uma recorrente. Mudar a compra não obriga a apagar dez
 * linhas, e o passado continua sendo só o que realmente aconteceu.
 */

import { clampDay, shiftMonth, utcParts, monthKey } from './calendar.js';

/** Quantos meses separam dois pares ano/mês. Negativo quando o fim vem antes. */
export function monthsBetween(fromYear, fromMonth, toYear, toMonth) {
  return (toYear * 12 + toMonth) - (fromYear * 12 + fromMonth);
}

/**
 * Valor de cada parcela, com o resto dos centavos na última.
 *
 * R$ 1.000 em 3x não divide: 333,33 três vezes some com um centavo. Aqui as
 * duas primeiras ficam em 333,33 e a última em 333,34, e a soma fecha exata.
 */
export function installmentAmount(total, count, index) {
  if (!(count > 0)) return 0;
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const rest = cents - base * count;
  // `index` é 1-based; só a última carrega o resto.
  return (index >= count ? base + rest : base) / 100;
}

/**
 * Em que parcela a compra está num determinado mês — ou null se ainda não
 * começou, já terminou, ou está desativada.
 *
 * Devolve { index, count, amount, day, isLast }.
 */
export function installmentFor(purchase, year, month) {
  if (!purchase.active) return null;

  const first = utcParts(purchase.firstDate);
  const index = monthsBetween(first.year, first.month, year, month) + 1;
  if (index < 1 || index > purchase.count) return null;

  return {
    index,
    count: purchase.count,
    amount: installmentAmount(purchase.totalAmount, purchase.count, index),
    day: clampDay(first.day, year, month),
    isLast: index === purchase.count,
  };
}

/** Mês e ano em que a última parcela cai. */
export function lastInstallmentMonth(purchase) {
  const first = utcParts(purchase.firstDate);
  return shiftMonth(first.year, first.month, purchase.count - 1);
}

/**
 * Quanto ainda falta pagar a partir de um mês, inclusive ele.
 * É o número que responde "quando eu me desamarro".
 */
export function remainingAmount(purchase, year, month) {
  const first = utcParts(purchase.firstDate);

  // Somar reais acumula erro de ponto flutuante — dez parcelas de 176,40
  // devolviam 1764,0000000000005. Em centavos, inteiros, a conta fecha.
  let cents = 0;
  for (let i = 1; i <= purchase.count; i++) {
    const when = shiftMonth(first.year, first.month, i - 1);
    if (monthsBetween(year, month, when.year, when.month) >= 0) {
      cents += Math.round(installmentAmount(purchase.totalAmount, purchase.count, i) * 100);
    }
  }
  return cents / 100;
}

/**
 * Parcelas de um mês, já separadas pelo que importa para o fluxo de caixa.
 *
 * No cartão a parcela não é saída própria: ela já está dentro da fatura, e
 * somá-la de novo contaria o mesmo dinheiro duas vezes. Fora do cartão
 * (carnê, boleto, débito automático) é saída no dia dela.
 */
export function splitByPayment(purchases, year, month) {
  const noCartao = [];
  const emDinheiro = [];

  for (const purchase of purchases) {
    const parcela = installmentFor(purchase, year, month);
    if (!parcela) continue;

    const item = { purchase, ...parcela };
    if (purchase.creditCardId) noCartao.push(item);
    else emDinheiro.push(item);
  }

  return { noCartao, emDinheiro };
}

/** Rótulo curto: "3/10". */
export function installmentLabel(parcela) {
  return `${parcela.index}/${parcela.count}`;
}

/**
 * Data da primeira parcela a partir de "a próxima é a 3ª, e cai em 15/10".
 * É assim que se cadastra uma compra que já está correndo.
 */
export function firstDateFromNext(nextIndex, nextYear, nextMonth, day) {
  const { year, month } = shiftMonth(nextYear, nextMonth, -(nextIndex - 1));
  return `${monthKey(year, month)}-${String(clampDay(day, year, month)).padStart(2, '0')}`;
}
