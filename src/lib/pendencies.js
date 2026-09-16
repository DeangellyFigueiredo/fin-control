/**
 * Pendências: a previsão que venceu e ninguém confirmou.
 *
 * Antes, uma recorrente cujo dia passava simplesmente sumia do calendário.
 * O motivo era certo — sem isso, o aluguel lançado à mão somaria com a
 * recorrência que o previu, e o mês contaria aluguel duas vezes. Mas o efeito
 * colateral era pior que o problema: a despesa evaporava e o saldo projetado
 * MELHORAVA sozinho só porque a data passou.
 *
 * A correção é não descartar, e sim classificar:
 *
 *   dia futuro                  → prevista
 *   dia passado, já aconteceu   → some, a transação real assumiu o lugar
 *   dia passado, não aconteceu  → PENDENTE, continua pesando no saldo
 *
 * Uma pendência espera por uma de duas respostas: foi lançada de fato, ou foi
 * cancelada. Enquanto nenhuma vem, ela continua contando — é o único jeito de
 * o saldo dizer a verdade.
 */

import { normalize } from './categorize.js';
import { recurringDayFor, utcParts } from './calendar.js';

/**
 * Esta transação é a recorrente acontecendo?
 *
 * Casa pelo NOME, não pelo valor. O contador cobra R$ 450 e vem R$ 480; o
 * aluguel sobe no aniversário do contrato. Exigir o centavo exato faria a
 * pendência continuar de pé depois de paga, que é o erro mais irritante
 * possível — o app cobrando algo que a pessoa acabou de fazer.
 *
 * O preço é uma saída de R$ 50 descrita como "Aluguel" encerrar a pendência do
 * aluguel de R$ 3.172. Falso positivo raro, consequência leve, e visível: a
 * pendência some da lista onde a pessoa está olhando.
 */
export function casaComRecorrente(tx, entry) {
  if (!tx || !entry) return false;
  if (tx.type !== entry.type) return false;

  const desc = normalize(tx.description);
  if (!desc) return false;

  return desc === normalize(entry.name);
}

/** Chave de uma ocorrência: a recorrente num mês específico. */
export const ocorrenciaKey = (recurringId, year, month) => `${recurringId}:${year}:${month}`;

/**
 * Estado de uma recorrente num mês.
 *
 * @returns 'futura' | 'realizada' | 'pendente' | null (não cai neste mês)
 */
export function estadoDaRecorrente(entry, year, month, ctx) {
  const day = recurringDayFor(entry, year, month);
  if (!day) return null;

  // O app não sabe nada sobre o que veio antes do cadastro. Sem esta trava,
  // registrar "Internet, dia 10" hoje faria nascerem pendências de junho,
  // julho e agosto — cobranças inventadas por meses que nunca foram
  // acompanhados. `recurringDayFor` já respeita `startDate` quando existe;
  // isto cobre o caso comum, que é não haver nenhum.
  if (!entry.startDate && entry.createdAt) {
    const nasceu = utcParts(entry.createdAt);
    const chaveOcorrencia = year * 10000 + month * 100 + day;
    const chaveCadastro = nasceu.year * 10000 + nasceu.month * 100 + nasceu.day;
    if (chaveOcorrencia < chaveCadastro) return null;
  }

  if (ctx.isFuture(year, month, day)) return 'futura';

  // Resolvida à mão: marcada como paga ou como "não vai acontecer"
  if (ctx.resolvidas.has(ocorrenciaKey(entry.id, year, month))) return 'realizada';

  // Ou aconteceu de fato, e o lançamento real assumiu o lugar
  const aconteceu = ctx.transactions.some((tx) => {
    const p = utcParts(tx.date);
    return p.year === year && p.month === month && casaComRecorrente(tx, entry);
  });

  return aconteceu ? 'realizada' : 'pendente';
}

/**
 * Quantos dias de atraso, para ordenar a lista pelo que dói primeiro.
 */
export function diasDeAtraso(year, month, day, hoje) {
  const venceu = Date.UTC(year, month - 1, day);
  const agora = Date.UTC(hoje.year, hoje.month - 1, hoje.day);
  return Math.max(0, Math.round((agora - venceu) / 86400000));
}

/**
 * O que o modal do dia deve perguntar.
 *
 * Só o que venceu ou vence hoje — antecedência é assunto do painel, não de um
 * modal que interrompe. E nada que o app já tenha conseguido resolver sozinho.
 */
export function pendenciasParaHoje(itens, hoje) {
  return itens
    .filter(p => p.atraso > 0 || (p.year === hoje.year && p.month === hoje.month && p.day === hoje.day))
    .sort((a, b) => b.atraso - a.atraso || a.day - b.day);
}
