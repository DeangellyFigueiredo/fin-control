/**
 * Dicas do mês.
 *
 * Regra única, e ela é o que separa isto de um app genérico: toda frase
 * carrega um número que veio dos dados do usuário e uma ação possível.
 * "Cuidado com gastos supérfluos" não entra aqui. "No dia 27 o saldo fica
 * em -R$ 410" entra.
 *
 * Tudo é determinístico e calculado localmente: dá para conferir a conta,
 * e a mesma tela mostra sempre a mesma coisa.
 *
 * Quando nada passa do limiar, a lista volta vazia — e a tela some. Uma dica
 * que aparece todo dia vira ruído, e o olho aprende a pular em uma semana.
 */

import { daysInMonth, shiftMonth } from './calendar.js';
import { installmentFor, lastInstallmentMonth, remainingAmount } from './installments.js';

/** Prioridade de exibição: o que dói primeiro. */
const PESO = { alerta: 0, atencao: 1, info: 2 };

/**
 * Em qual fatura cai uma compra feita hoje, e quantos dias de prazo ela ganha.
 *
 * A fatura aberta no dia `openingDay` só é paga no `paymentDay` do mês
 * seguinte — ou do subsequente, quando o pagamento cai antes da abertura.
 */
export function faturaDeUmaCompra(card, year, month, day) {
  const abriuEsteMes = day >= card.openingDay;
  const aberta = abriuEsteMes ? { year, month } : shiftMonth(year, month, -1);

  // Santander abre 11 e paga 15: a fatura de setembro é paga em outubro.
  // Um cartão que pagasse dia 5 e abrisse dia 20 só cobraria dois meses
  // depois, porque o dia 5 seguinte ainda está dentro do ciclo aberto.
  const salto = card.paymentDay >= card.openingDay ? 1 : 2;
  const pagamento = shiftMonth(aberta.year, aberta.month, salto);
  const diaPagamento = Math.min(card.paymentDay, daysInMonth(pagamento.year, pagamento.month));

  const hoje = Date.UTC(year, month - 1, day);
  const vence = Date.UTC(pagamento.year, pagamento.month - 1, diaPagamento);

  return {
    year: pagamento.year,
    month: pagamento.month,
    day: diaPagamento,
    dias: Math.round((vence - hoje) / 86400000),
  };
}

