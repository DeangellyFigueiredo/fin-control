import prisma from '../prisma.js';
import { MODELO, somarUsos } from './precos.js';

/**
 * Limites de uso da IA (RFC 0004): chamadas por pessoa por dia e um teto de
 * custo por mês no app inteiro. Os dois vêm de variáveis de ambiente.
 *
 * "Dia" e "mês" no horário de Brasília: quem estoura o limite às 22h não pode
 * ganhar crédito novo às 21h do mesmo dia só porque em UTC já virou.
 */

export const LIMITE_DIARIO = Number(process.env.IA_LIMITE_DIARIO ?? 30);
export const TETO_MENSAL_USD = Number(process.env.IA_LIMITE_MENSAL_USD ?? 10);
const FUSO_MS = 3 * 60 * 60 * 1000;

export function inicioDoDia(agora = new Date()) {
  const local = new Date(agora.getTime() - FUSO_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + FUSO_MS);
}

export function inicioDoMes(agora = new Date()) {
  const local = new Date(agora.getTime() - FUSO_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + FUSO_MS);
}

export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Situação de uso para a tela e para a checagem antes de chamar. */
export async function situacaoDeUso(userId, tripId = null, agora = new Date()) {
  const [hoje, mes, viagem] = await Promise.all([
    prisma.aiUsage.count({ where: { userId, createdAt: { gte: inicioDoDia(agora) } } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: inicioDoMes(agora) } }, _sum: { costUsd: true } }),
    tripId
      ? prisma.aiUsage.aggregate({ where: { tripId }, _sum: { costUsd: true }, _count: true })
      : null,
  ]);
  const custoMes = mes._sum.costUsd || 0;
  return {
    configurada: iaConfigurada(),
    hoje: { chamadas: hoje, limite: LIMITE_DIARIO },
    mes: { custo: Math.round(custoMes * 100) / 100, teto: TETO_MENSAL_USD },
    viagem: viagem ? { custo: Math.round((viagem._sum.costUsd || 0) * 100) / 100, chamadas: viagem._count } : null,
  };
}

/** `null` se pode chamar; senão, a mensagem do porquê. */
export function motivoDoBloqueio(s) {
  if (!s.configurada) return 'IA não configurada: falta a chave ANTHROPIC_API_KEY no servidor.';
  if (s.hoje.chamadas >= s.hoje.limite) return `Você já fez ${s.hoje.limite} pedidos à IA hoje. Amanhã libera de novo.`;
  if (s.mes.custo >= s.mes.teto) return `O app atingiu o teto de US$ ${s.mes.teto} de IA neste mês. Volta no mês que vem.`;
  return null;
}

export async function registrarUso({ userId, tripId, kind, usos }) {
  const { usage, custo } = somarUsos(usos);
  await prisma.aiUsage.create({
    data: {
      userId,
      tripId,
      kind,
      model: MODELO,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
      webSearches: usage.server_tool_use.web_search_requests,
      costUsd: custo,
    },
  });
  return custo;
}
