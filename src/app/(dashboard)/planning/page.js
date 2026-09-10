'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatBRL, getMonthName } from '@/lib/utils';

const TABS = [
  { id: 'INCOME', label: 'Entradas', icon: '💰', hint: 'Salário, pro-labore, aluguéis — o que entra e em que dia' },
  { id: 'EXPENSE', label: 'Pagamentos recorrentes', icon: '📆', hint: 'Contas fixas que se repetem todo mês' },
  { id: 'CARDS', label: 'Cartões', icon: '💳', hint: 'Abertura, vencimento e pagamento da fatura' },
];

const emptyEntry = (type) => ({
  name: '', type, amount: '', dayOfMonth: '', frequency: 'MONTHLY', monthOfYear: '',
  startDate: '', endDate: '', bankAccountId: '', categoryId: '', creditCardId: '',
  notes: '', active: true,
});

const emptyCard = () => ({
  name: '', color: '#6c5ce7', icon: '💳', limitAmount: '',
  openingDay: '', dueDay: '', paymentDay: '', estimatedAmount: '',
  bankAccountId: '', active: true,
});

export default function PlanningPage() {
  const [tab, setTab] = useState('INCOME');
  const [entries, setEntries] = useState([]);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [entryForm, setEntryForm] = useState(null);
  const [cardForm, setCardForm] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [recRes, cardRes, accRes, catRes] = await Promise.all([
      fetch('/api/recurring'),
      fetch('/api/cards'),
      fetch('/api/accounts'),
      fetch('/api/categories'),
    ]);
    setEntries(await recRes.json());
    setCards(await cardRes.json());
    setAccounts(await accRes.json());
    setCategories(await catRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openEntry = (entry, type) => {
    setError('');
    setEditingId(entry?.id || null);
    setEntryForm(entry ? {
      name: entry.name,
      type: entry.type,
      amount: String(entry.amount),
      dayOfMonth: String(entry.dayOfMonth),
      frequency: entry.frequency,
      monthOfYear: entry.monthOfYear ? String(entry.monthOfYear) : '',
      startDate: entry.startDate ? entry.startDate.slice(0, 10) : '',
      endDate: entry.endDate ? entry.endDate.slice(0, 10) : '',
      bankAccountId: entry.bankAccountId || '',
      categoryId: entry.categoryId || '',
      creditCardId: entry.creditCardId || '',
      notes: entry.notes || '',
      active: entry.active,
    } : emptyEntry(type));
  };

  const openCard = (card) => {
    setError('');
    setEditingId(card?.id || null);
    setCardForm(card ? {
      name: card.name,
      color: card.color,
      icon: card.icon,
      limitAmount: String(card.limitAmount),
      openingDay: String(card.openingDay),
      dueDay: String(card.dueDay),
      paymentDay: String(card.paymentDay),
      estimatedAmount: String(card.estimatedAmount),
      bankAccountId: card.bankAccountId || '',
      active: card.active,
    } : emptyCard());
  };

  const submitEntry = async (e) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/recurring', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...entryForm, id: editingId } : entryForm),
    });
    if (!res.ok) {
      setError((await res.json()).error || 'Erro ao salvar');
      return;
    }
    setEntryForm(null);
    setEditingId(null);
    fetchData();
  };

  const submitCard = async (e) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/cards', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...cardForm, id: editingId } : cardForm),
    });
    if (!res.ok) {
      setError((await res.json()).error || 'Erro ao salvar');
      return;
    }
    setCardForm(null);
    setEditingId(null);
    fetchData();
  };

  const removeEntry = async (id) => {
    if (!confirm('Remover este lançamento recorrente?')) return;
    await fetch(`/api/recurring?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const removeCard = async (id) => {
    if (!confirm('Remover este cartão?')) return;
    await fetch(`/api/cards?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const toggleEntry = async (entry) => {
    await fetch('/api/recurring', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, id: entry.id, active: !entry.active }),
    });
    fetchData();
  };

  const list = entries.filter(e => e.type === tab);
  const monthlyTotal = list
    .filter(e => e.active && e.frequency === 'MONTHLY')
    .reduce((s, e) => s + e.amount, 0);
  const cardsTotal = cards.filter(c => c.active).reduce((s, c) => s + c.estimatedAmount, 0);
  const activeTab = TABS.find(t => t.id === tab);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pré-cadastro</h1>
          <p className="page-subtitle">
            Cadastre uma vez e o valor aparece fixo no calendário de todos os meses
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (tab === 'CARDS' ? openCard(null) : openEntry(null, tab))}
        >
          + {tab === 'CARDS' ? 'Novo cartão' : tab === 'INCOME' ? 'Nova entrada' : 'Novo pagamento'}
        </button>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <p className="page-subtitle" style={{ marginBottom: 20 }}>{activeTab.hint}</p>

      {loading ? (
        <div className="card"><div className="skeleton" style={{ height: 220 }} /></div>
      ) : tab === 'CARDS' ? (
        <>
          <div className="stat-cards">
            <div className="card stat-card balance">
              <div className="stat-label">Cartões ativos</div>
              <div className="stat-value">{cards.filter(c => c.active).length}</div>
            </div>
            <div className="card stat-card expense">
              <div className="stat-label">Fatura estimada por mês</div>
              <div className="stat-value negative">{formatBRL(cardsTotal)}</div>
            </div>
            <div className="card stat-card variation">
              <div className="stat-label">Limite total</div>
              <div className="stat-value">{formatBRL(cards.reduce((s, c) => s + c.limitAmount, 0))}</div>
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon">💳</div>
              <p className="empty-state-text">Nenhum cartão cadastrado</p>
              <button className="btn btn-primary" onClick={() => openCard(null)}>Cadastrar cartão</button>
            </div>
          ) : (
            <div className="grid-3">
              {cards.map(card => (
                <div key={card.id} className={`card credit-card ${card.active ? '' : 'is-inactive'}`} style={{ '--bank-color': card.color }}>
                  <div className="credit-card-head">
                    <div className="bank-name"><span>{card.icon}</span> {card.name}</div>
                    <div className="row-actions">
                      <button className="btn-icon" onClick={() => openCard(card)} aria-label="Editar">✏️</button>
                      <button className="btn-icon" onClick={() => removeCard(card.id)} aria-label="Remover">🗑️</button>
                    </div>
                  </div>

                  <div className="cycle-grid">
                    <div className="cycle-item">
                      <span className="cycle-label">Abertura</span>
                      <span className="cycle-day marker-opening">dia {card.openingDay}</span>
                    </div>
                    <div className="cycle-item">
                      <span className="cycle-label">Vencimento</span>
                      <span className="cycle-day marker-due">dia {card.dueDay}</span>
                    </div>
                    <div className="cycle-item">
                      <span className="cycle-label">Pagamento</span>
                      <span className="cycle-day marker-payment">dia {card.paymentDay}</span>
                    </div>
                  </div>

                  <div className="credit-card-foot">
                    <div>
                      <div className="stat-label">Fatura estimada</div>
                      <div className="amount-expense">{formatBRL(card.estimatedAmount)}</div>
                    </div>
                    <div>
                      <div className="stat-label">Limite</div>
                      <div>{formatBRL(card.limitAmount)}</div>
                    </div>
                  </div>

                  {card.bankAccount && (
                    <div className="transaction-meta">Debitado em {card.bankAccount.name}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="stat-cards">
            <div className={`card stat-card ${tab === 'INCOME' ? 'income' : 'expense'}`}>
              <div className="stat-label">Total mensal fixo</div>
              <div className={`stat-value ${tab === 'INCOME' ? 'positive' : 'negative'}`}>{formatBRL(monthlyTotal)}</div>
            </div>
            <div className="card stat-card balance">
              <div className="stat-label">Cadastros ativos</div>
              <div className="stat-value">{list.filter(e => e.active).length}</div>
            </div>
            <div className="card stat-card variation">
              <div className="stat-label">Cadastros pausados</div>
              <div className="stat-value">{list.filter(e => !e.active).length}</div>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon">{tab === 'INCOME' ? '💰' : '📆'}</div>
              <p className="empty-state-text">
                Nenhum{tab === 'INCOME' ? 'a entrada cadastrada' : ' pagamento cadastrado'}
              </p>
              <button className="btn btn-primary" onClick={() => openEntry(null, tab)}>Cadastrar agora</button>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Descrição</th>
                    <th>Frequência</th>
                    <th>Conta / Cartão</th>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map(entry => (
                    <tr key={entry.id} className={entry.active ? '' : 'is-inactive'}>
                      <td><span className="day-pill">{entry.dayOfMonth}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{entry.name}</div>
                        {entry.notes && <div className="transaction-meta">{entry.notes}</div>}
                      </td>
                      <td>
                        {entry.frequency === 'MONTHLY'
                          ? 'Todo mês'
                          : `Anual · ${getMonthName(entry.monthOfYear || 1)}`}
                      </td>
                      <td>{entry.creditCard?.name || entry.bankAccount?.name || '—'}</td>
                      <td>{entry.category ? `${entry.category.icon} ${entry.category.name}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={entry.type === 'INCOME' ? 'amount-income' : 'amount-expense'}>
                          {formatBRL(entry.amount)}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`badge ${entry.active ? 'badge-income' : 'badge-expense'}`}
                          onClick={() => toggleEntry(entry)}
                          style={{ border: 'none', cursor: 'pointer' }}
                        >
                          {entry.active ? 'Ativo' : 'Pausado'}
                        </button>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn-icon" onClick={() => openEntry(entry, tab)} aria-label="Editar">✏️</button>
                          <button className="btn-icon" onClick={() => removeEntry(entry.id)} aria-label="Remover">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Recurring entry form */}
      {entryForm && (
        <div className="modal-overlay" onClick={() => setEntryForm(null)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submitEntry}>
            <div className="modal-header">
              <div className="modal-title">
                {editingId ? 'Editar' : 'Novo'} {entryForm.type === 'INCOME' ? 'entrada' : 'pagamento recorrente'}
              </div>
              <button type="button" className="modal-close" onClick={() => setEntryForm(null)}>✕</button>
            </div>

            {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="type-toggle">
                <button
                  type="button"
                  className={entryForm.type === 'INCOME' ? 'active-income' : ''}
                  onClick={() => setEntryForm({ ...entryForm, type: 'INCOME' })}
                >
                  Entrada
                </button>
                <button
                  type="button"
                  className={entryForm.type === 'EXPENSE' ? 'active-expense' : ''}
                  onClick={() => setEntryForm({ ...entryForm, type: 'EXPENSE' })}
                >
                  Saída
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Descrição</label>
                <input
                  className="form-input" required value={entryForm.name}
                  placeholder={entryForm.type === 'INCOME' ? 'Salário' : 'Aluguel'}
                  onChange={e => setEntryForm({ ...entryForm, name: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Valor (R$)</label>
                  <input
                    className="form-input" type="number" step="0.01" min="0" required
                    value={entryForm.amount}
                    onChange={e => setEntryForm({ ...entryForm, amount: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Dia do mês</label>
                  <input
                    className="form-input" type="number" min="1" max="31" required
                    value={entryForm.dayOfMonth}
                    onChange={e => setEntryForm({ ...entryForm, dayOfMonth: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Frequência</label>
                  <select
                    className="form-select" value={entryForm.frequency}
                    onChange={e => setEntryForm({ ...entryForm, frequency: e.target.value })}
                  >
                    <option value="MONTHLY">Todo mês</option>
                    <option value="YEARLY">Uma vez por ano</option>
                  </select>
                </div>
                {entryForm.frequency === 'YEARLY' && (
                  <div className="form-group">
                    <label className="form-label">Mês</label>
                    <select
                      className="form-select" value={entryForm.monthOfYear} required
                      onChange={e => setEntryForm({ ...entryForm, monthOfYear: e.target.value })}
                    >
                      <option value="">Selecione</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Conta</label>
                  <select
                    className="form-select" value={entryForm.bankAccountId}
                    onChange={e => setEntryForm({ ...entryForm, bankAccountId: e.target.value })}
                  >
                    <option value="">Nenhuma</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <select
                    className="form-select" value={entryForm.categoryId}
                    onChange={e => setEntryForm({ ...entryForm, categoryId: e.target.value })}
                  >
                    <option value="">Nenhuma</option>
                    {categories.filter(c => c.type === entryForm.type).map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {entryForm.type === 'EXPENSE' && cards.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Cobrado no cartão</label>
                  <select
                    className="form-select" value={entryForm.creditCardId}
                    onChange={e => setEntryForm({ ...entryForm, creditCardId: e.target.value })}
                  >
                    <option value="">Não é cartão</option>
                    {cards.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Começa em (opcional)</label>
                  <input
                    className="form-input" type="date" value={entryForm.startDate}
                    onChange={e => setEntryForm({ ...entryForm, startDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Termina em (opcional)</label>
                  <input
                    className="form-input" type="date" value={entryForm.endDate}
                    onChange={e => setEntryForm({ ...entryForm, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Observação</label>
                <input
                  className="form-input" value={entryForm.notes}
                  onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEntryForm(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Credit card form */}
      {cardForm && (
        <div className="modal-overlay" onClick={() => setCardForm(null)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submitCard}>
            <div className="modal-header">
              <div className="modal-title">{editingId ? 'Editar cartão' : 'Novo cartão'}</div>
              <button type="button" className="modal-close" onClick={() => setCardForm(null)}>✕</button>
            </div>

            {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nome</label>
                  <input
                    className="form-input" required value={cardForm.name} placeholder="Nubank"
                    onChange={e => setCardForm({ ...cardForm, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Ícone</label>
                  <input
                    className="form-input" value={cardForm.icon} maxLength={2}
                    onChange={e => setCardForm({ ...cardForm, icon: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cor</label>
                  <input
                    className="form-input" type="color" value={cardForm.color}
                    style={{ padding: 4, height: 42 }}
                    onChange={e => setCardForm({ ...cardForm, color: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Abertura (dia)</label>
                  <input
                    className="form-input" type="number" min="1" max="31" required
                    value={cardForm.openingDay}
                    onChange={e => setCardForm({ ...cardForm, openingDay: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Vencimento (dia)</label>
                  <input
                    className="form-input" type="number" min="1" max="31" required
                    value={cardForm.dueDay}
                    onChange={e => setCardForm({ ...cardForm, dueDay: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pagamento (dia)</label>
                  <input
                    className="form-input" type="number" min="1" max="31" required
                    value={cardForm.paymentDay}
                    onChange={e => setCardForm({ ...cardForm, paymentDay: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Fatura estimada (R$)</label>
                  <input
                    className="form-input" type="number" step="0.01" min="0"
                    value={cardForm.estimatedAmount}
                    onChange={e => setCardForm({ ...cardForm, estimatedAmount: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Limite (R$)</label>
                  <input
                    className="form-input" type="number" step="0.01" min="0"
                    value={cardForm.limitAmount}
                    onChange={e => setCardForm({ ...cardForm, limitAmount: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Conta de débito</label>
                <select
                  className="form-select" value={cardForm.bankAccountId}
                  onChange={e => setCardForm({ ...cardForm, bankAccountId: e.target.value })}
                >
                  <option value="">Nenhuma</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCardForm(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
