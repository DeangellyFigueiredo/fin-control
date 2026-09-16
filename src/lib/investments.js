/**
 * Investimentos: reconstruir o histórico e medir o rendimento.
 *
 * O ponto de partida é como a pessoa realmente acompanha um CDB: abre o app do
 * banco, vê um saldo, e anota. Ninguém sabe de cabeça "rendeu R$ 412,50" — o
 * banco mostra "R$ 30.412,50". Então a interface pergunta o SALDO e o
 * rendimento sai da subtração, e não o contrário.
 */

/** Como cada tipo de movimento mexe no saldo e no que foi aportado. */
export function efeitoDe(entry) {
  const valor = Number(entry.amount) || 0;

  switch (entry.type) {
    case 'APORTE':     return { saldo: valor, investido: valor };
    case 'RESGATE':    return { saldo: -valor, investido: -valor };
    // Rendimento pode ser negativo: fundo cai, e o saldo do banco vem menor
    // do que o da última vez. Fingir que só sobe seria mentir no gráfico.
    case 'RENDIMENTO': return { saldo: valor, investido: 0 };
    default:           return { saldo: 0, investido: 0 };
  }
}

/**
 * Série histórica de um investimento.
 *
 * Em dois tempos. Primeiro para trás, só para achar o ponto de partida: o
 * saldo de hoje é conhecido, e tirando dele tudo que aconteceu desde o
 * cadastro chega-se ao valor inicial — que não está guardado em lugar nenhum,
 * porque um investimento lançado já com R$ 30.000 não tem aporte no histórico
 * que explique esse número. Depois para a frente, acumulando movimento a
 * movimento.
 *
 * Devolve pontos em ordem crescente de data: { date, saldo, investido }, cada
 * um com o estado DEPOIS do que aconteceu naquele dia.
 */
