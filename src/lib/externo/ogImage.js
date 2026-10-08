import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { USER_AGENT } from './http.js';

/**
 * Imagem de capa (`og:image`) da página oficial de um lugar sugerido pela IA.
 * Ver docs/rfc/0004-roteiro-inteligente.md.
 *
 * É o servidor buscando uma URL que veio de fora (da resposta da IA, que veio
 * da web), então há proteção contra SSRF: só https na porta padrão, DNS
 * resolvido e IP interno recusado, redirecionamento checado de novo a cada
 * salto, tempo e tamanho limitados, e só o <head> é lido.
 *
 * Limite conhecido: entre a checagem do DNS e a conexão, o nome pode resolver
 * para outro IP (DNS rebinding). Para o que se busca aqui (uma meta tag de
 * página pública, sem credencial nenhuma no pedido), o risco é aceito.
 */

const MAX_BYTES = 256 * 1024;
const MAX_SALTOS = 3;
const TIMEOUT_MS = 5000;

/** IP que não pode ser destino: rede interna, loopback, link-local, metadados de nuvem. */
export function ipInterno(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
      || (a === 100 && b >= 64 && b <= 127)
      || a >= 224;
  }
  if (isIP(ip) === 6) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true;
    const v4 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return ipInterno(v4[1]);
    return false;
  }
  return true;
}

/** A URL pode ser buscada? Só https, porta padrão, sem usuário/senha, host público. */
export async function urlPublica(texto, resolver = lookup) {
  let u;
  try { u = new URL(texto); } catch { return false; }
  if (u.protocol !== 'https:' || (u.port && u.port !== '443') || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return !ipInterno(host);
  if (host === 'localhost' || !host.includes('.')) return false;
  try {
    const enderecos = await resolver(host, { all: true });
    return enderecos.length > 0 && enderecos.every(e => !ipInterno(e.address));
  } catch {
    return false;
  }
}

/** A og:image do HTML, resolvida contra a URL da página. Só https. */
export function extrairOgImage(html, base) {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metas) {
    const prop = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (prop !== 'og:image' && prop !== 'og:image:secure_url' && prop !== 'twitter:image') continue;
    const conteudo = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!conteudo) continue;
    try {
      const url = new URL(conteudo.replace(/&amp;/g, '&'), base);
      if (url.protocol === 'https:') return url.toString();
    } catch { /* tenta a próxima */ }
  }
  return null;
}

async function lerCabeca(res) {
  const leitor = res.body?.getReader();
  if (!leitor) return '';
  const decoder = new TextDecoder();
  let html = '';
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await leitor.read();
    if (done) break;
    bytes += value.length;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  leitor.cancel().catch(() => {});
  return html;
}

/** `{ url, fonte }` da imagem de capa, ou null. Nunca lança. */
export async function ogImageDe(pagina, { fetchImpl = fetch, resolver = lookup } = {}) {
  let atual = pagina;
  try {
    for (let salto = 0; salto <= MAX_SALTOS; salto++) {
      if (!(await urlPublica(atual, resolver))) return null;
      const controle = new AbortController();
      const t = setTimeout(() => controle.abort(), TIMEOUT_MS);
      let res;
      try {
        res = await fetchImpl(atual, {
          redirect: 'manual',
          signal: controle.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        });
      } finally {
        clearTimeout(t);
      }
      if (res.status >= 300 && res.status < 400) {
        const destino = res.headers.get('location');
        if (!destino) return null;
        atual = new URL(destino, atual).toString();
        continue;
      }
      if (!res.ok || !String(res.headers.get('content-type') || '').includes('text/html')) return null;
      const imagem = extrairOgImage(await lerCabeca(res), atual);
      return imagem ? { url: imagem, fonte: atual } : null;
    }
    return null;
  } catch {
    return null;
  }
}
