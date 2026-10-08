import { NextResponse } from 'next/server';
import { getScope } from '@/lib/auth';
import { coordenadaDaCidade } from '@/lib/externo/cidade';

/**
 * Coordenada de uma cidade (RFC 0004): `?nome=&uf=`. O formulário de parada
 * chama ao clicar em "Buscar", nunca enquanto se digita (regra do Nominatim).
 */
export async function GET(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const p = new URL(request.url).searchParams;
  const nome = (p.get('nome') || '').trim();
  const uf = (p.get('uf') || '').trim();
  if (!nome || nome.length > 80 || uf.length > 2) return NextResponse.json({ error: 'Informe a cidade' }, { status: 400 });

  try {
    return NextResponse.json(await coordenadaDaCidade(nome, uf));
  } catch (error) {
    console.error('Cidade error:', error.message);
    return NextResponse.json({ error: 'Busca de cidade indisponível agora' }, { status: 502 });
  }
}
