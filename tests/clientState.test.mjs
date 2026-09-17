/**
 * O que fica guardado no navegador, e de quem é.
 *
 * O bug que isto guarda: o rascunho do passo a passo vivia numa chave só.
 * Quem saísse no meio do cadastro deixava apelido, saldo e contas para o
 * PRÓXIMO usuário daquele navegador, que abria o formulário já preenchido
 * com dados de outra pessoa.
 */
import {
  chaveDoRascunho, limparDadosDoUsuario,
  PREFIXO_RASCUNHO, CHAVE_PENDENCIAS, CHAVE_TEMA, CHAVE_ESCONDER,
} from '../src/lib/clientState.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// localStorage de mentira, já que isto roda fora do navegador
const loja = new Map();
globalThis.localStorage = {
  getItem: (k) => (loja.has(k) ? loja.get(k) : null),
  setItem: (k, v) => loja.set(k, String(v)),
  removeItem: (k) => loja.delete(k),
  get length() { return loja.size; },
};
Object.defineProperty(globalThis.localStorage, Symbol.iterator, { value: undefined });
// Object.keys(localStorage) precisa enxergar as chaves guardadas
const original = Object.keys;
Object.keys = (alvo) => (alvo === globalThis.localStorage ? [...loja.keys()] : original(alvo));

// --- a chave tem dono ---
ok('usuarios diferentes, chaves diferentes',
  chaveDoRascunho('alice') === chaveDoRascunho('bruno'), false);
ok('mesmo usuario, mesma chave',
  chaveDoRascunho('alice'), chaveDoRascunho('alice'));
ok('sem id nao colide com um id real',
  chaveDoRascunho(undefined) === chaveDoRascunho('alice'), false);
ok('a chave carrega o prefixo',
  chaveDoRascunho('alice').startsWith(PREFIXO_RASCUNHO), true);

// --- o cenario do bug ---
localStorage.setItem(chaveDoRascunho('alice'), JSON.stringify({ profile: { nickname: 'Alice' } }));
ok('o rascunho da Alice nao abre para o Bruno',
  localStorage.getItem(chaveDoRascunho('bruno')), null);

// --- sair limpa o que é da conta, e só isso ---
localStorage.setItem(chaveDoRascunho('bruno'), '{}');
localStorage.setItem(CHAVE_PENDENCIAS, '2026-09-17');
localStorage.setItem(CHAVE_TEMA, 'dark');
localStorage.setItem(CHAVE_ESCONDER, 'true');

limparDadosDoUsuario();

ok('rascunho da Alice apagado', localStorage.getItem(chaveDoRascunho('alice')), null);
ok('rascunho do Bruno apagado', localStorage.getItem(chaveDoRascunho('bruno')), null);
ok('marca de pendencias apagada', localStorage.getItem(CHAVE_PENDENCIAS), null);
// tema e esconder valores são do aparelho, não da conta: continuam
ok('tema preservado', localStorage.getItem(CHAVE_TEMA), 'dark');
ok('esconder valores preservado', localStorage.getItem(CHAVE_ESCONDER), 'true');

// --- armazenamento bloqueado nao derruba o logout ---
const antes = globalThis.localStorage;
globalThis.localStorage = { get length() { throw new Error('bloqueado'); } };
Object.keys = (alvo) => { if (alvo === globalThis.localStorage) throw new Error('bloqueado'); return original(alvo); };
let quebrou = false;
try { limparDadosDoUsuario(); } catch { quebrou = true; }
ok('modo privado nao derruba', quebrou, false);
globalThis.localStorage = antes;

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
