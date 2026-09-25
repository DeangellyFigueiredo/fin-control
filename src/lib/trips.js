/**
 * Viagens: as regras e a aritmética, sem banco. Ver docs/rfc/0002-viagens.md.
 *
 * Roda nos dois lados — a rota valida com estas funções, e a tela calcula o
 * resumo com elas usando o "hoje" do aparelho de quem olha. O acesso ao banco
 * fica em tripAccess.js, que este arquivo não pode importar: ele vai junto
 * para o navegador.
 *
 * Toda soma é feita em centavos inteiros. Uma viagem tem dezenas de gastos
 * quebrados, e somar Float por Float deixa o "resta hoje" em R$ 0,01 de
 * diferença do que a pessoa confere na calculadora.
 */

export const TRIP_CATEGORIES = ['Transporte', 'Hospedagem', 'Alimentação', 'Passeios', 'Compras', 'Outros'];

export const TRIP_METHODS = {
  CONTA: { label: 'Conta', hint: 'Pix, débito ou boleto. Também entra no extrato da conta.' },
  CARTAO: { label: 'Cartão', hint: 'Entra só na viagem. No resto do app, o valor vem pela fatura.' },
  DINHEIRO: { label: 'Dinheiro', hint: 'Entra só na viagem. O saque já foi lançado.' },
};

const DIA_MS = 86400000;

/**
 * Número do dia, contado em UTC. Aceita Date, ISO completo ou "YYYY-MM-DD".
 *
 * As datas da viagem e dos gastos vêm de `<input type="date">` e ficam à
 * meia-noite UTC; lidas no fuso local, cairiam um dia antes em UTC-3.
 */
export function diaDe(valor) {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [y, m, d] = valor.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / DIA_MS;
  }
  const d = new Date(valor);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DIA_MS;
}

/** "YYYY-MM-DD" do número do dia, para agrupar e para preencher inputs. */
export function isoDoDia(dia) {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10);
}

const centavos = (valor) => Math.round(Number(valor) * 100);

/** Saída soma, entrada abate: um reembolso diminui o que a viagem custou. */
const liquido = (e) => (e.type === 'INCOME' ? -centavos(e.amount) : centavos(e.amount));

/** Preparação antes da ida, destino entre ida e volta, depois após a volta. */
export function faseDe(trip, data) {
  const d = diaDe(data);
  if (d < diaDe(trip.startDate)) return 'preparacao';
  if (d > diaDe(trip.endDate)) return 'depois';
  return 'destino';
}

/**
 * Tudo que a tela da viagem mostra, a partir dos gastos e do dia de hoje.
 *
 * O limite de hoje desconta todo o gasto do destino MENOS o de hoje. Se o
 * de hoje entrasse, o limite encolheria a cada café e deixaria de ser um
 * número para seguir; em vez disso a tela mostra o limite fixo do dia e
 * quanto dele já foi. Os dias seguintes entram: um passeio já pago para
 * depois de amanhã é dinheiro comprometido, e ignorá-lo inflaria o hoje.
 *
 * A reserva de preparação entra como max(reserva, gasto): enquanto a passagem
 * não foi comprada, o destino não pode contar com o dinheiro dela; se saiu
 * mais cara que o reservado, o excesso sai do destino.
 */
