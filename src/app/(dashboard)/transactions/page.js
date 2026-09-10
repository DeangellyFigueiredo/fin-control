'use client';

import { useState, useEffect } from 'react';
import { formatBRL, getMonthName, formatDate, todayISO } from '@/lib/utils';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterType, setFilterType] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  const [form, setForm] = useState({
    date: todayISO(),
    amount: '',
    type: 'EXPENSE',
    description: '',
    bankAccountId: '',
    categoryId: '',
  });

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams({ month: filterMonth, year: filterYear });
    if (filterType) params.set('type', filterType);
    if (filterAccount) params.set('accountId', filterAccount);

    const [txRes, accRes, catRes] = await Promise.all([
      fetch(`/api/transactions?${params}`),
      fetch('/api/accounts'),
      fetch('/api/categories'),
    ]);

    setTransactions(await txRes.json());
    setAccounts(await accRes.json());
    setCategories(await catRes.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filterMonth, filterYear, filterType, filterAccount]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editing ? 'PUT' : 'POST';
    const body = editing ? { ...form, id: editing } : form;

    await fetch('/api/transactions', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setForm({ date: todayISO(), amount: '', type: 'EXPENSE', description: '', bankAccountId: form.bankAccountId, categoryId: '' });
    setEditing(null);
    setShowForm(false);
    fetchData();
  };

  const handleEdit = (tx) => {
    setForm({
      date: new Date(tx.date).toISOString().split('T')[0],
      amount: tx.amount,
      type: tx.type,
      description: tx.description,
      bankAccountId: tx.bankAccountId,
      categoryId: tx.categoryId || '',
    });
    setEditing(tx.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta transação?')) return;
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
  const filteredCategories = categories.filter(c => c.type === form.type);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Transações</h1>
          <p className="page-subtitle">{getMonthName(filterMonth)} {filterYear}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          ➕ Nova Transação
        </button>
      </div>

      {/* Summary cards */}
      <div className="stat-cards" style={{ marginBottom: 20 }}>
        <div className="card stat-card income">
          <div className="stat-label">Entradas</div>
          <div className="stat-value positive">{formatBRL(totalIncome)}</div>
        </div>
        <div className="card stat-card expense">
          <div className="stat-label">Saídas</div>
          <div className="stat-value negative">{formatBRL(totalExpense)}</div>
        </div>
        <div className="card stat-card balance">
          <div className="stat-label">Saldo</div>
          <div className={`stat-value ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}`}>
            {formatBRL(totalIncome - totalExpense)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <select className="form-select" style={{ width: 'auto' }} value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
          ))}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))}>
          {[2024, 2025, 2026, 2027, 2028].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button className={`filter-chip ${filterType === '' ? 'active' : ''}`} onClick={() => setFilterType('')}>Todos</button>
        <button className={`filter-chip ${filterType === 'INCOME' ? 'active' : ''}`} onClick={() => setFilterType('INCOME')}>Entradas</button>
        <button className={`filter-chip ${filterType === 'EXPENSE' ? 'active' : ''}`} onClick={() => setFilterType('EXPENSE')}>Saídas</button>
        <select className="form-select" style={{ width: 'auto' }} value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="">Todas as contas</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </select>
      </div>

      {/* Transaction list */}
      <div className="card" style={{ padding: '8px 20px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <p className="empty-state-text">Nenhuma transação neste período</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>➕ Adicionar</button>
          </div>
        ) : (
          transactions.map(tx => (
            <div key={tx.id} className="transaction-item" style={{ cursor: 'pointer' }}>
              <div className={`transaction-icon ${tx.type === 'INCOME' ? 'income' : 'expense'}`}>
                {tx.category?.icon || (tx.type === 'INCOME' ? '💰' : '💸')}
              </div>
              <div className="transaction-info">
                <div className="transaction-desc">{tx.description || 'Sem descrição'}</div>
                <div className="transaction-meta">
                  <span>{formatDate(tx.date)}</span>
                  <span>•</span>
                  <span>{tx.bankAccount?.name}</span>
                  {tx.category && <><span>•</span><span>{tx.category.name}</span></>}
                </div>
              </div>
              <div className={`transaction-amount ${tx.type === 'INCOME' ? 'amount-income' : 'amount-expense'}`}>
                {tx.type === 'INCOME' ? '+' : '-'}{formatBRL(tx.amount)}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-icon" onClick={() => handleEdit(tx)} title="Editar">✏️</button>
                <button className="btn-icon" onClick={() => handleDelete(tx.id)} title="Excluir">🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? '✏️ Editar Transação' : '➕ Nova Transação'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(null); }}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="type-toggle" style={{ marginBottom: 20 }}>
                <button type="button" className={form.type === 'EXPENSE' ? 'active-expense' : ''} onClick={() => setForm(f => ({ ...f, type: 'EXPENSE', categoryId: '' }))}>
                  💸 Saída
                </button>
                <button type="button" className={form.type === 'INCOME' ? 'active-income' : ''} onClick={() => setForm(f => ({ ...f, type: 'INCOME', categoryId: '' }))}>
                  💰 Entrada
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Data</label>
                    <input type="date" className="form-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor (R$)</label>
                    <input type="number" step="0.01" className="form-input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input type="text" className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Aluguel - Junho" />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Conta</label>
                    <select className="form-select" value={form.bankAccountId} onChange={e => setForm(f => ({ ...f, bankAccountId: e.target.value }))} required>
                      <option value="">Selecione...</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoria</label>
                    <select className="form-select" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                      <option value="">Sem categoria</option>
                      {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Salvar' : 'Adicionar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
