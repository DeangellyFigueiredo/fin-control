/**
 * Fotos e resumos da Wikipedia em português, com crédito do Commons. Sem
 * chave. Ver docs/rfc/0004-roteiro-inteligente.md.
 *
 * O app guarda e mostra a URL; nunca baixa a imagem. A miniatura vem com
 * 800 px de largura (o original pode ter vários MB), e o crédito (autor e
 * licença) acompanha a foto sempre, como a licença exige.
 *
 * As funções de rede recebem `buscar` por parâmetro, para os testes rodarem
 * sem rede; a rota passa o buscarJson de verdade.
 */

const WIKI = 'https://pt.wikipedia.org';
const COMMONS = 'https://commons.wikimedia.org';
const LARGURA = 800;

/**
 * Nome do arquivo e onde ele mora, a partir da URL da imagem. Aceita o
 * original (`/commons/a/a7/Arquivo.jpg`) e a miniatura
 * (`/commons/thumb/a/a7/Arquivo.jpg/800px-Arquivo.jpg`).
 */
export function arquivoDaImagem(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)wikimedia\.org$/.test(u.hostname)) return null;
    const partes = u.pathname.split('/').filter(Boolean);
    // wikipedia/<projeto>/[thumb/]<x>/<xy>/<Arquivo>[/<miniatura>]
    if (partes[0] !== 'wikipedia' || partes.length < 5) return null;
    const projeto = partes[1];
    const miniatura = partes[2] === 'thumb';
    const nome = decodeURIComponent(miniatura ? partes[5] : partes[4]);
    if (!nome) return null;
    return { nome, api: projeto === 'commons' ? COMMONS : `https://${projeto}.wikipedia.org` };
  } catch {
    return null;
  }
}

const semHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** "Autor · Licença", a partir do extmetadata do Commons. */
export function creditoDaImagem(extmetadata = {}) {
  const autor = semHtml(extmetadata.Artist?.value).slice(0, 80);
  const licenca = semHtml(extmetadata.LicenseShortName?.value).slice(0, 40);
  return [autor, licenca].filter(Boolean).join(' · ') || 'Wikimedia Commons';
}

/** Detalhes de uma imagem: miniatura, crédito e a página do arquivo. */
export async function detalhesDaImagem(url, buscar) {
  const arq = arquivoDaImagem(url);
  if (!arq) return { url, credito: null, fonte: null };
  const q = new URLSearchParams({
    action: 'query', format: 'json', titles: `File:${arq.nome}`,
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(LARGURA),
  });
  const j = await buscar(`${arq.api}/w/api.php?${q}`);
  const info = j && Object.values(j.query?.pages || {})[0]?.imageinfo?.[0];
  if (!info) return { url, credito: null, fonte: null };
  return {
    url: info.thumburl || info.url || url,
    credito: creditoDaImagem(info.extmetadata),
    fonte: info.descriptionurl || null,
  };
}

/**
 * Página da Wikipedia: título certo, resumo, link e foto com crédito.
 * Página que não existe vira `{ encontrado: false }`.
 */
export async function paginaWiki(titulo, buscar) {
  const j = await buscar(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(titulo.replace(/ /g, '_'))}?redirect=true`);
  if (!j || j.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' || !j.title) {
    return { encontrado: false, titulo };
  }
  // Página de desambiguação não descreve um lugar
  if (j.type === 'disambiguation') return { encontrado: false, titulo };

  const original = j.originalimage?.source || j.thumbnail?.source || null;
  const foto = original ? await detalhesDaImagem(original, buscar) : null;
  return {
    encontrado: true,
    titulo: j.title,
    resumo: String(j.extract || '').slice(0, 600),
    url: j.content_urls?.desktop?.page || `${WIKI}/wiki/${encodeURIComponent(j.title)}`,
    foto: foto && { url: foto.url, credito: foto.credito, fonte: foto.fonte || j.content_urls?.desktop?.page },
  };
}

/**
 * Busca por texto livre, num pedido só: a API devolve título, resumo e
 * miniatura juntos. O crédito da foto fica para quando ela for mostrada de
 * verdade (paginaWiki), para não pedir ao Commons uma vez por resultado.
 */
export async function buscarWiki(texto, buscar, limite = 5) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrsearch: texto, gsrlimit: String(limite),
    prop: 'pageimages|extracts|info', piprop: 'thumbnail', pithumbsize: String(LARGURA),
    exintro: '1', explaintext: '1', exsentences: '3', exlimit: String(limite), inprop: 'url',
  });
  const j = await buscar(`${WIKI}/w/api.php?${q}`);
  const paginas = j?.query?.pages || [];
  return paginas
    .filter(p => !p.missing && !/\(desambiguação\)$/i.test(p.title))
    .sort((a, b) => a.index - b.index)
    .map(p => ({
      encontrado: true,
      titulo: p.title,
      resumo: String(p.extract || '').slice(0, 600),
      url: p.fullurl || `${WIKI}/wiki/${encodeURIComponent(p.title)}`,
      // Sem crédito ainda: quem for mostrar pede a página inteira
      miniatura: p.thumbnail?.source || null,
    }));
}
