import { NextResponse } from 'next/server';
import { getScope } from '@/lib/auth';
import { tripAccess } from '@/lib/tripAccess';
import { situacaoDeUso } from '@/lib/ia/limites';

/** Se a IA está ligada e quanto já foi usado: hoje, no mês e nesta viagem. */
export async function GET(request, { params }) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const access = await tripAccess(scope.userId, id);
  if (!access) return NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });
  return NextResponse.json(await situacaoDeUso(scope.userId, id));
}