export function resumoViagem(trip, entries, hojeISO) {
  const inicio = diaDe(trip.startDate);
  const fim = diaDe(trip.endDate);
  const hoje = diaDe(hojeISO);
  const totalDias = fim - inicio + 1;

  const fases = { preparacao: 0, destino: 0, depois: 0 };
  const porDia = new Map();
  const porCategoria = new Map();
  const porPessoa = new Map();
  let destinoForaDeHoje = 0;
  let gastoHoje = 0;

  for (const e of entries) {
    const v = liquido(e);
    const d = diaDe(e.date);
    const fase = d < inicio ? 'preparacao' : d > fim ? 'depois' : 'destino';

    fases[fase] += v;
    porDia.set(d, (porDia.get(d) || 0) + v);
    porCategoria.set(e.category, (porCategoria.get(e.category) || 0) + v);
    porPessoa.set(e.userId, (porPessoa.get(e.userId) || 0) + v);

    if (fase === 'destino') {
      if (d === hoje) gastoHoje += v;
      else destinoForaDeHoje += v;
    }
  }

  const orcamento = centavos(trip.budget);
  const reserva = centavos(trip.prepBudget || 0);
  const destinoOrcado = orcamento - Math.max(reserva, fases.preparacao);
  const total = fases.preparacao + fases.destino + fases.depois;

  const status = hoje < inicio ? 'antes' : hoje > fim ? 'encerrada' : 'durante';

  let hojeInfo = null;
  if (status === 'durante') {
    const diasRestantes = fim - hoje + 1;
    // Arredonda para baixo: somados, os limites dos dias que faltam nunca
    // passam do que sobrou.
    const limite = Math.floor((destinoOrcado - destinoForaDeHoje) / diasRestantes);
    hojeInfo = {
      diaDaViagem: hoje - inicio + 1,
      diasRestantes,
      limite: limite / 100,
      gasto: gastoHoje / 100,
      resta: (limite - gastoHoje) / 100,
    };
  }

  const reais = (mapa, chave) => [...mapa.entries()].map(([k, v]) => ({ [chave]: k, valor: v / 100 }));

  return {
    status,
    totalDias,
    diasAteIda: status === 'antes' ? inicio - hoje : 0,
    orcamento: orcamento / 100,
    reservaPreparacao: reserva / 100,
    destinoOrcado: destinoOrcado / 100,
    limitePlanejado: Math.floor(destinoOrcado / totalDias) / 100,
    gasto: {
      total: total / 100,
      preparacao: fases.preparacao / 100,
      destino: fases.destino / 100,
      depois: fases.depois / 100,
    },
    saldo: (orcamento - total) / 100,
    hoje: hojeInfo,
    porDia: reais(porDia, 'dia')
      .sort((a, b) => b.dia - a.dia)
      .map(({ dia, valor }) => ({ data: isoDoDia(dia), valor })),
    porCategoria: reais(porCategoria, 'categoria').sort((a, b) => b.valor - a.valor),
    porPessoa: reais(porPessoa, 'userId'),
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Valor em reais vindo do formulário; null quando não é um número positivo. */
function valorPositivo(valor) {
  const n = typeof valor === 'number' ? valor : parseFloat(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Valida o corpo de criação/edição de uma viagem. Devolve `{ data }` pronto
 * para o Prisma ou `{ error }` com a mensagem para a tela.
 */
export function validarViagem(body = {}) {
  const name = String(body.name || '').trim();
  if (!name) return { error: 'Dê um nome à viagem' };
  if (name.length > 80) return { error: 'Nome longo demais' };

  if (!ISO.test(body.startDate || '') || !ISO.test(body.endDate || '')) {
    return { error: 'Informe as datas de ida e de volta' };
  }
  if (diaDe(body.endDate) < diaDe(body.startDate)) {
    return { error: 'A volta não pode ser antes da ida' };
  }

  const budget = valorPositivo(body.budget);
  if (budget === null) return { error: 'Informe o orçamento da viagem' };

  const prepRaw = body.prepBudget === '' || body.prepBudget == null ? 0 : parseFloat(body.prepBudget);
  if (!Number.isFinite(prepRaw) || prepRaw < 0) return { error: 'Reserva de preparação inválida' };
  const prepBudget = Math.round(prepRaw * 100) / 100;
  if (prepBudget > budget) return { error: 'A reserva de preparação não pode passar do orçamento' };

  return {
    data: {
      name,
      startDate: new Date(`${body.startDate}T00:00:00.000Z`),
      endDate: new Date(`${body.endDate}T00:00:00.000Z`),
      budget,
      prepBudget,
    },
  };
}

/**
 * Valida um gasto da viagem. O método só é validado na criação: trocar de
 * Conta para Cartão depois exigiria criar ou apagar o lançamento na conta, e
 * é mais claro apagar e lançar de novo.
 */
export function validarGasto(body = {}, { criando = true } = {}) {
  if (!['EXPENSE', 'INCOME'].includes(body.type)) return { error: 'Tipo inválido' };

  const amount = valorPositivo(body.amount);
  if (amount === null) return { error: 'Valor deve ser maior que zero' };

  if (!ISO.test(body.date || '')) return { error: 'Informe a data' };

  if (!TRIP_CATEGORIES.includes(body.category)) return { error: 'Escolha uma categoria' };

  const description = String(body.description || '').trim().slice(0, 200);

  const data = {
    type: body.type,
    amount,
    date: new Date(`${body.date}T00:00:00.000Z`),
    category: body.category,
    description,
  };

  if (criando) {
    if (!TRIP_METHODS[body.method]) return { error: 'Escolha como foi pago' };
    data.method = body.method;
  }

  return { data };
}