export function serieDe(investment) {
  const entries = [...(investment.entries || [])]
    .filter(e => e.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // do mais velho ao mais novo

  const saldoHoje = Number(investment.currentValue) || 0;
  const investidoHoje = Number(investment.totalInvested) || 0;

  // O estado no cadastro: o de hoje menos tudo que aconteceu desde então.
  // Descobrir isso é o único jeito de plotar um investimento lançado já com
  // R$ 30.000 — não existe aporte no histórico que explique esse valor.
  let saldo = saldoHoje;
  let investido = investidoHoje;
  for (const entry of entries) {
    const efeito = efeitoDe(entry);
    saldo -= efeito.saldo;
    investido -= efeito.investido;
  }

  const hoje = new Date().toISOString().slice(0, 10);

  // A origem é o dia do cadastro: o investimento existe desde que entrou no
  // app, mesmo que nunca tenha tido movimento. Sem isso, um Tesouro cadastrado
  // com R$ 8.000 e nunca atualizado só apareceria hoje, e a curva da carteira
  // daria um salto de R$ 8.000 no último ponto — como se o dinheiro tivesse
  // caído do céu.
  //
  // Um movimento com data anterior ao cadastro (aporte lançado retroativo)
  // empurra a origem para trás, senão a linha começaria depois do primeiro
  // ponto que ela precisa desenhar.
  const cadastro = investment.createdAt ? diaDe(investment.createdAt) : null;
  const primeiro = entries.length ? diaAnterior(entries[0].date) : null;

  const origem = [cadastro, primeiro].filter(Boolean).sort()[0] || hoje;
  const pontos = [{ date: origem, saldo: arredonda(saldo), investido: arredonda(investido) }];

  // Agora para a frente: cada ponto carrega o saldo DEPOIS do movimento
  // daquele dia, que é o que se vê no extrato do banco.
  for (const entry of entries) {
    const efeito = efeitoDe(entry);
    saldo += efeito.saldo;
    investido += efeito.investido;

    const date = diaDe(entry.date);
    const ultimo = pontos[pontos.length - 1];

    // Vários movimentos no mesmo dia viram um ponto só, com o estado final
    if (ultimo.date === date) {
      ultimo.saldo = arredonda(saldo);
      ultimo.investido = arredonda(investido);
    } else {
      pontos.push({ date, saldo: arredonda(saldo), investido: arredonda(investido) });
    }
  }

  // E o dia de hoje, quando o último movimento é mais antigo
  if (pontos[pontos.length - 1].date < hoje) {
    pontos.push({ date: hoje, saldo: arredonda(saldoHoje), investido: arredonda(investidoHoje) });
  }

  return pontos;
}

const diaDe = (valor) => new Date(valor).toISOString().slice(0, 10);

function diaAnterior(valor) {
  const d = new Date(valor);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Série combinada de vários investimentos, num eixo de datas só.
 *
 * Cada investimento conhece o próprio saldo apenas nas datas em que teve
 * movimento; entre elas, vale o último saldo conhecido. Sem esse
 * preenchimento, somar as séries faria a carteira "cair" toda vez que um dos
 * investimentos não tivesse ponto naquela data.
 */
export function serieDaCarteira(investments) {
  const series = investments.map(inv => ({ inv, pontos: serieDe(inv) }));

  const datas = [...new Set(series.flatMap(s => s.pontos.map(p => p.date)))].sort();
  if (!datas.length) return [];

  return datas.map(date => {
    let saldo = 0;
    let investido = 0;

    for (const { pontos } of series) {
      // O último ponto até esta data; antes do primeiro, o investimento
      // ainda não existia e entra como zero.
      let atual = null;
      for (const p of pontos) {
        if (p.date <= date) atual = p; else break;
      }
      if (atual) {
        saldo += atual.saldo;
        investido += atual.investido;
      }
    }

    return { date, saldo, investido };
  });
}

/**
 * O que mudou desde a anotação anterior — é o que a tela mostra enquanto a
 * pessoa digita o saldo novo.
 */
export function previaDaAtualizacao(investment, novoSaldo, quando = new Date()) {
  const atual = Number(investment.currentValue) || 0;
  const valor = Number(novoSaldo);

  if (!Number.isFinite(valor)) return null;

  const rendimento = arredonda(valor - atual);
  const ultima = ultimaAtualizacao(investment);
  const dias = ultima ? diasEntre(ultima, quando) : null;

  return {
    rendimento,
    dias,
    // Percentual sobre o saldo anterior: é o que o banco chama de rentabilidade
    percentual: atual > 0 ? (rendimento / atual) * 100 : null,
    // Projeção simples para 30 dias, só quando há intervalo para medir
    aoMes: dias > 0 ? arredonda((rendimento / dias) * 30) : null,
  };
}

/** Data da última vez que o saldo foi anotado, ou null se nunca foi. */
export function ultimaAtualizacao(investment) {
  const rendimentos = (investment.entries || [])
    .filter(e => e.type === 'RENDIMENTO' && e.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return rendimentos.length ? new Date(rendimentos[0].date) : null;
}

function diasEntre(de, ate) {
  const a = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const b = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate());
  return Math.round((b - a) / 86400000);
}

/** Centavos, para a soma não acumular erro de ponto flutuante. */
const arredonda = (v) => Math.round(v * 100) / 100;

/**
 * Totais da carteira. `profit` já vem gravado em cada investimento, mas
 * recalcular aqui mantém a tela coerente mesmo se um deles ficar defasado.
 */
export function totaisDaCarteira(investments) {
  const saldo = investments.reduce((s, i) => s + (Number(i.currentValue) || 0), 0);
  const investido = investments.reduce((s, i) => s + (Number(i.totalInvested) || 0), 0);
  const lucro = arredonda(saldo - investido);

  return {
    saldo: arredonda(saldo),
    investido: arredonda(investido),
    lucro,
    percentual: investido > 0 ? (lucro / investido) * 100 : null,
  };
}

/** Quanto rendeu num intervalo, somando só os rendimentos anotados. */
export function rendimentoNoPeriodo(investments, desde) {
  const limite = desde.getTime();

  return arredonda(
    investments
      .flatMap(i => i.entries || [])
      .filter(e => e.type === 'RENDIMENTO' && new Date(e.date).getTime() >= limite)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
  );
}
