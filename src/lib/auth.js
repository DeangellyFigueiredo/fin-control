import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const TOKEN_NAME = 'fin-token';

/**
 * O segredo é resolvido a cada uso, e nunca cai num valor embutido em
 * produção: como o repositório é público, um fallback fixo permitiria a
 * qualquer pessoa forjar um cookie de sessão válido caso a variável não
 * estivesse configurada (num Preview da Vercel, por exemplo).
 */
function getSecret() {
  const value = process.env.JWT_SECRET;

  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET não está configurado. Defina a variável de ambiente antes de autenticar.',
      );
    }
    return 'dev-only-insecure-secret';
  }

  return value;
}

const encodedSecret = () => new TextEncoder().encode(getSecret());

export async function signToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(encodedSecret());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, encodedSecret());
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) return null;
  return await verifyToken(token);
}

/**
 * Usuário + carteira ativa, que é o que toda rota precisa.
 *
 * A carteira viaja DENTRO do token assinado, não num cookie separado, por
 * dois motivos. Segurança: cookie solto é editável pelo cliente, e bastaria
 * trocar o valor para tentar ler a carteira de outra pessoa — dentro do JWT
 * ele é lacrado. Velocidade: a ida até o Neon custa uns 350ms, e resolver a
 * carteira a cada requisição colocaria isso em todo endpoint.
 *
 * O preço é que trocar de carteira exige reassinar o token, o que a rota
 * `/api/wallets/switch` faz.
 *
 * Devolve null quando não há sessão. Quando o token é anterior às carteiras,
 * resolve a padrão no banco — uma consulta, só enquanto os tokens antigos
 * não expiram.
 */
export async function getScope() {
  const session = await getSession();
  if (!session?.userId) return null;

  if (session.walletId) {
    return { userId: session.userId, walletId: session.walletId, session };
  }

  const { default: prisma } = await import('./prisma.js');
  const wallet = await prisma.wallet.findFirst({
    where: { userId: session.userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });

  if (!wallet) return null;
  return { userId: session.userId, walletId: wallet.id, session };
}

export async function setSessionCookie(token) {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_NAME);
}
