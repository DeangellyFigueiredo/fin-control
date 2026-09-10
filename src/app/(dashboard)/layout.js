import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import Sidebar from '@/components/Sidebar';
import QuickAdd from '@/components/QuickAdd';

export default async function AuthLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { nickname: true, name: true, onboardedAt: true },
  });

  // Primeiro acesso: manda para o passo a passo antes de usar o app.
  if (user && !user.onboardedAt) redirect('/onboarding');

  return (
    <div className="app-layout">
      <Sidebar userName={user?.nickname || user?.name || ''} />
      <main className="main-content">
        {children}
      </main>

      {/* Botão de lançar e barra inferior do celular */}
      <QuickAdd />
    </div>
  );
}
