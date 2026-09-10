import { redirect } from 'next/navigation';
import { userDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import OnboardingWizard from '@/components/OnboardingWizard';

export const metadata = { title: 'Primeiros passos · FinControl' };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const db = userDb(session.userId);

  const [user, accounts, cards, recurring, goals] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId } }),
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

  return <OnboardingWizard initialData={initialData} isRedo={Boolean(user.onboardedAt)} />;
}
