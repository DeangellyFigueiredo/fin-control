/**
 * IA e o que a cerca (RFC 0004), sem rede e sem gastar: o cliente da
 * Anthropic é simulado, e o DNS do og:image também.
 */
import { montarPedido, lerEntrega, validarSugestoes, gerarSugestoes, ErroIA, SCHEMA_SUGESTOES } from '../src/lib/ia/sugestoes.js';
import { custoEmUsd, somarUsos } from '../src/lib/ia/precos.js';
import { inicioDoDia, inicioDoMes, motivoDoBloqueio } from '../src/lib/ia/limites.js';
import { ipInterno, urlPublica, extrairOgImage, ogImageDe } from '../src/lib/externo/ogImage.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- o pedido ---
const pedido = montarPedido({
  cidade: 'Gramado', uf: 'RS', datas: { de: '2026-12-13', ate: '2026-12-16' },
  quemViaja: 'casal com cachorro pequeno', jaNoRoteiro: ['Lago Negro'], clima: { min: 15, max: 26 }, hojeISO: '2026-10-08',
});
ok('modelo Haiku 5.5', pedido.model, 'claude-haiku-5-5');
ok('effort explícito', pedido.output_config, { effort: 'medium' });
ok('busca na versão do Haiku, no máximo 5', [pedido.tools[0].type, pedido.tools[0].max_uses], ['web_search_20250305', 5]);
ok('ferramenta de entrega strict', [pedido.tools[1].name, pedido.tools[1].strict], ['entregar_sugestoes', true]);
ok('data de hoje nas instruções', pedido.system.includes('A data de hoje é 2026-10-08'), true);
ok('dados separados das instruções', pedido.messages[0].content.startsWith('<dados_da_viagem>'), true);
ok('sem temperature (400 no Haiku 5.5)', 'temperature' in pedido, false);
ok('schema: categorias do app', SCHEMA_SUGESTOES.properties.sugestoes.items.properties.category.enum,
  ['Transporte', 'Hospedagem', 'Alimentação', 'Passeios', 'Compras', 'Outros']);

// --- validação das sugestões ---
const boa = (extra = {}) => ({
  title: 'Mini Mundo', summary: 'Parque em miniatura.', category: 'Passeios', period: 'TARDE', pet: 'NAO',
  estimatedCost: 140.5, wikiTitle: 'Mini Mundo', officialUrl: 'https://minimundo.com.br', sources: ['https://minimundo.com.br/ingressos'], ...extra,
});
{
  const v = validarSugestoes([
    boa(),
    boa({ title: 'mini mundo' }),                           // repetida
    boa({ title: 'Lago Negro' }),                           // já no roteiro
    boa({ title: 'Snowland', category: 'Diversão' }),       // categoria inventada
    boa({ title: 'Sem fonte', sources: ['http://x.com'] }), // só http
    boa({ title: 'Florybal', officialUrl: 'javascript:alert(1)', estimatedCost: -5 }),
  ], ['Lago Negro']);
  ok('só as válidas passam', v.map(s => s.title), ['Mini Mundo', 'Florybal']);
  ok('link e custo ruins viram null', [v[1].officialUrl, v[1].estimatedCost], [null, null]);
}

// --- a chamada, com cliente simulado ---
const uso = (i, o, buscas = 0) => ({ input_tokens: i, output_tokens: o, server_tool_use: { web_search_requests: buscas } });
const clienteCom = (respostas) => {
  const pedidos = [];
  return { pedidos, messages: { create: async (p) => { pedidos.push(p); return respostas.shift(); } } };
};

{
  const c = clienteCom([
    { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_search' }], usage: uso(3000, 200, 3) },
    { stop_reason: 'tool_use', content: [
      { type: 'thinking', thinking: '' },
      { type: 'tool_use', name: 'entregar_sugestoes', input: { sugestoes: [boa()] } },
    ], usage: uso(5000, 900, 2) },
  ]);
  const r = await gerarSugestoes(c, pedido);
  ok('segue a pausa e lê a entrega', [r.lista.length, r.usos.length], [1, 2]);
  ok('devolve o turno pausado como veio', c.pedidos[1].messages.at(-1).role, 'assistant');
  ok('lê por tipo, mesmo com raciocínio antes', lerEntrega({ content: [{ type: 'thinking' }, { type: 'tool_use', name: 'entregar_sugestoes', input: { sugestoes: [] } }] }), []);
}

{
  const c = clienteCom([
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '1. Mini Mundo: parque em miniatura (https://minimundo.com.br)' }], usage: uso(4000, 500, 4) },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ sugestoes: [boa()] }) }], usage: uso(800, 300) },
  ]);
  const r = await gerarSugestoes(c, pedido);
  ok('sem a ferramenta: segunda chamada estruturada', [r.lista.length, c.pedidos[1].output_config.format.type, 'tools' in c.pedidos[1]], [1, 'json_schema', false]);
}

