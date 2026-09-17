import { redirect } from 'next/navigation';
import { userDb } from '@/lib/db';
import { getScope } from '@/lib/auth';
import OnboardingWizard from '@/components/OnboardingWizard';

export const metadata = { title: 'Primeiros passos · FinControl' };

export default async function OnboardingPage() {
  const scope = await getScope();
  if (!scope) redirect('/login');

  const db = userDb(scope.userId, scope.walletId);

  const [user, accounts, cards, recurring, goals] = await Promise.all([
    db.user.findUnique({ where: { id: scope.userId } }),
    db.bankAccount.findMany({ orderBy: { name: 'asc' } }),
    db.creditCard.findMany({ orderBy: { name: 'asc' } }),
    db.recurringEntry.findMany({ orderBy: [{ type: 'asc' }, { dayOfMonth: 'asc' }] }),
    db.financialGoal.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  if (!user) redirect('/login');

  // Datas viram string para atravessar a fronteira servidor → cliente.
  const initialData = {
    profile: {
      nickname: user.nickname || user.name || '',
      financialStatus: user.financialStatus || '',
      savings: user.savings || 0,
    },
    accounts,
    cards,
    recurring,
    goals: goals.map(g => ({ ...g, targetDate: g.targetDate ? g.targetDate.toISOString() : null })),
  };

  return (
    <OnboardingWizard
      initialData={initialData}
      isRedo={Boolean(user.onboardedAt)}
      userId={scope.userId}
    />
  );
}
