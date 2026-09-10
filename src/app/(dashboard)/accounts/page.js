'use client';

import { useState, useEffect } from 'react';
import { formatBRL } from '@/lib/utils';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({ name: '', color: '#6c5ce7', icon: '🏦', initialBalance: '' });

  const fetchData = async () => {
    const res = await fetch('/api/accounts');
    setAccounts(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editing ? 'PUT' : 'POST';
    const body = editing ? { ...form, id: editing } : form;
    await fetch('/api/accounts', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', color: '#6c5ce7', icon: '🏦', initialBalance: '' });
    fetchData();
  };

  const handleEdit = (acc) => {
    setForm({ name: acc.name, color: acc.color, icon: acc.icon, initialBalance: acc.initialBalance });
    setEditing(acc.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta conta? Todas as transações associadas serão removidas!')) return;
    await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const totalBalance = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);

  const icons = ['🏦', '🟠', '🔴', '🟢', '🔵', '🟡', '💳', '💰'];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contas Bancárias</h1>
          <p className="page-subtitle">Gerencie suas contas e acompanhe os saldos</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>➕ Nova Conta</button>
      </div>

      {/* Total */}
      <div className="stat-cards" style={{ marginBottom: 28 }}>
        <div className="card stat-card balance">
          <div className="stat-label">Saldo Total</div>
          <div className={`stat-value ${totalBalance >= 0 ? 'positive' : 'negative'}`}>{formatBRL(totalBalance)}</div>
        </div>
      </div>

      {/* Account cards */}
      <div className="grid-3">
        {accounts.map(acc => (
          <div key={acc.id} className="card bank-card" style={{ '--bank-color': acc.color }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="bank-name">
                <span style={{ fontSize: '1.6rem' }}>{acc.icon}</span>
                <span>{acc.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-icon" onClick={() => handleEdit(acc)}>✏️</button>
                <button className="btn-icon" onClick={() => handleDelete(acc.id)}>🗑️</button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="stat-label">Saldo Atual</div>
              <div className={`bank-balance`} style={{ color: (acc.currentBalance || 0) >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {formatBRL(acc.currentBalance || 0)}
              </div>
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <span>Saldo Inicial</span>
              <span>{formatBRL(acc.initialBalance)}</span>
            </div>
          </div>
        ))}

        {accounts.length === 0 && !loading && (
          <div className="card empty-state" style={{ gridColumn: '1 / -1' }}>
            <div className="empty-state-icon">🏦</div>
            <p className="empty-state-text">Nenhuma conta cadastrada</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>Adicionar Conta</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? '✏️ Editar Conta' : '➕ Nova Conta'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(null); }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Nome do Banco</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Bradesco" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Cor</label>
                    <input type="color" className="form-input" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ height: 42, padding: 4 }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ícone</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {icons.map(icon => (
                        <button key={icon} type="button" onClick={() => setForm(f => ({ ...f, icon }))}
                          style={{
                            fontSize: '1.3rem', padding: '6px 10px', background: form.icon === icon ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                            border: form.icon === icon ? '2px solid var(--accent)' : '1px solid var(--border)',
                            borderRadius: 8, cursor: 'pointer',
                          }}>{icon}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Saldo Inicial (R$)</label>
                  <input type="number" step="0.01" className="form-input" value={form.initialBalance} onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))} placeholder="0,00" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
