'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/utils';
import {
  FINANCIAL_STATUS, GOAL_SUGGESTIONS,
  FIXED_EXPENSE_SUGGESTIONS, INCOME_SUGGESTIONS,
} from '@/lib/defaults';

const DRAFT_KEY = 'fincontrol:onboarding-draft';

let keyCounter = 0;
const newKey = () => `k${Date.now()}-${keyCounter++}`;

const emptyAccount = () => ({ key: newKey(), name: '', icon: '🏦', color: '#6c5ce7', initialBalance: '' });
const emptyIncome = () => ({ key: newKey(), name: '', amount: '', dayOfMonth: '', accountKey: '', categoryName: 'Salário' });
const emptyCard = () => ({ key: newKey(), name: '', icon: '💳', color: '#6c5ce7', paymentDay: '', openingDay: '', estimatedAmount: '', limitAmount: '', accountKey: '' });
const emptyExpense = () => ({ key: newKey(), name: '', amount: '', dayOfMonth: '', accountKey: '', categoryName: 'Moradia' });
const emptyGoal = () => ({ key: newKey(), name: '', type: 'OUTRO', targetAmount: '', currentAmount: '', targetDate: '', monthlyContribution: '' });

const STEPS = [
  { id: 'nome', title: 'Como podemos te chamar?' },
  { id: 'situacao', title: 'Como você está financeiramente?' },
  { id: 'contas', title: 'Onde fica o seu dinheiro?' },
  { id: 'guardado', title: 'Quanto você já tem guardado?' },
  { id: 'metas', title: 'O que você quer conquistar?' },
  { id: 'entradas', title: 'Quanto entra por mês?' },
  { id: 'cartoes', title: 'Seus cartões de crédito' },
  { id: 'fixas', title: 'Contas fixas do mês' },
  { id: 'resumo', title: 'Tudo certo?' },
];

