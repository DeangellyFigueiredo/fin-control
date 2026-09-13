import { NextResponse } from 'next/server';
import { walletsOf } from '@/lib/db';
import { getSession, signToken, setSessionCookie } from '@/lib/auth';

/**
 * Troca a carteira ativa.
 *
 * A carteira viaja dentro do token assinado, então mudar de carteira é
 * reassinar o token. Parece indireto, mas é o que garante as duas coisas que
 * importam: o cliente não consegue forjar a carteira de outra pessoa, e
 * nenhuma requisição paga uma consulta a mais para descobrir onde está.
 *
 * O dono é conferido AQUI, uma vez, antes de assinar. Depois disso o valor
 * dentro do token é confiável por construção.
 */
export async function POST(request) {
  const session = await getSession();
  if (!session?.userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { walletId } = await request.json();
    if (!walletId) return NextResponse.json({ error: 'Escolha a carteira' }, { status: 400 });

    const wallet = await walletsOf(session.userId).findFirst({ where: { id: walletId } });
    if (!wallet) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 });

    const token = await signToken({
      userId: session.userId,
      email: session.email,
      walletId: wallet.id,
    });
    await setSessionCookie(token);

    return NextResponse.json({ success: true, wallet });
  } catch (error) {
    console.error('Switch wallet error:', error);
    return NextResponse.json({ error: 'Erro ao trocar de carteira' }, { status: 500 });
  }
}
