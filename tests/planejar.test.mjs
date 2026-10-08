/**
 * Conversa de planejamento (RFC 0004), sem rede: cliente da Anthropic simulado.
 */
import { instrucoes, mensagemDoUsuario, propostasPendentes, pedidoDePlanejamento, turnoDePlanejamento } from '../src/lib/ia/planejar.js';
import { situacaoDaProposta, RETORNO_PARA_IA } from '../src/lib/ia/propostas.js';
import { ErroIA } from '../src/lib/ia/sugestoes.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const trip = { name: 'Serra Gaúcha', startDate: d('2026-12-11'), endDate: d('2026-12-18'), travelerNotes: 'casal com cachorro' };

const sys = instrucoes({ trip, hojeISO: '2026-10-08' });
ok('instruções: data de hoje e viagem', [sys.includes('2026-10-08'), sys.includes('de 2026-12-11 a 2026-12-18'), sys.includes('casal com cachorro')], [true, true, true]);
ok('instruções: não inventar coordenadas', sys.includes('Nunca invente coordenadas'), true);

// O resultado da ferramenta vem antes do texto, e o texto nunca dentro dele
const msg = mensagemDoUsuario('deixa o dia 17 mais leve', { paradas: [] }, [{ id: 'tu1', situacao: RETORNO_PARA_IA.descartada }]);
ok('tool_result primeiro, texto depois', msg.map(b => b.type), ['tool_result', 'text']);
ok('roteiro atual vai na mensagem', msg[1].text.startsWith('<roteiro_atual>'), true);
ok('sem pendentes, só texto', mensagemDoUsuario('oi', {}, []).map(b => b.type), ['text']);
ok('pendentes da resposta', propostasPendentes([{ type: 'text' }, { type: 'tool_use', name: 'propor_mudancas', id: 'tu9' }, { type: 'tool_use', name: 'outra', id: 'x' }]), [{ id: 'tu9' }]);

const pedido = pedidoDePlanejamento({ system: sys, mensagens: [{ role: 'user', content: msg }] });
ok('planejar: Haiku 5.5, effort high, cache automático', [pedido.model, pedido.output_config.effort, pedido.cache_control.type], ['claude-haiku-5-5', 'high', 'ephemeral']);
ok('planejar: busca e proposta', pedido.tools.map(t => t.name), ['web_search', 'propor_mudancas']);

const uso = { input_tokens: 1000, output_tokens: 100 };
const cliente = (respostas) => {
  const pedidos = [];
  return { pedidos, messages: { create: async (p) => { pedidos.push(p); return respostas.shift(); } } };
};

{
  const c = cliente([
    { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_search' }], usage: uso },
    { stop_reason: 'tool_use', usage: uso, content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: 'Troquei o Mini Mundo por algo que aceita cachorro.' },
      { type: 'tool_use', name: 'propor_mudancas', id: 'tu2', input: { resumo: 'Troca o Mini Mundo', operacoes: [{ tipo: 'removeActivity', alvoId: 'a1', parada: null, atividade: null }] } },
    ] },
  ]);
  const t = await turnoDePlanejamento(c, pedido);
  ok('duas respostas guardadas (pausa e final)', t.respostas.length, 2);
  ok('continua a pausa com o turno do assistente', c.pedidos[1].messages.at(-1).role, 'assistant');
  ok('texto e proposta', [t.texto, t.proposta.toolUseId, t.proposta.operacoes.length], ['Troquei o Mini Mundo por algo que aceita cachorro.', 'tu2', 1]);
}

{
  const t = await turnoDePlanejamento(cliente([{ stop_reason: 'end_turn', usage: uso, content: [{ type: 'text', text: 'De onde vocês saem?' }] }]), pedido);
  ok('só pergunta, sem proposta', [t.texto, t.proposta], ['De onde vocês saem?', null]);
}

{
  let erro;
  try { await turnoDePlanejamento(cliente([{ stop_reason: 'refusal', usage: uso, content: [] }]), pedido); } catch (e) { erro = e; }
  ok('recusa leva o uso junto', [erro instanceof ErroIA, erro.usos.length], [true, 1]);
}

// --- situação da proposta ---
const p = (extra) => ({ appliedAt: null, discardedAt: null, expiresAt: d('2026-10-09'), baseVersion: 'v1', payload: { erros: [] }, ...extra });
const agora = d('2026-10-08');
ok('pendente', situacaoDaProposta(p(), 'v1', agora), 'pendente');
ok('aplicada', situacaoDaProposta(p({ appliedAt: agora }), 'v2', agora), 'aplicada');
ok('descartada', situacaoDaProposta(p({ discardedAt: agora }), 'v1', agora), 'descartada');
ok('expirada', situacaoDaProposta(p({ expiresAt: d('2026-10-07') }), 'v1', agora), 'expirada');
ok('com erros', situacaoDaProposta(p({ payload: { erros: [{}] } }), 'v1', agora), 'com-erros');
ok('roteiro mudou', situacaoDaProposta(p(), 'v2', agora), 'desatualizada');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
