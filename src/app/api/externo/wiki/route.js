import { NextResponse } from 'next/server';
import { getScope } from '@/lib/auth';
import { buscarJson } from '@/lib/externo/http';
import { comCache, DIA_MS } from '@/lib/externo/cache';
import { paginaWiki, buscarWiki } from '@/lib/externo/wiki';

/**
 * Foto e resumo da Wikipedia (RFC 0004). `?titulo=` traz uma página;
 * `?busca=` procura por texto. Só para quem está logado, e só esses dois
 * parâmetros: não é um proxy aberto para a Wikipedia.
 */
export async function GET(request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const titulo = (searchParams.get('titulo') || '').trim();
  const busca = (searchParams.get('busca') || '').trim();
  if (!titulo && !busca) return NextResponse.json({ error: 'Informe titulo ou busca' }, { status: 400 });
  if ((titulo || busca).length > 120) return NextResponse.json({ error: 'Texto longo demais' }, { status: 400 });

  try {
    if (titulo) {
      const pagina = await comCache(`wiki:pagina:${titulo.toLowerCase()}`, 30 * DIA_MS, () => paginaWiki(titulo, buscarJson));
      return NextResponse.json(pagina);
    }
    const resultados = await comCache(`wiki:busca:${busca.toLowerCase()}`, 30 * DIA_MS,
      async () => ({ paginas: await buscarWiki(busca, buscarJson) }));
    return NextResponse.json(resultados);
  } catch (error) {
    console.error('Wiki error:', error.message);
    return NextResponse.json({ error: 'Wikipedia indisponível agora' }, { status: 502 });
  }
}
