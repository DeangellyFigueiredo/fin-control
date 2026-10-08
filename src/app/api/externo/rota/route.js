import { NextResponse } from 'next/server';
import { getScope } from '@/lib/auth';
import { rotaEntre } from '@/lib/externo/rota';

const ponto = (texto) => {
  const [lat, lng] = String(texto || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

/**
 * Rota de carro entre dois pontos (RFC 0004): `?de=lat,lng&para=lat,lng`,
 * com `&atualizar=1` para pedir de novo. Só para quem está logado.
 */
export async function GET(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const p = new URL(request.url).searchParams;
  const de = ponto(p.get('de'));
  const para = ponto(p.get('para'));
  if (!de || !para) return NextResponse.json({ error: 'Informe de e para como lat,lng' }, { status: 400 });

  try {
    return NextResponse.json(await rotaEntre(de, para, { atualizar: p.get('atualizar') === '1' }));
  } catch (error) {
    console.error('Rota error:', error.message);
    return NextResponse.json({ error: 'Serviço de rotas indisponível agora' }, { status: 502 });
  }
}
