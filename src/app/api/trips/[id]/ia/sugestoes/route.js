import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess } from '@/lib/tripAccess';
import { estadias } from '@/lib/roteiro';
import { resumoDoClima } from '@/lib/clima';
import { climaDoPeriodo } from '@/lib/externo/clima';
import { buscarJson } from '@/lib/externo/http';
import { comCache, DIA_MS } from '@/lib/externo/cache';
import { paginaWiki } from '@/lib/externo/wiki';
import { ogImageDe } from '@/lib/externo/ogImage';
import { montarPedido, gerarSugestoes, validarSugestoes, ErroIA } from '@/lib/ia/sugestoes';
import { situacaoDeUso, motivoDoBloqueio, registrarUso } from '@/lib/ia/limites';

/**
 * Sugestões de passeios para uma parada (RFC 0004). GET devolve as últimas
 * guardadas; POST gera novas, contando no limite e no teto.
 *
 * O que vai para a IA: cidade, datas, "quem viaja", os títulos que já estão
 * no roteiro e o clima. Nunca gastos, contas ou dados de outro participante.
 */

const naoEncontrada = () => NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });

async function acesso(params) {
  const scope = await getScope();
  if (!scope) return { resposta: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const { id: tripId } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return { resposta: naoEncontrada() };
  return { scope, tripId, trip: access.trip };
}

export async function GET(request, { params }) {
  const { resposta, tripId } = await acesso(params);
  if (resposta) return resposta;
  const stopId = new URL(request.url).searchParams.get('stopId') || '';
  const ultima = await prisma.aiSuggestion.findFirst({
    where: { tripId, stopId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(ultima ? { itens: ultima.items, geradasEm: ultima.createdAt } : { itens: null });
}

/** Foto de cada sugestão: Wikipedia primeiro; sem ela, a capa do site oficial. */
async function comFoto(s) {
  if (s.wikiTitle) {
    const p = await comCache(`wiki:pagina:${s.wikiTitle.toLowerCase()}`, 30 * DIA_MS, () => paginaWiki(s.wikiTitle, buscarJson))
      .catch(() => null);
    if (p?.encontrado) {
      return { ...s, wikiTitle: p.titulo, foto: p.foto ? { url: p.foto.url, credito: p.foto.credito, fonte: p.foto.fonte } : null };
    }
  }
  if (s.officialUrl) {
    const capa = await comCache(`og:${s.officialUrl}`, 30 * DIA_MS, async () => (await ogImageDe(s.officialUrl)) || { nada: true })
      .catch(() => null);
    if (capa?.url) return { ...s, wikiTitle: null, foto: { url: capa.url, credito: null, fonte: capa.fonte } };
  }
  return { ...s, wikiTitle: null, foto: null };
}

export async function POST(request, { params }) {
  const { resposta, scope, tripId, trip } = await acesso(params);
  if (resposta) return resposta;

  const body = await request.json().catch(() => ({}));
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(body.hoje || '') ? body.hoje : new Date().toISOString().slice(0, 10);

  const situacao = await situacaoDeUso(scope.userId, tripId);
  const bloqueio = motivoDoBloqueio(situacao);
  if (bloqueio) return NextResponse.json({ error: bloqueio }, { status: situacao.configurada ? 429 : 503 });

  const [stops, activities] = await Promise.all([
    prisma.tripStop.findMany({ where: { tripId } }),
    prisma.tripActivity.findMany({ where: { tripId }, select: { title: true } }),
  ]);
  const parada = estadias(stops).find(s => s.id === String(body.stopId || ''));
  if (!parada) return NextResponse.json({ error: 'Parada não encontrada' }, { status: 404 });

  const de = parada.chegada;
  const ate = parada.saida || parada.chegada;
  const clima = await climaDoPeriodo({ lat: parada.lat, lng: parada.lng, de, ate, hoje })
    .then(c => resumoDoClima(c.dias))
    .catch(() => null);
  const jaNoRoteiro = activities.map(a => a.title);

  const pedido = montarPedido({
    cidade: parada.city, uf: parada.uf, datas: { de, ate }, quemViaja: trip.travelerNotes, jaNoRoteiro, clima, hojeISO: hoje,
  });

  let lista;
  let usos = [];
  try {
    ({ lista, usos } = await gerarSugestoes(new Anthropic(), pedido));
  } catch (e) {
    usos = e.usos || [];
    if (usos.length) await registrarUso({ userId: scope.userId, tripId, kind: 'SUGESTOES', usos });
    if (e instanceof ErroIA) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'A IA está ocupada agora. Tente de novo em um minuto.' }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'A chave da IA foi recusada. Confira ANTHROPIC_API_KEY.' }, { status: 503 });
    }
    console.error('IA sugestoes error:', e.message);
    return NextResponse.json({ error: 'A IA não respondeu agora. Tente de novo.' }, { status: 502 });
  }

  const custo = await registrarUso({ userId: scope.userId, tripId, kind: 'SUGESTOES', usos });
  const itens = await Promise.all(validarSugestoes(lista, jaNoRoteiro).map(comFoto));
  const salva = await prisma.aiSuggestion.create({ data: { tripId, stopId: parada.id, items: itens } });

  return NextResponse.json({ itens, geradasEm: salva.createdAt, custo }, { status: 201 });
}
