/**
 * Chamadas aos serviços externos sem chave (RFC 0004). Todas passam por aqui
 * para mandar o mesmo User-Agent, que as regras de uso da Wikipedia, do
 * OpenStreetMap e do OSRM exigem, e para ter timeout: um serviço lento não
 * pode segurar a rota do app.
 */

// A Wikimedia exige um contato no User-Agent; sem ele, responde 429. O
// contato é a página pública do projeto, nunca o email de quem usa o app.
export const USER_AGENT = `FinControl/1.0 (app pessoal; ${process.env.APP_CONTATO_URL || 'https://github.com/DeangellyFigueiredo/fin-control'})`;

/**
 * No máximo 2 pedidos ao mesmo tempo para cada serviço. Uma tela com cinco
 * cidades dispara cinco buscas juntas, e rajada é o que faz a Wikimedia e o
 * OSRM bloquearem.
 */
const MAX_POR_HOST = 2;
const filas = new Map();

/**
 * OSRM e Nominatim públicos aceitam no máximo 1 pedido por segundo, somando
 * todos os usuários do app. Para esses, um pedido de cada vez e um intervalo
 * mínimo entre eles.
 */
const UM_POR_SEGUNDO = new Set(['router.project-osrm.org', 'nominatim.openstreetmap.org']);
const ultimoPedido = new Map();

async function naVez(host, fn) {
  if (!filas.has(host)) filas.set(host, { ativos: 0, espera: [] });
  const fila = filas.get(host);
  // A vaga passa direto de quem sai para quem espera: se fosse devolvida e
  // retomada, um pedido novo poderia entrar no meio e passar do limite
  if (fila.ativos >= MAX_POR_HOST) await new Promise(r => fila.espera.push(r));
  else fila.ativos++;
  try {
    return await fn();
  } finally {
    const proximo = fila.espera.shift();
    if (proximo) proximo();
    else fila.ativos--;
  }
}

export class ErroExterno extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

export function buscarJson(url, opcoes = {}) {
  const host = new URL(url).host;
  if (!UM_POR_SEGUNDO.has(host)) return naVez(host, () => buscarAgora(url, opcoes));

  // Encadeado: cada pedido espera o anterior terminar e mais 1,1 s
  const anterior = ultimoPedido.get(host) || Promise.resolve();
  const este = anterior.catch(() => {}).then(async () => {
    try {
      return await buscarAgora(url, opcoes);
    } finally {
      await new Promise(r => setTimeout(r, 1100));
    }
  });
  ultimoPedido.set(host, este.catch(() => {}));
  return este;
}

async function buscarAgora(url, { timeoutMs = 8000, headers = {}, fetchImpl = fetch } = {}) {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
      signal: controle.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ErroExterno(`${new URL(url).host} respondeu ${res.status}`, res.status);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ErroExterno(`${new URL(url).host} demorou demais`, 504);
    throw e;
  } finally {
    clearTimeout(t);
  }
}
