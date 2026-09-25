import { randomBytes, createHash } from 'crypto';

/**
 * Convite de viagem: o token e as regras de validade. Ver docs/rfc/0002-viagens.md.
 *
 * O token tem 32 bytes aleatórios — adivinhar um é inviável — e só existe no
 * link. O banco guarda o SHA-256 dele, então quem ler a tabela não monta um
 * link que funcione. Hash simples, sem bcrypt: o que torna o token difícil de
 * achar é a aleatoriedade, não o custo do hash, e a busca precisa ser por
 * igualdade no índice.
 */

export const CONVITE_DIAS = 7;

/** Formato do token em base64url: 32 bytes viram 43 caracteres. */
const FORMATO = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function gerarConvite(agora = new Date()) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(agora.getTime() + CONVITE_DIAS * 86400000),
  };
}

/** Descarta de cara o que nem tem a forma de um token, sem ir ao banco. */
export const pareceToken = (token) => typeof token === 'string' && FORMATO.test(token);

/**
 * Filtro de convite ainda utilizável. É a mesma condição no `updateMany` que
 * consome o convite: com ela no WHERE, dois aceites ao mesmo tempo não passam
 * os dois — o segundo encontra `usedAt` preenchido e recebe count 0.
 */
export const condicaoDeValido = (agora = new Date()) => ({
  usedAt: null,
  revokedAt: null,
  expiresAt: { gt: agora },
});

/** A mesma regra, lida sobre um convite já carregado, para a tela. */
export function estadoDoConvite(invite, agora = new Date()) {
  if (!invite) return 'invalido';
  if (invite.revokedAt) return 'revogado';
  if (invite.usedAt) return 'usado';
  if (new Date(invite.expiresAt) <= agora) return 'expirado';
  return 'valido';
}
