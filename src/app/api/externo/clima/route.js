import { NextResponse } from 'next/server';
import { getScope } from '@/lib/auth';
import { climaDoPeriodo } from '@/lib/externo/clima';
import { diaDe } from '@/lib/trips';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Clima de um período (RFC 0004): `?lat&lng&de&ate&hoje`. O `hoje` vem da
 * tela, como no resto do roteiro: é o dia de quem olha. Só para quem está
 * logado, e no máximo 60 dias por pedido.
 */
export async function GET(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const p = new URL(request.url).searchParams;
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const de = p.get('de') || '';
  const ate = p.get('ate') || '';
  const hoje = p.get('hoje') || '';

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'Coordenada inválida' }, { status: 400 });
  }
  if (![de, ate, hoje].every(d => ISO.test(d)) || diaDe(ate) < diaDe(de) || diaDe(ate) - diaDe(de) > 60) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 });
  }

  try {
    return NextResponse.json(await climaDoPeriodo({ lat, lng, de, ate, hoje }));
  } catch (error) {
    console.error('Clima error:', error.message);
    return NextResponse.json({ error: 'Clima indisponível agora' }, { status: 502 });
  }
}
