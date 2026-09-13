import { getScope } from '@/lib/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import Sidebar from '@/components/Sidebar';
import QuickAdd from '@/components/QuickAdd';

export default async function AuthLayout({ children }) {
  const scope = await getScope();
  if (!scope) redirect('/login');

  const [user, wallets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: scope.userId },
      select: { nickname: true, name: true, onboardedAt: true },
    }),
    prisma.wallet.findMany({
      where: { userId: scope.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    }),
  ]);

  // Primeiro acesso: manda para o passo a passo antes de usar o app.
  if (user && !user.onboardedAt) redirect('/onboarding');

  return (
    <div className="app-layout">
      <Sidebar
        userName={user?.nickname || user?.name || ''}
        wallets={wallets}
        activeWalletId={scope.walletId}
      />
      <main className="main-content">
        {children}
      </main>

      {/* Botão de lançar e barra inferior do celular */}
      <QuickAdd />
    </div>
  );
}