export default function OnboardingWizard({ initialData, isRedo }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [profile, setProfile] = useState({
    nickname: initialData.profile.nickname || '',
    financialStatus: initialData.profile.financialStatus || '',
    savings: initialData.profile.savings ? String(initialData.profile.savings) : '',
  });

  const [accounts, setAccounts] = useState(() =>
    initialData.accounts.length
      ? initialData.accounts.map(a => ({
          key: a.id, id: a.id, name: a.name, icon: a.icon, color: a.color,
          initialBalance: String(a.initialBalance ?? ''),
        }))
      : [emptyAccount()],
  );

  const [goals, setGoals] = useState(() =>
    initialData.goals.map(g => ({
      key: g.id, id: g.id, name: g.name, type: g.type,
      targetAmount: String(g.targetAmount ?? ''),
      currentAmount: String(g.currentAmount ?? ''),
      targetDate: g.targetDate ? g.targetDate.slice(0, 10) : '',
      monthlyContribution: String(g.monthlyContribution ?? ''),
    })),
  );

  const [incomes, setIncomes] = useState(() => {
    const existing = initialData.recurring.filter(r => r.type === 'INCOME');
    return existing.length
      ? existing.map(r => ({
          key: r.id, id: r.id, name: r.name, amount: String(r.amount),
          dayOfMonth: String(r.dayOfMonth), accountKey: r.bankAccountId || '', categoryName: '',
        }))
      : [emptyIncome()];
  });

  const [cards, setCards] = useState(() =>
    initialData.cards.map(c => ({
      key: c.id, id: c.id, name: c.name, icon: c.icon, color: c.color,
      paymentDay: String(c.paymentDay), openingDay: String(c.openingDay),
      estimatedAmount: String(c.estimatedAmount ?? ''), limitAmount: String(c.limitAmount ?? ''),
      accountKey: c.bankAccountId || '',
    })),
  );

  const [fixedExpenses, setFixedExpenses] = useState(() => {
    const existing = initialData.recurring.filter(r => r.type === 'EXPENSE');
    return existing.map(r => ({
      key: r.id, id: r.id, name: r.name, amount: String(r.amount),
      dayOfMonth: String(r.dayOfMonth), accountKey: r.bankAccountId || '', categoryName: '',
    }));
  });

  // Rascunho local: recarregar a página no meio não perde o que foi digitado.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.profile) setProfile(draft.profile);
      if (draft.accounts?.length) setAccounts(draft.accounts);
      if (draft.goals) setGoals(draft.goals);
      if (draft.incomes?.length) setIncomes(draft.incomes);
      if (draft.cards) setCards(draft.cards);
      if (draft.fixedExpenses) setFixedExpenses(draft.fixedExpenses);
      if (typeof draft.step === 'number') setStep(draft.step);
    } catch {
      /* rascunho corrompido é ignorado de propósito */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        profile, accounts, goals, incomes, cards, fixedExpenses, step,
      }));
    } catch {
      /* sem espaço ou modo privado: seguir sem rascunho */
    }
  }, [profile, accounts, goals, incomes, cards, fixedExpenses, step]);

  const totals = useMemo(() => {
    const sum = (rows, field) => rows.reduce((s, r) => s + (parseFloat(r[field]) || 0), 0);
    const income = sum(incomes, 'amount');
    const fixed = sum(fixedExpenses, 'amount');
    const cardBills = sum(cards, 'estimatedAmount');
    const outflow = fixed + cardBills;
    const savings = parseFloat(profile.savings) || 0;

    return {
      income, fixed, cardBills, outflow,
      leftover: income - outflow,
      accountsBalance: sum(accounts, 'initialBalance'),
      monthsOfRunway: outflow > 0 ? savings / outflow : 0,
    };
  }, [incomes, fixedExpenses, cards, accounts, profile.savings]);

  // Atualização imutável de uma linha, por chave.
  const rowUpdater = (setter) => (key, changes) =>
    setter(rows => rows.map(r => (r.key === key ? { ...r, ...changes } : r)));

  const updateAccount = rowUpdater(setAccounts);
  const updateGoal = rowUpdater(setGoals);
  const updateIncome = rowUpdater(setIncomes);
  const updateCard = rowUpdater(setCards);
  const updateExpense = rowUpdater(setFixedExpenses);

  const canAdvance = step !== 0 || (profile.nickname || '').trim().length > 0;
  const isLast = step === STEPS.length - 1;

  const go = (delta) => {
    setError('');
    setStep(s => Math.min(Math.max(s + delta, 0), STEPS.length - 1));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setError('');

    const clean = (rows) => rows.filter(r => r.name?.trim());

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        accounts: clean(accounts),
        incomes: clean(incomes),
        cards: clean(cards),
        fixedExpenses: clean(fixedExpenses),
        goals: clean(goals),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || 'Não foi possível salvar');
      setSaving(false);
      return;
    }

    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignorado */ }
    router.push('/');
    router.refresh();
  }, [profile, accounts, incomes, cards, fixedExpenses, goals, router]);

  const current = STEPS[step];
  const accountOptions = accounts.filter(a => (a.name || '').trim());

  return (
    <div className="onb">
      <div className="onb-shell">
        <header className="onb-head">
          <div className="onb-brand">FinControl</div>
          <div className="onb-progress-text">Passo {step + 1} de {STEPS.length}</div>
        </header>

        <div className="onb-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          <div className="onb-progress-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <main className="onb-body">
          <h1 className="onb-title">{current.title}</h1>

          {error && <div className="login-error" style={{ marginBottom: 18 }}>{error}</div>}

          {current.id === 'nome' && (
            <>
              <p className="onb-hint">
                {isRedo
                  ? 'Você pode ajustar tudo o que já cadastrou por aqui.'
                  : 'Vamos montar seu controle financeiro em alguns passos. Dá para pular o que não souber agora e completar depois.'}
              </p>
              <div className="form-group onb-field">
                <label className="form-label">Seu nome ou apelido</label>
                <input
                  className="form-input onb-input-lg"
                  value={profile.nickname}
                  onChange={e => setProfile({ ...profile, nickname: e.target.value })}
                  placeholder="Ex.: Deangelly"
                  autoFocus
                />
              </div>
            </>
          )}

          {current.id === 'situacao' && (
            <>
              <p className="onb-hint">Não tem resposta certa — isso só ajusta as sugestões que o app te dá.</p>
              <div className="onb-choices">
                {FINANCIAL_STATUS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`onb-choice ${profile.financialStatus === opt.id ? 'active' : ''}`}
                    onClick={() => setProfile({ ...profile, financialStatus: opt.id })}
                  >
                    <span className="onb-choice-icon">{opt.icon}</span>
                    <span className="onb-choice-label">{opt.label}</span>
                    <span className="onb-choice-hint">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {current.id === 'contas' && (
            <>
              <p className="onb-hint">
                Onde o dinheiro fica no dia a dia. O saldo informado vira o ponto de partida do app.
              </p>
              <RowList
                rows={accounts}
                onAdd={() => setAccounts([...accounts, emptyAccount()])}
                onRemove={(key) => setAccounts(accounts.filter(a => a.key !== key))}
                onChange={updateAccount}
                addLabel="+ Adicionar conta"
                allowRemoveSaved={false}
                render={(row, update) => (
                  <>
                    <div className="form-group onb-col-icon">
                      <label className="form-label">Ícone</label>
                      <input className="form-input" maxLength={2} value={row.icon} onChange={e => update({ icon: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-grow">
                      <label className="form-label">Banco</label>
                      <input className="form-input" value={row.name} placeholder="Nubank" onChange={e => update({ name: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-money">
                      <label className="form-label">Saldo hoje</label>
                      <input className="form-input" type="number" step="0.01" inputMode="decimal" value={row.initialBalance} placeholder="0,00" onChange={e => update({ initialBalance: e.target.value })} />
                    </div>
                  </>
                )}
              />
            </>
          )}

          {current.id === 'guardado' && (
            <>
              <p className="onb-hint">
                O que está reservado ou investido — poupança, CDB, tesouro, cripto. É separado do saldo das contas do dia a dia.
              </p>
              <div className="form-group onb-field">
                <label className="form-label">Total guardado</label>
                <input
                  className="form-input onb-input-lg"
                  type="number" step="0.01" inputMode="decimal"
                  value={profile.savings}
                  placeholder="0,00"
                  onChange={e => setProfile({ ...profile, savings: e.target.value })}
                />
              </div>
              {totals.outflow > 0 && parseFloat(profile.savings) > 0 && (
                <div className="onb-insight">
                  Isso cobre <strong>{totals.monthsOfRunway.toFixed(1)} meses</strong> das suas contas fixas
                  ({formatBRL(totals.outflow)} por mês).
                </div>
              )}
            </>
          )}

          {current.id === 'metas' && (
            <>
              <p className="onb-hint">Escolha uma sugestão ou crie a sua. Dá para deixar em branco e definir depois.</p>
              <div className="onb-suggestions">
                {GOAL_SUGGESTIONS.map(sug => (
                  <button
                    key={sug.name}
                    type="button"
                    className="onb-chip"
                    onClick={() => setGoals([...goals, { ...emptyGoal(), name: sug.name, type: sug.type }])}
                  >
                    {sug.icon} {sug.name}
                  </button>
                ))}
              </div>
              <RowList
                rows={goals}
                onAdd={() => setGoals([...goals, emptyGoal()])}
                onRemove={(key) => setGoals(goals.filter(g => g.key !== key))}
                onChange={updateGoal}
                addLabel="+ Adicionar meta"
                emptyText="Nenhuma meta ainda"
                render={(row, update) => (
                  <>
                    <div className="form-group onb-col-grow">
                      <label className="form-label">Meta</label>
                      <input className="form-input" value={row.name} placeholder="Reserva de emergência" onChange={e => update({ name: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-money">
                      <label className="form-label">Quanto precisa</label>
                      <input className="form-input" type="number" step="0.01" inputMode="decimal" value={row.targetAmount} placeholder="0,00" onChange={e => update({ targetAmount: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-money">
                      <label className="form-label">Já tenho</label>
                      <input className="form-input" type="number" step="0.01" inputMode="decimal" value={row.currentAmount} placeholder="0,00" onChange={e => update({ currentAmount: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-date">
                      <label className="form-label">Até quando</label>
                      <input className="form-input" type="date" value={row.targetDate} onChange={e => update({ targetDate: e.target.value })} />
                    </div>
                  </>
                )}
              />
            </>
          )}

          {current.id === 'entradas' && (
            <>
              <p className="onb-hint">
                Cadastre cada recebimento separado, com o dia em que cai. Recebe dia 5, 10 e 20? São três linhas.
              </p>
              <div className="onb-suggestions">
                {INCOME_SUGGESTIONS.map(sug => (
                  <button
                    key={sug.name}
                    type="button"
                    className="onb-chip"
                    onClick={() => setIncomes([...incomes, { ...emptyIncome(), name: sug.name, categoryName: sug.category }])}
                  >
                    {sug.icon} {sug.name}
                  </button>
                ))}
              </div>
              <RowList
                rows={incomes}
                onAdd={() => setIncomes([...incomes, emptyIncome()])}
                onRemove={(key) => setIncomes(incomes.filter(i => i.key !== key))}
                onChange={updateIncome}
                addLabel="+ Adicionar entrada"
                render={(row, update) => (
                  <>
                    <div className="form-group onb-col-grow">
                      <label className="form-label">Descrição</label>
                      <input className="form-input" value={row.name} placeholder="Salário" onChange={e => update({ name: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-money">
                      <label className="form-label">Valor</label>
                      <input className="form-input" type="number" step="0.01" inputMode="decimal" value={row.amount} placeholder="0,00" onChange={e => update({ amount: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-day">
                      <label className="form-label">Dia</label>
                      <input className="form-input" type="number" min="1" max="31" inputMode="numeric" value={row.dayOfMonth} placeholder="5" onChange={e => update({ dayOfMonth: e.target.value })} />
                    </div>
                    <AccountPicker row={row} update={update} options={accountOptions} />
                  </>
                )}
              />
              {totals.income > 0 && (
                <div className="onb-insight">Total por mês: <strong>{formatBRL(totals.income)}</strong></div>
              )}
            </>
          )}

          {current.id === 'cartoes' && (
            <>
              <p className="onb-hint">
                O <strong>melhor dia de compra</strong> é quando a fatura nova abre: comprando nesse dia você
                paga só na fatura seguinte. Se paga dia 15 e o melhor dia é 11, é isso que vai aqui.
              </p>
              <RowList
                rows={cards}
                onAdd={() => setCards([...cards, emptyCard()])}
                onRemove={(key) => setCards(cards.filter(c => c.key !== key))}
                onChange={updateCard}
                addLabel="+ Adicionar cartão"
                emptyText="Nenhum cartão ainda"
                render={(row, update) => (
                  <>
                    <div className="form-group onb-col-icon">
                      <label className="form-label">Ícone</label>
                      <input className="form-input" maxLength={2} value={row.icon} onChange={e => update({ icon: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-grow">
                      <label className="form-label">Cartão</label>
                      <input className="form-input" value={row.name} placeholder="Nubank" onChange={e => update({ name: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-day">
                      <label className="form-label">Melhor compra</label>
                      <input className="form-input" type="number" min="1" max="31" inputMode="numeric" value={row.openingDay} placeholder="11" onChange={e => update({ openingDay: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-day">
                      <label className="form-label">Pagamento</label>
                      <input className="form-input" type="number" min="1" max="31" inputMode="numeric" value={row.paymentDay} placeholder="15" onChange={e => update({ paymentDay: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-money">
                      <label className="form-label">Fatura média</label>
                      <input className="form-input" type="number" step="0.01" inputMode="decimal" value={row.estimatedAmount} placeholder="0,00" onChange={e => update({ estimatedAmount: e.target.value })} />
                    </div>
                  </>
                )}
              />
            </>
          )}

          {current.id === 'fixas' && (
            <>
              <p className="onb-hint">Aquilo que se repete todo mês no mesmo dia. Toque numa sugestão para começar.</p>
              <div className="onb-suggestions">
                {FIXED_EXPENSE_SUGGESTIONS.map(sug => (
                  <button
                    key={sug.name}
                    type="button"
                    className="onb-chip"
                    onClick={() => setFixedExpenses([...fixedExpenses, { ...emptyExpense(), name: sug.name, categoryName: sug.category }])}
                  >
                    {sug.icon} {sug.name}
                  </button>
                ))}
              </div>
              <RowList
                rows={fixedExpenses}
                onAdd={() => setFixedExpenses([...fixedExpenses, emptyExpense()])}
                onRemove={(key) => setFixedExpenses(fixedExpenses.filter(f => f.key !== key))}
                onChange={updateExpense}
                addLabel="+ Adicionar conta fixa"
                emptyText="Nenhuma conta fixa ainda"
                render={(row, update) => (
                  <>
                    <div className="form-group onb-col-grow">
                      <label className="form-label">Descrição</label>
                      <input className="form-input" value={row.name} placeholder="Aluguel" onChange={e => update({ name: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-money">
                      <label className="form-label">Valor</label>
                      <input className="form-input" type="number" step="0.01" inputMode="decimal" value={row.amount} placeholder="0,00" onChange={e => update({ amount: e.target.value })} />
                    </div>
                    <div className="form-group onb-col-day">
                      <label className="form-label">Dia</label>
                      <input className="form-input" type="number" min="1" max="31" inputMode="numeric" value={row.dayOfMonth} placeholder="10" onChange={e => update({ dayOfMonth: e.target.value })} />
                    </div>
                    <AccountPicker row={row} update={update} options={accountOptions} />
                  </>
                )}
              />
              {totals.fixed > 0 && (
                <div className="onb-insight">Total por mês: <strong>{formatBRL(totals.fixed)}</strong></div>
              )}
            </>
          )}

          {current.id === 'resumo' && (
            <>
              <p className="onb-hint">
                {profile.nickname ? `${profile.nickname}, é` : 'É'} assim que seu mês fica. Dá para voltar e ajustar
                qualquer passo.
              </p>

              <div className="onb-summary">
                <div className="onb-sum-row">
                  <span>Entradas</span>
                  <strong className="amount-income">{formatBRL(totals.income)}</strong>
                </div>
                <div className="onb-sum-row">
                  <span>Contas fixas</span>
                  <strong className="amount-expense">-{formatBRL(totals.fixed)}</strong>
                </div>
                <div className="onb-sum-row">
                  <span>Faturas de cartão</span>
                  <strong className="amount-expense">-{formatBRL(totals.cardBills)}</strong>
                </div>
                <div className="onb-sum-row total">
                  <span>Sobra por mês</span>
                  <strong className={totals.leftover >= 0 ? 'amount-income' : 'amount-expense'}>
                    {formatBRL(totals.leftover)}
                  </strong>
                </div>
              </div>

              <div className="onb-counts">
                <span>{accounts.filter(a => (a.name || '').trim()).length} conta(s)</span>
                <span>{incomes.filter(i => (i.name || '').trim()).length} entrada(s)</span>
                <span>{cards.filter(c => (c.name || '').trim()).length} cartão(ões)</span>
                <span>{fixedExpenses.filter(f => (f.name || '').trim()).length} conta(s) fixa(s)</span>
                <span>{goals.filter(g => (g.name || '').trim()).length} meta(s)</span>
              </div>

              {totals.leftover < 0 && (
                <div className="onb-insight warn">
                  Suas saídas fixas passam das entradas em {formatBRL(Math.abs(totals.leftover))} por mês.
                  Vale revisar as contas fixas ou a fatura média dos cartões.
                </div>
              )}
              {totals.leftover > 0 && totals.monthsOfRunway > 0 && (
                <div className="onb-insight">
                  Guardando a sobra inteira, você junta um mês de reserva a cada{' '}
                  <strong>{(totals.outflow / totals.leftover).toFixed(1)} mês(es)</strong>.
                </div>
              )}
            </>
          )}
        </main>

        <footer className="onb-foot">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => go(-1)}
            disabled={step === 0 || saving}
          >
            Voltar
          </button>

          <div className="onb-dots">
            {STEPS.map((s, i) => (
              <span key={s.id} className={`onb-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
            ))}
          </div>

          {isLast ? (
            <button type="button" className="btn btn-primary" onClick={handleFinish} disabled={saving}>
              {saving ? '⏳ Salvando...' : '✓ Concluir'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => go(1)} disabled={!canAdvance || saving}>
              Continuar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function AccountPicker({ row, update, options }) {
  if (!options.length) return null;
  return (
    <div className="form-group onb-col-account">
      <label className="form-label">Conta</label>
      <select className="form-select" value={row.accountKey} onChange={e => update({ accountKey: e.target.value })}>
        <option value="">—</option>
        {options.map(a => <option key={a.key} value={a.key}>{a.icon} {a.name}</option>)}
      </select>
    </div>
  );
}

/** Lista editável de linhas com adicionar/remover. */
function RowList({ rows, onAdd, onRemove, onChange, render, addLabel, emptyText, allowRemoveSaved = true }) {
  return (
    <div className="onb-rows">
      {rows.length === 0 && emptyText && <p className="onb-empty">{emptyText}</p>}

      {rows.map(row => (
        <div key={row.key} className="onb-row">
          {render(row, (changes) => onChange(row.key, changes))}
          {(allowRemoveSaved || !row.id) && (
            <button
              type="button"
              className="btn-icon onb-row-remove"
              onClick={() => onRemove(row.key)}
              aria-label="Remover"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      <button type="button" className="btn btn-secondary btn-sm onb-add" onClick={onAdd}>
        {addLabel}
      </button>
    </div>
  );
}
