/**
 * Quanto custou uma chamada à IA, a partir do `usage` da resposta. Ver
 * docs/rfc/0004-roteiro-inteligente.md.
 *
 * Claude Haiku 5.5, em US$ por milhão de tokens, com duas tabelas pelo
 * tamanho do prompt (até 100 mil tokens, e acima). Leitura de cache sai a
 * 0,1× da entrada e escrita a 1,25×. A busca na web é cobrada por pesquisa,
 * à parte; o valor fica numa variável para acompanhar a tabela da Anthropic.
 */

export const MODELO = 'claude-haiku-5-5';

const TABELAS = {
  'claude-haiku-5-5': [
    { ateTokens: 100_000, entrada: 0.10, saida: 0.50 },
    { ateTokens: Infinity, entrada: 0.50, saida: 2.50 },
  ],
};

const CUSTO_BUSCA = Number(process.env.IA_CUSTO_BUSCA_USD ?? 0.01);

/** Tokens do prompt somando o que veio do cache: é isso que escolhe a tabela. */
export function tokensDoPrompt(u) {
  return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
}

export function custoEmUsd(usage, modelo = MODELO) {
  const tabela = TABELAS[modelo];
  if (!tabela || !usage) return 0;
  const faixa = tabela.find(t => tokensDoPrompt(usage) <= t.ateTokens);
  const porToken = (usd) => usd / 1_000_000;
  const tokens = (usage.input_tokens || 0) * porToken(faixa.entrada)
    + (usage.cache_creation_input_tokens || 0) * porToken(faixa.entrada) * 1.25
    + (usage.cache_read_input_tokens || 0) * porToken(faixa.entrada) * 0.1
    + (usage.output_tokens || 0) * porToken(faixa.saida);
  const buscas = (usage.server_tool_use?.web_search_requests || 0) * CUSTO_BUSCA;
  return Math.round((tokens + buscas) * 1e6) / 1e6;
}

/** Soma o uso de várias respostas (uma conversa com pausas tem várias). */
export function somarUsos(usos) {
  const total = {
    input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 0 },
  };
  let custo = 0;
  for (const u of usos) {
    if (!u) continue;
    total.input_tokens += u.input_tokens || 0;
    total.output_tokens += u.output_tokens || 0;
    total.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
    total.cache_read_input_tokens += u.cache_read_input_tokens || 0;
    total.server_tool_use.web_search_requests += u.server_tool_use?.web_search_requests || 0;
    // Cada resposta escolhe a sua tabela pelo próprio prompt
    custo += custoEmUsd(u);
  }
  return { usage: total, custo: Math.round(custo * 1e6) / 1e6 };
}