const ddmm = (day, month) => `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;

/**
 * Monta as dicas de um mês.
 *
 * @param {object} ctx
 * @param {object} ctx.month        mês vindo de /api/calendar
 * @param {Array}  ctx.cards        cartões ativos
 * @param {Array}  ctx.installments compras parceladas
 * @param {object} ctx.buckets      saída de buildBuckets
 * @param {object} ctx.hoje         { year, month, day }
 */
export function buildInsights({ month, cards = [], installments = [], buckets = null, hoje }) {
  if (!month) return [];

  const dicas = [];
  const mesCorrente = hoje.year === month.year && hoje.month === month.month;
  const futuro = (month.year * 100 + month.month) > (hoje.year * 100 + hoje.month);
  const total = daysInMonth(month.year, month.month);

  // --- O dia em que o saldo não atravessa ---
  const primeiroNegativo = month.days.find(d => d.balance < 0);
  if (primeiroNegativo) {
    const pior = month.days.reduce((p, d) => (p && p.balance <= d.balance ? p : d), null);
    dicas.push({
      id: 'dia-apertado',
      nivel: 'alerta',
      titulo: 'O mês não atravessa',
      texto: `Em ${ddmm(primeiroNegativo.day, month.month)} o saldo projetado fica em ${brl(primeiroNegativo.balance)}.`
        + ` Para atravessar até o fim, faltam ${brl(Math.abs(pior.balance))}.`,
    });
  }

  // --- Onde o mês fecha ---
  if (!primeiroNegativo && month.closingBalance !== undefined) {
    dicas.push({
      id: 'fecha-com',
      nivel: 'info',
      titulo: 'Onde o mês fecha',
      texto: `Do jeito que está, ${nomeMes(month.month)} fecha com ${brl(month.closingBalance)}.`,
    });
  }

  // --- Quanto sobra por dia daqui até o fim ---
  if (mesCorrente) {
    const hojeCell = month.days[hoje.day - 1];
    const restam = total - hoje.day + 1;
    const sobra = month.closingBalance;

    // Só faz sentido quando sobra dinheiro e ainda há mês pela frente.
    if (hojeCell && sobra > 0 && restam > 1) {
      dicas.push({
        id: 'sobra-por-dia',
        nivel: 'info',
        titulo: 'Quanto dá para gastar por dia',
        texto: `Sobram ${brl(sobra)} para ${restam} dias — ${brl(sobra / restam)} por dia`
          + ` sem furar o mês.`,
      });
    }
  }

  // --- Melhor cartão para comprar hoje ---
  if (mesCorrente && cards.length) {
    const prazos = cards
      .map(card => ({ card, ...faturaDeUmaCompra(card, hoje.year, hoje.month, hoje.day) }))
      .sort((a, b) => b.dias - a.dias);

    const melhor = prazos[0];
    if (melhor && melhor.dias > 0) {
      const outros = prazos.slice(1)
        .map(p => `${p.card.name} em ${ddmm(p.day, p.month)} (${p.dias} dias)`)
        .join(', ');

      dicas.push({
        id: 'melhor-dia-compra',
        nivel: 'info',
        titulo: 'Melhor cartão para comprar hoje',
        texto: `Comprando hoje no ${melhor.card.name}, você paga só em ${ddmm(melhor.day, melhor.month)}`
          + ` — ${melhor.dias} dias de prazo.`
          + (outros ? ` Nos outros: ${outros}.` : ''),
      });
    }

    // A virada de ciclo: esperar um ou dois dias pode render um mês inteiro
    for (const { card } of prazos) {
      const faltam = card.openingDay - hoje.day;
      if (faltam >= 1 && faltam <= 3) {
        const agora = faturaDeUmaCompra(card, hoje.year, hoje.month, hoje.day);
        const depois = faturaDeUmaCompra(card, hoje.year, hoje.month, card.openingDay);
        if (depois.dias - agora.dias >= 20) {
          dicas.push({
            id: `virada-${card.id}`,
            nivel: 'atencao',
            titulo: `${card.name} vira em ${faltam} ${faltam === 1 ? 'dia' : 'dias'}`,
            texto: `Uma compra grande no ${card.name} feita hoje vence em ${agora.dias} dias.`
              + ` Esperando até ${ddmm(card.openingDay, hoje.month)}, vence em ${depois.dias}.`,
          });
        }
      }
    }
  }

  // --- O dia mais folgado, para aporte ou pagamento grande ---
  if (!primeiroNegativo) {
    const candidatos = month.days.filter(d => !mesCorrente || d.day >= hoje.day);
    const pico = candidatos.reduce((melhor, d) => (melhor && melhor.balance >= d.balance ? melhor : d), null);

    if (pico && pico.balance > 0 && (futuro || pico.day > hoje.day)) {
      dicas.push({
        id: 'pico-folga',
        nivel: 'info',
        titulo: 'Seu dia mais folgado',
        texto: `${ddmm(pico.day, month.month)} é o ponto mais alto do mês: ${brl(pico.balance)} em conta.`
          + ` É o melhor dia para um aporte ou uma parcela grande.`,
      });
    }
  }

  // --- Contas empilhadas na mesma semana ---
  const empilhado = janelaMaisPesada(month.days);
  if (empilhado && empilhado.total > 0) {
    const saidaDoMes = month.totals.expense + month.totals.plannedExpense;
    if (saidaDoMes > 0 && empilhado.total / saidaDoMes >= 0.6 && empilhado.itens >= 3) {
      dicas.push({
        id: 'vencimentos-empilhados',
        nivel: 'atencao',
        titulo: 'Contas concentradas',
        texto: `${empilhado.itens} saídas caem entre ${ddmm(empilhado.inicio, month.month)}`
          + ` e ${ddmm(empilhado.fim, month.month)}, somando ${brl(empilhado.total)}`
          + ` — ${Math.round((empilhado.total / saidaDoMes) * 100)}% do mês em ${empilhado.dias} dias.`
          + ` Mudar a data de uma delas aliviaria a semana.`,
      });
    }
  }

  // --- Fatura real acima da estimativa ---
  for (const fatura of buckets?.faturas || []) {
    if (fatura.estimada) continue;
    const card = cards.find(c => c.name === fatura.nome);
    const estimada = card?.estimatedAmount || 0;
    if (estimada <= 0) continue;

    const excesso = fatura.total - estimada;
    if (excesso / estimada >= 0.15) {
      dicas.push({
        id: `fatura-${fatura.nome}`,
        nivel: 'atencao',
        titulo: `Fatura do ${fatura.nome} acima do previsto`,
        texto: `Veio ${brl(fatura.total)} contra ${brl(estimada)} estimados`
          + ` — ${brl(excesso)} a mais (${Math.round((excesso / estimada) * 100)}%).`,
      });
    }
  }

  // --- Parcela que acaba: quanto de fôlego volta ---
  for (const compra of installments) {
    const parcela = installmentFor(compra, month.year, month.month);
    if (!parcela?.isLast) continue;

    dicas.push({
      id: `ultima-parcela-${compra.id}`,
      nivel: 'info',
      titulo: 'Última parcela',
      texto: `${compra.description} termina este mês (${parcela.index}/${parcela.count}).`
        + ` A partir do mês que vem, sobram ${brl(parcela.amount)} por mês.`,
    });
  }

  // --- Quando tudo estiver pago ---
  const emAberto = installments.filter(c => installmentFor(c, month.year, month.month));
  if (emAberto.length >= 2) {
    const fim = emAberto
      .map(c => ({ c, ...lastInstallmentMonth(c) }))
      .sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month))[0];

    const falta = emAberto.reduce((s, c) => s + remainingAmount(c, month.year, month.month), 0);
    const proximoMes = shiftMonth(month.year, month.month, 1);
    const depois = emAberto.reduce(
      (s, c) => s + (installmentFor(c, proximoMes.year, proximoMes.month)?.amount || 0), 0,
    );

    dicas.push({
      id: 'fim-das-parcelas',
      nivel: 'info',
      titulo: 'Quando você se desamarra',
      texto: `${emAberto.length} compras parceladas, ${brl(falta)} a pagar.`
        + ` A última acaba em ${nomeMes(fim.month)}/${fim.year}`
        + (depois > 0 ? `, e aí voltam ${brl(depois)} por mês.` : '.'),
    });
  }

  // --- Quanto da renda já estava comprometido ---
  if (buckets?.comprometidoPct !== null && buckets?.comprometidoPct !== undefined) {
    const pct = buckets.comprometidoPct;
    if (pct >= 50) {
      dicas.push({
        id: 'comprometido',
        nivel: pct >= 80 ? 'atencao' : 'info',
        titulo: 'Renda já comprometida',
        texto: `${Math.round(pct)}% do que entra já está preso em fixos e parcelas`
          + ` (${brl(buckets.comprometido)} de ${brl(buckets.recebimentos)}).`
          + ` Sobram ${brl(buckets.recebimentos - buckets.comprometido)} para o resto.`,
      });
    }
  }

  return dicas.sort((a, b) => PESO[a.nivel] - PESO[b.nivel]);
}

/** A janela de 5 dias que concentra mais saída. */
function janelaMaisPesada(days, tamanho = 5) {
  let melhor = null;

  for (let i = 0; i + tamanho <= days.length; i++) {
    const janela = days.slice(i, i + tamanho);
    const total = janela.reduce((s, d) => s + d.expense + d.plannedExpense, 0);
    const itens = janela.reduce((s, d) => s + d.items.filter(x => x.type === 'EXPENSE').length, 0);

    if (!melhor || total > melhor.total) {
      melhor = { total, itens, inicio: janela[0].day, fim: janela[janela.length - 1].day, dias: tamanho };
    }
  }

  return melhor;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const nomeMes = (m) => MESES[m - 1] || '';

/** Mesmo formato do resto do app: negativo sai como "-R$ 1.191,70". */
function brl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(value) || 0);
}
