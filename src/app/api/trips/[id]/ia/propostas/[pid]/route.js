import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { tripAccess } from '@/lib/tripAccess';
import { aplicarProposta, ErroProposta } from '@/lib/ia/propostas';

/**
 * Aplicar ou descartar uma proposta da IA (RFC 0004): `{ acao }`. Só quem
 * gerou a proposta decide sobre ela: foi essa pessoa que viu o preview.
 */
export async function POST(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id: tripId, pid } = await params;
  const access = await tripAccess(scope.userId, tripId);
  if (!access) return NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });

  const { acao } = await request.json().catch(() => ({}));

  if (acao === 'descartar') {
    const { count } = await prisma.tripProposal.updateMany({
      where: { id: pid, tripId, userId: scope.userId, appliedAt: null, discardedAt: null },
      data: { discardedAt: new Date() },
    });
    if (!count) return NextResponse.json({ error: 'Proposta não encontrada ou já decidida' }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  if (acao !== 'aplicar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  try {
    const feito = await aplicarProposta({ id: pid, tripId, userId: scope.userId, trip: access.trip });
    return NextResponse.json(feito);
  } catch (e) {
    if (e instanceof ErroProposta) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('Aplicar proposta error:', e);
    return NextResponse.json({ error: 'Erro ao aplicar a proposta' }, { status: 500 });
  }
}
