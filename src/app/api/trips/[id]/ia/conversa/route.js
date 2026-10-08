import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess } from '@/lib/tripAccess';
import { roteiroParaIA } from '@/lib/operacoes';
import { ErroIA } from '@/lib/ia/sugestoes';
import { instrucoes, mensagemDoUsuario, propostasPendentes, pedidoDePlanejamento, turnoDePlanejamento } from '@/lib/ia/planejar';
import { roteiroAtual, criarProposta, situacaoDaProposta, RETORNO_PARA_IA } from '@/lib/ia/propostas';
import { situacaoDeUso, motivoDoBloqueio, registrarUso } from '@/lib/ia/limites';

/**
 * Conversa de planejamento com a IA (RFC 0004), uma por viagem e por pessoa.
 * GET devolve o histórico para a tela; POST manda uma mensagem; DELETE
 * recomeça do zero (as propostas guardadas ficam, já decididas ou não).
 *
 * O que vai para a IA: nome e datas da viagem, "quem viaja" e o roteiro
 * (paradas e atividades). Nunca gastos, contas ou dados de outra pessoa.
 */

async function acesso(params) {
  const scope = await getScope();
  if (!scope) return { resposta: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return { resposta: NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 }) };
  return { scope, tripId, trip: access.trip };
}

/** As mensagens como a tela mostra: papel, texto e a proposta, se houver. */
async function paraTela(mensagens, tripId) {
  const ids = mensagens.map(m => m.proposalId).filter(Boolean);
  const [propostas, atual] = await Promise.all([
    ids.length ? prisma.tripProposal.findMany({ where: { id: { in: ids } } }) : [],
    roteiroAtual(tripId),
  ]);
  const porId = new Map(propostas.map(p => [p.id, p]));
  return mensagens
    .filter(m => m.texto || m.proposalId)
    .map(m => {
      const p = m.proposalId ? porId.get(m.proposalId) : null;
      return {
        id: m.id,
        papel: m.role,
        texto: m.texto,
        em: m.createdAt,
        proposta: p && {
          id: p.id,
          resumo: p.resumo,
          diff: p.payload.diff,
          erros: p.payload.erros,
          situacao: situacaoDaProposta(p, atual.versao),
        },
      };
    });
}

export async function GET(request, { params }) {
  const { resposta, scope, tripId } = await acesso(params);
  if (resposta) return resposta;
  const conversa = await prisma.aiConversation.findUnique({
    where: { tripId_userId: { tripId, userId: scope.userId } },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json({ mensagens: conversa ? await paraTela(conversa.messages, tripId) : [] });
}

export async function DELETE(request, { params }) {
  const { resposta, scope, tripId } = await acesso(params);
  if (resposta) return resposta;
  await prisma.aiConversation.deleteMany({ where: { tripId, userId: scope.userId } });
  return NextResponse.json({ success: true });
}

export async function POST(request, { params }) {
  const { resposta, scope, tripId, trip } = await acesso(params);
  if (resposta) return resposta;

  const body = await request.json().catch(() => ({}));
  const texto = String(body.texto || '').trim().slice(0, 2000);
  if (!texto) return NextResponse.json({ error: 'Escreva uma mensagem' }, { status: 400 });
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(body.hoje || '') ? body.hoje : new Date().toISOString().slice(0, 10);

  const situacao = await situacaoDeUso(scope.userId, tripId);
  const bloqueio = motivoDoBloqueio(situacao);
  if (bloqueio) return NextResponse.json({ error: bloqueio }, { status: situacao.configurada ? 429 : 503 });

  const conversa = await prisma.aiConversation.upsert({
    where: { tripId_userId: { tripId, userId: scope.userId } },
    create: { tripId, userId: scope.userId },
    update: {},
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  // As propostas da última resposta precisam de resultado antes do texto novo
  const ultimaDoUsuario = conversa.messages.findLastIndex(m => m.role === 'user');
  const respostasAnteriores = conversa.messages.slice(ultimaDoUsuario + 1).filter(m => m.role === 'assistant');
  const chamadas = respostasAnteriores.flatMap(m => propostasPendentes(m.content));
  const atual = await roteiroAtual(tripId);
  let pendentes = [];
  if (chamadas.length) {
    const propostas = await prisma.tripProposal.findMany({ where: { tripId, userId: scope.userId } });
    pendentes = chamadas.map(c => {
      const p = propostas.find(x => x.payload?.toolUseId === c.id);
      return { id: c.id, situacao: RETORNO_PARA_IA[p ? situacaoDaProposta(p, atual.versao) : 'descartada'] };
    });
  }

  const conteudoDoUsuario = mensagemDoUsuario(texto, roteiroParaIA(atual.stops, atual.activities), pendentes);
  const pedido = pedidoDePlanejamento({
    system: instrucoes({ trip, hojeISO: hoje }),
    mensagens: [
      ...conversa.messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: conteudoDoUsuario },
    ],
  });

  let turno;
  try {
    turno = await turnoDePlanejamento(new Anthropic(), pedido);
  } catch (e) {
    if (e.usos?.length) await registrarUso({ userId: scope.userId, tripId, kind: 'PLANEJAR', usos: e.usos });
    if (e instanceof ErroIA) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'A IA está ocupada agora. Tente de novo em um minuto.' }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'A chave da IA foi recusada. Confira ANTHROPIC_API_KEY.' }, { status: 503 });
    }
    console.error('IA conversa error:', e.message);
    return NextResponse.json({ error: 'A IA não respondeu agora. Tente de novo.' }, { status: 502 });
  }

  await registrarUso({ userId: scope.userId, tripId, kind: 'PLANEJAR', usos: turno.usos });

  const proposta = turno.proposta
    ? await criarProposta({ tripId, userId: scope.userId, trip, ...turno.proposta })
    : null;

  // Só acréscimo, na ordem: a mensagem do usuário e cada resposta como veio.
  // A última resposta carrega o texto final e a proposta, para a tela.
  const agora = Date.now();
  await prisma.$transaction([
    prisma.aiMessage.create({ data: { conversationId: conversa.id, role: 'user', content: conteudoDoUsuario, texto, createdAt: new Date(agora) } }),
    ...turno.respostas.map((content, i) => {
      const ultima = i === turno.respostas.length - 1;
      return prisma.aiMessage.create({
        data: {
          conversationId: conversa.id,
          role: 'assistant',
          content,
          texto: ultima ? turno.texto : '',
          proposalId: ultima ? proposta?.id ?? null : null,
          createdAt: new Date(agora + i + 1),
        },
      });
    }),
  ]);

  const novas = await prisma.aiMessage.findMany({
    where: { conversationId: conversa.id, createdAt: { gte: new Date(agora) } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ mensagens: await paraTela(novas, tripId) }, { status: 201 });
}
