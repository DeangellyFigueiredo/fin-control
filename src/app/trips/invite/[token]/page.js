import Link from 'next/link';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getScope } from '@/lib/auth';
import { hashToken, pareceToken, estadoDoConvite } from '@/lib/tripInvites';
import { formatDate } from '@/lib/utils';
import InviteResponse from '@/components/InviteResponse';

/**
 * Página do link de convite.
 *
 * Fica fora do grupo (dashboard) porque o layout de lá manda para /login sem
 * dizer de onde veio, e o convite se perderia no caminho. Aqui o redirect
 * leva o `next`, e a pessoa volta para cá depois de entrar.
 *
 * `no-referrer`: o token está na URL, e sem isso ele iria no cabeçalho
 * Referer de qualquer link externo clicado a partir desta página. O mesmo
 * vale como cabeçalho HTTP, em next.config.mjs.
 */
export const metadata = {
  title: 'Convite de viagem · FinControl',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

function Cartao({ children }) {
  return (
    <div className="login-page">
      <div className="card login-card animate-in">
        <div className="login-title">FinControl</div>
        {children}
      </div>
    </div>
  );
}

function Invalido() {
  return (
    <Cartao>
      <div className="login-subtitle">Convite inválido ou expirado</div>
      <p className="invite-text">
        Peça um link novo a quem te convidou. Cada link vale uma vez e por 7 dias.
      </p>
      <Link href="/" className="btn btn-secondary">Ir para o início</Link>
    </Cartao>
  );
}

export default async function InvitePage({ params }) {
  const { token } = await params;

  // Nem a forma de um token: não há o que buscar, e não vale redirecionar
  // levando lixo da URL para o login.
  if (!pareceToken(token)) return <Invalido />;

  const scope = await getScope();
  if (!scope) redirect(`/login?next=${encodeURIComponent(`/trips/invite/${token}`)}`);

  const invite = await prisma.tripInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      trip: { select: { id: true, name: true, startDate: true, endDate: true } },
      createdBy: { select: { name: true, nickname: true } },
    },
  });

  if (invite) {
    const jaParticipa = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId: invite.tripId, userId: scope.userId } },
      select: { id: true },
    });
    if (jaParticipa) {
      return (
        <Cartao>
          <div className="login-subtitle">Você já participa de {invite.trip.name}</div>
          <Link href={`/trips/${invite.tripId}`} className="btn btn-primary">Abrir a viagem</Link>
        </Cartao>
      );
    }
  }

  // Usado, revogado e expirado são o mesmo aviso: o motivo não muda o que a
  // pessoa precisa fazer, que é pedir outro link.
  if (estadoDoConvite(invite) !== 'valido') return <Invalido />;

  const quem = invite.createdBy?.nickname || invite.createdBy?.name || 'Alguém';

  return (
    <Cartao>
      <div className="login-subtitle">{quem} te convidou para uma viagem</div>
      <div className="invite-trip">
        <div className="invite-trip-name">{invite.trip.name}</div>
        <div className="invite-trip-dates">
          {formatDate(invite.trip.startDate)} a {formatDate(invite.trip.endDate)}
        </div>
      </div>
      <p className="invite-text">
        Vocês vão ver os gastos um do outro nesta viagem e lançar juntos. Suas
        contas, cartões e o resto do seu extrato continuam só seus.
      </p>
      <InviteResponse token={token} />
    </Cartao>
  );
}
