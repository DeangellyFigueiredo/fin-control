/**
 * Para onde ir depois do login, quando a URL pede (`/login?next=...`).
 *
 * Aceitar qualquer valor faria do login um redirecionador aberto: um link
 * `/login?next=https://site-falso` com a cara do app levaria a pessoa, recém
 * logada e confiante, para outro lugar. Por isso só passa caminho interno.
 *
 * `//site` e `/\site` são as armadilhas clássicas: parecem caminho, mas o
 * navegador lê como endereço de outro domínio. Em vez de listar truques, a
 * regra final é resolver contra uma origem fictícia e exigir que ela não mude.
 */
export function destinoSeguro(next) {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.includes('\\')) return '/';
  // Caractere de controle (tab, quebra de linha) o navegador descarta ao
  // montar a URL, e "/\t/site" viraria "//site"
  if (/[\u0000-\u001f\u007f]/.test(next)) return '/';

  try {
    const base = 'http://app.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}
