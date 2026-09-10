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
