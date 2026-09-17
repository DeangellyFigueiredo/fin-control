/**
 * Projeção de investimento: juros compostos com aporte mensal.
 *
 * Projeção é onde app de finanças mais mente. A defesa aqui é não inventar
 * número nenhum: a taxa sai do histórico do próprio usuário quando existe
 * histórico, e quando não existe o campo fica vazio esperando que alguém
 * digite — em vez de nascer com um "10% ao ano" plausível e falso.
 *
 * E o resultado sempre separa o que foi aportado do que foi juro, porque
 * "R$ 1 milhão em 30 anos" some de significado se não disser que R$ 700 mil
 * saíram do seu bolso.
 */

import { efeitoDe } from './investments.js';

const arredonda = (v) => Math.round(v * 100) / 100;

/** Taxa mensal equivalente a uma anual, compondo. */
export function mensalDeAnual(anual) {
  const a = Number(anual);
  if (!Number.isFinite(a)) return null;
  return Math.pow(1 + a / 100, 1 / 12) - 1;
}

/** O caminho de volta, para exibir. */
export function anualDeMensal(mensal) {
  const m = Number(mensal);
  if (!Number.isFinite(m)) return null;
  return (Math.pow(1 + m, 12) - 1) * 100;
}

/**
 * Taxa que o dinheiro do usuário realmente rendeu, medida entre as anotações
 * de saldo.
 *
 * Para cada rendimento anotado: quanto ele representou sobre o saldo que
 * havia antes, convertido para 30 dias. Depois a MEDIANA das observações, não
 * a média — um mês atípico (um resgate mal lançado, um juro semestral caindo
 * de uma vez) puxaria a média e jogaria a projeção inteira para longe.
 *
 * Devolve null com menos de duas observações: uma só não é uma taxa, é um
 * ponto.
 */
export function taxaObservada(investments) {
  const lista = Array.isArray(investments) ? investments : [investments];
  const taxas = [];

  for (const inv of lista) {
    const entries = [...(inv?.entries || [])]
      .filter(e => e.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Saldo no começo do histórico, o mesmo caminho de serieDe
    let saldo = Number(inv?.currentValue) || 0;
    for (const e of entries) saldo -= efeitoDe(e).saldo;

    let ultimaData = null;

    for (const entry of entries) {
      if (entry.type !== 'RENDIMENTO') {
        saldo += efeitoDe(entry).saldo;
        continue;
      }

      const anterior = saldo;
      const dias = ultimaData
        ? Math.round((new Date(entry.date) - ultimaData) / 86400000)
        : null;

      saldo += efeitoDe(entry).saldo;
      ultimaData = new Date(entry.date);

      // Sem saldo anterior não há taxa, e sem intervalo não há a que
      // atribuir o rendimento.
      if (!(anterior > 0) || !dias || dias <= 0) continue;

      const noPeriodo = entry.amount / anterior;
      // Composto para 30 dias: um rendimento de 8 dias não vale por um mês
      taxas.push(Math.pow(1 + noPeriodo, 30 / dias) - 1);
    }
  }

  if (taxas.length < 2) return null;

  taxas.sort((a, b) => a - b);
  const meio = Math.floor(taxas.length / 2);
  const mensal = taxas.length % 2
    ? taxas[meio]
    : (taxas[meio - 1] + taxas[meio]) / 2;

  return { mensal, anual: anualDeMensal(mensal), amostras: taxas.length };
}

/**
 * Aporte médio por mês, medido no histórico.
 *
 * Divide o total aportado pelos meses decorridos desde o primeiro aporte —
 * incluindo os meses em que não houve nenhum, que é justamente o que faz a
 * média ser honesta para quem aporta de vez em quando.
 */
export function aporteMedioMensal(investments) {
  const lista = Array.isArray(investments) ? investments : [investments];
  const aportes = lista
    .flatMap(i => i?.entries || [])
    .filter(e => e.type === 'APORTE' && e.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!aportes.length) return null;

  const total = aportes.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const primeiro = new Date(aportes[0].date);
  const meses = Math.max(1, Math.round((Date.now() - primeiro.getTime()) / (30 * 86400000)));

  return arredonda(total / meses);
}

/**
 * A projeção, mês a mês.
 *
 * O aporte entra no fim de cada mês — a convenção conservadora, e a que bate
 * com quem investe depois de receber. Colocá-lo no começo renderia um mês a
 * mais em cada parcela e inflaria o resultado sem a pessoa perceber.
 *
 * @param {object} p
 * @param {number} p.inicial        saldo de hoje
 * @param {number} p.aporte         quanto entra por mês
 * @param {number} p.taxaMensal     em fração (0.01 = 1% ao mês)
 * @param {number} p.meses          horizonte
 * @param {number} [p.inflacaoAnual] em %, para mostrar o poder de compra de hoje
 */
export function simular({ inicial = 0, aporte = 0, taxaMensal = 0, meses = 0, inflacaoAnual = null }) {
  const n = Math.max(0, Math.floor(Number(meses) || 0));
  const i = Number(taxaMensal) || 0;
  const pmt = Number(aporte) || 0;

  const inflacaoMensal = inflacaoAnual === null || inflacaoAnual === undefined
    ? null
    : mensalDeAnual(inflacaoAnual);

  let saldo = Number(inicial) || 0;
  let aportado = Number(inicial) || 0;

  const pontos = [{
    mes: 0,
    saldo: arredonda(saldo),
    aportado: arredonda(aportado),
    juros: 0,
    saldoReal: arredonda(saldo),
  }];

  for (let mes = 1; mes <= n; mes++) {
    saldo = saldo * (1 + i) + pmt;
    aportado += pmt;

    // Poder de compra de hoje: o número de lá trazido para cá
    const real = inflacaoMensal === null
      ? saldo
      : saldo / Math.pow(1 + inflacaoMensal, mes);

    pontos.push({
      mes,
      saldo: arredonda(saldo),
      aportado: arredonda(aportado),
      juros: arredonda(saldo - aportado),
      saldoReal: arredonda(real),
    });
  }

  const fim = pontos[pontos.length - 1];

  return {
    pontos,
    final: fim.saldo,
    aportado: fim.aportado,
    juros: fim.juros,
    finalReal: fim.saldoReal,
    // Quanto do resultado é juro, e não dinheiro que saiu do bolso
    parteDeJuros: fim.saldo > 0 ? (fim.juros / fim.saldo) * 100 : 0,
  };
}

/**
 * Em quantos meses o saldo alcança um alvo, nas mesmas condições.
 * Null quando não alcança dentro do teto — dizer "nunca" seria forte demais
 * para uma extrapolação.
 */
export function mesesPara({ inicial = 0, aporte = 0, taxaMensal = 0, alvo, teto = 1200 }) {
  const meta = Number(alvo);
  if (!Number.isFinite(meta) || meta <= 0) return null;

  let saldo = Number(inicial) || 0;
  if (saldo >= meta) return 0;

  const i = Number(taxaMensal) || 0;
  const pmt = Number(aporte) || 0;

  // Sem aporte e sem juro, o saldo nunca muda: parar aqui evita o laço inteiro
  if (i <= 0 && pmt <= 0) return null;

  for (let mes = 1; mes <= teto; mes++) {
    saldo = saldo * (1 + i) + pmt;
    if (saldo >= meta) return mes;
  }

  return null;
}
