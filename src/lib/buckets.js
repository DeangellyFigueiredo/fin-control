/**
 * Os quatro baldes do mês.
 *
 * A ideia é separar o que você *escolhe* gastar do que já estava comprometido
 * antes do mês começar. Sabendo que as parcelas e os fixos já saíram sozinhos,
 * o número que resta — os variáveis — é o único sobre o qual dá para agir hoje.
 *
 * A fatura do cartão não é um balde: ela é um envelope. Dentro dela há
 * parcelas e há gasto variável, e é assim que ela entra na conta — decomposta,
 * nunca somada inteira ao lado das parcelas que ela mesma contém.
 */

import { recurringDayFor } from './calendar.js';
import { installmentFor } from './installments.js';
import { normalize } from './categorize.js';

export const BUCKETS = [
  { id: 'recebimentos', label: 'Recebimentos', direction: 'in' },
  { id: 'parcelamentos', label: 'Parcelamentos', direction: 'out' },
  { id: 'assinaturas', label: 'Fixos e assinaturas', direction: 'out' },
  { id: 'variaveis', label: 'Variáveis', direction: 'out' },
];

/**
 * Uma despesa lançada à mão que repete o nome e o valor de uma recorrente é
 * a própria recorrente acontecendo — contar as duas dobraria o aluguel.
 */
function pareceRecorrente(tx, recurring) {
  const desc = normalize(tx.description);
  if (!desc) return false;

  return recurring.some(r =>
    r.type === 'EXPENSE'
    && normalize(r.name) === desc
    && Math.abs(r.amount - tx.amount) < 0.01,
  );
}

/**
 * Monta os baldes de um mês.
 *
 * @param {object} entrada
 * @param {Array} entrada.transactions  transações já realizadas do mês
 * @param {Array} entrada.recurring     recorrentes ativas
 * @param {Array} entrada.installments  compras parceladas
 * @param {Array} entrada.cards         cartões ativos
 * @param {Map}   entrada.faturas       "cardId:ano:mes" → valor informado
 */
export function buildBuckets({ transactions, recurring, installments, cards, faturas }, year, month) {
  let recebimentos = 0;
  let parcelamentos = 0;
  let assinaturas = 0;
  let variaveis = 0;

  const detalhe = { recebimentos: [], parcelamentos: [], assinaturas: [], variaveis: [] };

  // --- Entradas: realizadas e previstas ---
  for (const tx of transactions) {
    if (tx.type !== 'INCOME') continue;
    recebimentos += tx.amount;
    detalhe.recebimentos.push({ nome: tx.description || 'Entrada', valor: tx.amount, previsto: false });
  }

  for (const r of recurring) {
    if (r.type !== 'INCOME') continue;
    if (!recurringDayFor(r, year, month)) continue;

    // Se a entrada já foi lançada à mão, ela já está contada acima.
    const jaCaiu = transactions.some(
      tx => tx.type === 'INCOME' && normalize(tx.description) === normalize(r.name),
    );
    if (jaCaiu) continue;

    recebimentos += r.amount;
    detalhe.recebimentos.push({ nome: r.name, valor: r.amount, previsto: true });
  }

  // --- Parcelas: as do cartão saem do bolo da fatura, as de fora são saída ---
  let parcelasNoCartao = 0;
  const parceladoPorCartao = new Map();

  for (const compra of installments) {
    const parcela = installmentFor(compra, year, month);
    if (!parcela) continue;

    parcelamentos += parcela.amount;
    detalhe.parcelamentos.push({
      nome: compra.description,
      valor: parcela.amount,
      parcela: `${parcela.index}/${parcela.count}`,
      noCartao: Boolean(compra.creditCardId),
      ultima: parcela.isLast,
    });

    if (compra.creditCardId) {
      parcelasNoCartao += parcela.amount;
      parceladoPorCartao.set(
        compra.creditCardId,
        (parceladoPorCartao.get(compra.creditCardId) || 0) + parcela.amount,
      );
    }
  }

  // --- Fixos e assinaturas: as recorrentes de despesa ---
  for (const r of recurring) {
    if (r.type !== 'EXPENSE') continue;
    if (!recurringDayFor(r, year, month)) continue;

    assinaturas += r.amount;
    detalhe.assinaturas.push({ nome: r.name, valor: r.amount, dia: r.dayOfMonth });
  }

  // --- Variáveis: despesa realizada que não veio de compromisso ---
  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue;
    if (pareceRecorrente(tx, recurring)) continue;

    variaveis += tx.amount;
    detalhe.variaveis.push({ nome: tx.description || 'Saída', valor: tx.amount });
  }

  // --- A fatura, decomposta ---
  //
  // Da fatura prevista, o que for parcela já foi para o balde de parcelas. O
  // que sobra é compra variável do mês, e é isso que entra aqui. Somar a
  // fatura inteira contaria as parcelas duas vezes.
  const faturasDetalhe = [];
  for (const card of cards) {
    const informada = faturas.get(`${card.id}:${year}:${month}`);
    const total = informada ?? card.estimatedAmount ?? 0;
    if (!(total > 0)) continue;

    const emParcelas = parceladoPorCartao.get(card.id) || 0;
    const resto = Math.max(0, total - emParcelas);

    variaveis += resto;
    faturasDetalhe.push({
      nome: card.name,
      total,
      emParcelas,
      resto,
      estimada: informada === undefined,
    });
    if (resto > 0) {
      detalhe.variaveis.push({ nome: `Fatura ${card.name}`, valor: resto, daFatura: true });
    }
  }

  const saidas = parcelamentos + assinaturas + variaveis;
  const comprometido = parcelamentos + assinaturas;

  for (const lista of Object.values(detalhe)) lista.sort((a, b) => b.valor - a.valor);

  return {
    recebimentos,
    parcelamentos,
    assinaturas,
    variaveis,
    saidas,
    sobra: recebimentos - saidas,
    // Quanto da renda já estava comprometido antes do mês começar
    comprometido,
    comprometidoPct: recebimentos > 0 ? (comprometido / recebimentos) * 100 : null,
    parcelasNoCartao,
    faturas: faturasDetalhe,
    detalhe,
  };
}