{
  const c = clienteCom([{ stop_reason: 'refusal', content: [], usage: uso(100, 0) }]);
  let erro = null;
  try { await gerarSugestoes(c, pedido); } catch (e) { erro = e; }
  ok('recusa vira ErroIA', [erro instanceof ErroIA, erro?.tipo], [true, 'recusa']);
}

// --- custo ---
ok('custo do Haiku 5.5 com buscas', custoEmUsd(uso(100_000, 10_000, 3)), 0.045);
ok('prompt acima de 100 mil: tabela de cima', custoEmUsd(uso(200_000, 0)), 0.1);
ok('cache lido a 0,1×', custoEmUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 100_000 }), 0.001);
// 0,0003 + 0,0001 + 3 buscas (0,03) e 0,0005 + 0,00045 + 2 buscas (0,02)
ok('soma de várias respostas', somarUsos([uso(3000, 200, 3), uso(5000, 900, 2)]).custo, 0.05135);

// --- limites, no horário de Brasília ---
ok('dia começa à meia-noite de Brasília', inicioDoDia(new Date('2026-10-09T02:30:00Z')).toISOString(), '2026-10-08T03:00:00.000Z');
ok('mês também', inicioDoMes(new Date('2026-11-01T01:00:00Z')).toISOString(), '2026-10-01T03:00:00.000Z');
const situacao = (extra) => ({ configurada: true, hoje: { chamadas: 3, limite: 30 }, mes: { custo: 1, teto: 10 }, ...extra });
ok('dentro dos limites', motivoDoBloqueio(situacao()), null);
ok('sem chave', motivoDoBloqueio(situacao({ configurada: false })).startsWith('IA não configurada'), true);
ok('limite do dia', motivoDoBloqueio(situacao({ hoje: { chamadas: 30, limite: 30 } })).includes('30 pedidos'), true);
ok('teto do mês', motivoDoBloqueio(situacao({ mes: { custo: 10.2, teto: 10 } })).includes('teto'), true);

// --- og:image e SSRF ---
ok('IPs internos', ['10.0.0.1', '127.0.0.1', '172.20.1.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1'].map(ipInterno).every(Boolean), true);
ok('IPs públicos', ['8.8.8.8', '172.32.0.1', '2001:4860:4860::8888'].map(ipInterno).some(Boolean), false);
const dns = (mapa) => async (host) => (mapa[host] || []).map(address => ({ address }));
const resolver = dns({ 'gramado.rs.gov.br': ['200.1.2.3'], 'interno.exemplo.com': ['10.0.0.5'] });
ok('https público passa', await urlPublica('https://gramado.rs.gov.br/turismo', resolver), true);
ok('http recusado', await urlPublica('http://gramado.rs.gov.br', resolver), false);
ok('porta diferente recusada', await urlPublica('https://gramado.rs.gov.br:8443/', resolver), false);
ok('nome que resolve para IP interno', await urlPublica('https://interno.exemplo.com/', resolver), false);
ok('IP de metadados direto', await urlPublica('https://169.254.169.254/latest', resolver), false);
ok('localhost', await urlPublica('https://localhost/', resolver), false);

ok('og:image com atributos em qualquer ordem e URL relativa',
  extrairOgImage('<head><meta content="/img/capa.jpg" property="og:image"></head>', 'https://gramado.rs.gov.br/turismo'),
  'https://gramado.rs.gov.br/img/capa.jpg');
ok('og:image http ignorada', extrairOgImage('<meta property="og:image" content="http://x.com/a.jpg">', 'https://x.com'), null);

{
  const respostas = {
    'https://gramado.rs.gov.br/': { status: 301, headers: { location: 'https://interno.exemplo.com/' } },
  };
  const fetchImpl = async (url) => {
    const r = respostas[url];
    return { status: r.status, ok: r.status < 300, headers: { get: (k) => r.headers[k] } };
  };
  ok('redirecionamento para IP interno é barrado', await ogImageDe('https://gramado.rs.gov.br/', { fetchImpl, resolver }), null);
}

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
