'use client';

import { useState, useEffect } from 'react';
import { formatBRL, formatDate } from '@/lib/utils';

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    name: '', type: 'INVESTIMENTO', targetAmount: '', currentAmount: '',
    targetDate: '', monthlyContribution: '', investmentId: '',
  });

  const fetchData = async () => {
    const [gRes, iRes] = await Promise.all([
      fetch('/api/goals'), fetch('/api/investments'),
    ]);
    setGoals(await gRes.json());
    setInvestments(await iRes.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editing ? 'PUT' : 'POST';
    const body = editing ? { ...form, id: editing } : form;
    await fetch('/api/goals', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', type: 'INVESTIMENTO', targetAmount: '', currentAmount: '', targetDate: '', monthlyContribution: '', investmentId: '' });
    fetchData();
  };

  const handleEdit = (goal) => {
    setForm({
      name: goal.name, type: goal.type,
      targetAmount: goal.targetAmount, currentAmount: goal.currentAmount,
      targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '',
      monthlyContribution: goal.monthlyContribution, investmentId: goal.investmentId || '',
    });
    setEditing(goal.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta meta?')) return;
    await fetch(`/api/goals?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const typeLabels = { RESERVA_EMERGENCIA: '🛡️ Reserva de Emergência', INVESTIMENTO: '📈 Investimento', PATRIMONIO: '🏆 Patrimônio', OUTRO: '🎯 Outro' };
  const emergencyGoals = goals.filter(g => g.type === 'RESERVA_EMERGENCIA');
  const otherGoals = goals.filter(g => g.type !== 'RESERVA_EMERGENCIA');

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Metas Financeiras</h1>
          <p className="page-subtitle">Acompanhe suas metas e projeções</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>➕ Nova Meta</button>
      </div>

      {/* Emergency Reserve */}
      {emergencyGoals.length > 0 && (
        <div className="section">
          <div className="section-title">🛡️ Reserva de Emergência</div>
          {emergencyGoals.map(goal => {
            const pct = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
            const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
            const monthsToGoal = goal.monthlyContribution > 0 ? Math.ceil(remaining / goal.monthlyContribution) : 0;
            return (
              <div key={goal.id} className="card" style={{ padding: 28, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '1.2rem' }}>{goal.name}</h3>
                    {goal.targetDate && <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Meta: {formatDate(goal.targetDate)}</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-light)' }}>{pct.toFixed(0)}%</div>
                  </div>
                </div>
                <div className="progress-bar" style={{ height: 12 }}>
                  <div className={`progress-fill ${pct >= 70 ? 'income' : ''}`} style={{ width: `${pct}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>{formatBRL(goal.currentAmount)}</span>
                  <span>{formatBRL(goal.targetAmount)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 20 }}>
                  <div className="card" style={{ padding: 14, textAlign: 'center' }}>
                    <div className="stat-label">Faltam</div>
                    <div style={{ fontWeight: 700, color: 'var(--expense)' }}>{formatBRL(remaining)}</div>
                  </div>
                  <div className="card" style={{ padding: 14, textAlign: 'center' }}>
                    <div className="stat-label">Aporte Mensal</div>
                    <div style={{ fontWeight: 700 }}>{formatBRL(goal.monthlyContribution)}</div>
                  </div>
                  <div className="card" style={{ padding: 14, textAlign: 'center' }}>
                    <div className="stat-label">Meses Restantes</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{monthsToGoal}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(goal)}>✏️ Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(goal.id)}>🗑️ Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Other goals */}
      <div className="section">
        <div className="section-title">🎯 Metas de Longo Prazo</div>
        <div className="grid-2">
          {otherGoals.map(goal => {
            const pct = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
            return (
              <div key={goal.id} className="card goal-card">
                <div className="goal-header">
                  <span className="goal-name">{typeLabels[goal.type]?.split(' ').slice(0,1)} {goal.name}</span>
                  <span className="goal-percentage">{pct.toFixed(0)}%</span>
                </div>
                {goal.targetDate && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Meta: {formatDate(goal.targetDate)}</div>}
                <div className="progress-bar">
                  <div className={`progress-fill ${pct >= 70 ? 'income' : 'warning'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="goal-amounts">
                  <span>{formatBRL(goal.currentAmount)}</span>
                  <span>{formatBRL(goal.targetAmount)}</span>
                </div>
                {goal.monthlyContribution > 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    Aporte mensal: {formatBRL(goal.monthlyContribution)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(goal)}>✏️</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(goal.id)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
        {otherGoals.length === 0 && !loading && (
          <div className="card empty-state">
            <div className="empty-state-icon">🎯</div>
            <p className="empty-state-text">Nenhuma meta de longo prazo</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? '✏️ Editar Meta' : '➕ Nova Meta'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(null); }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Nome</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="RESERVA_EMERGENCIA">Reserva de Emergência</option>
                      <option value="INVESTIMENTO">Investimento</option>
                      <option value="PATRIMONIO">Patrimônio</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Data Alvo</label>
                    <input type="date" className="form-input" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Valor Alvo (R$)</label>
                    <input type="number" step="0.01" className="form-input" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor Atual (R$)</label>
                    <input type="number" step="0.01" className="form-input" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Aporte Mensal (R$)</label>
                    <input type="number" step="0.01" className="form-input" value={form.monthlyContribution} onChange={e => setForm(f => ({ ...f, monthlyContribution: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Investimento Vinculado</label>
                    <select className="form-select" value={form.investmentId} onChange={e => setForm(f => ({ ...f, investmentId: e.target.value }))}>
                      <option value="">Nenhum</option>
                      {investments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
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
