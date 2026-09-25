/**
 * O convite é a porta de entrada numa viagem de outra pessoa, e o `next` do
 * login é por onde o link do convite passa. Os dois precisam fechar sozinhos
 * a cada caso estranho.
 */
import { gerarConvite, hashToken, pareceToken, estadoDoConvite, CONVITE_DIAS } from '../src/lib/tripInvites.js';
import { destinoSeguro } from '../src/lib/safeNext.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- token ---
const agora = new Date('2026-09-26T12:00:00.000Z');
const c = gerarConvite(agora);
ok('token tem a forma esperada', pareceToken(c.token), true);
ok('banco guarda o hash, não o token', c.tokenHash === c.token, false);
ok('hash é do token', hashToken(c.token), c.tokenHash);
ok('hash é hex de 64', /^[0-9a-f]{64}$/.test(c.tokenHash), true);
ok('dois convites, dois tokens', gerarConvite(agora).token === c.token, false);
ok(`expira em ${CONVITE_DIAS} dias`, c.expiresAt.toISOString(), '2026-10-03T12:00:00.000Z');

ok('vazio não parece token', pareceToken(''), false);
ok('curto não parece token', pareceToken('abc'), false);
ok('com barra não parece token', pareceToken(`${c.token.slice(0, 42)}/`), false);
ok('não string não parece token', pareceToken(null), false);

// --- validade ---
const base = { usedAt: null, revokedAt: null, expiresAt: c.expiresAt };
ok('novo vale', estadoDoConvite(base, agora), 'valido');
ok('usado', estadoDoConvite({ ...base, usedAt: agora }, agora), 'usado');
ok('revogado', estadoDoConvite({ ...base, revokedAt: agora }, agora), 'revogado');
ok('revogado vence usado', estadoDoConvite({ ...base, usedAt: agora, revokedAt: agora }, agora), 'revogado');
ok('expira no instante exato', estadoDoConvite(base, c.expiresAt), 'expirado');
ok('um segundo antes ainda vale', estadoDoConvite(base, new Date(c.expiresAt.getTime() - 1000)), 'valido');
ok('inexistente', estadoDoConvite(null, agora), 'invalido');

// --- next do login ---
ok('caminho interno passa', destinoSeguro('/trips/invite/abc'), '/trips/invite/abc');
ok('mantém query', destinoSeguro('/transactions?month=9'), '/transactions?month=9');
ok('vazio vai para o início', destinoSeguro(''), '/');
ok('nulo vai para o início', destinoSeguro(null), '/');
ok('lista vai para o início', destinoSeguro(['/trips']), '/');
ok('outro domínio', destinoSeguro('https://evil.com'), '/');
ok('sem protocolo', destinoSeguro('//evil.com'), '/');
ok('barra invertida', destinoSeguro('/\\evil.com'), '/');
ok('javascript:', destinoSeguro('javascript:alert(1)'), '/');
ok('tab no meio', destinoSeguro('/\t/evil.com'), '/');
ok('quebra de linha', destinoSeguro('/\n/evil.com'), '/');
ok('relativo sem barra', destinoSeguro('evil.com'), '/');
// Resolvido, "/a/../../x" fica "/x": continua dentro
ok('pontos voltam para dentro', destinoSeguro('/a/../../trips'), '/trips');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
