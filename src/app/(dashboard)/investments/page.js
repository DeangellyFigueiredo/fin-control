'use client';

import { useState, useEffect } from 'react';
import { formatBRL, formatDate, todayISO } from '@/lib/utils';
import { CHART_PALETTE, CHART_PALETTE_LIGHT, nextChartColor } from '@/lib/defaults';
import { useTheme } from '@/components/ThemeProvider';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, LineElement, PointElement, Filler,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import BalanceUpdate from '@/components/BalanceUpdate';
import { serieDaCarteira, serieDe, totaisDaCarteira, rendimentoNoPeriodo, ultimaAtualizacao } from '@/lib/investments';
import MoneyInput from '@/components/MoneyInput';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, LineElement, PointElement, Filler);

export default function InvestmentsPage() {
  const { theme, chart } = useTheme();
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [selectedInv, setSelectedInv] = useState(null);
  // Qual investimento está com o saldo sendo atualizado, e qual curva a tela
  // mostra: a carteira inteira ou um deles.
  const [atualizando, setAtualizando] = useState(null);
  const [curva, setCurva] = useState('todos');

  const [form, setForm] = useState({ name: '', type: 'RENDA_FIXA', institution: '', currentValue: '', totalInvested: '', cdiPercentage: '100', color: CHART_PALETTE[0] });
  const [savingColor, setSavingColor] = useState(null);
  const [entryForm, setEntryForm] = useState({ investmentId: '', date: todayISO(), type: 'APORTE', amount: '', description: '' });

  const fetchData = async () => {
    const res = await fetch('/api/investments');
    setInvestments(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const totais = totaisDaCarteira(investments);
  const totalValue = totais.saldo;
  const totalInvested = totais.investido;
  const totalProfit = totais.lucro;

  // Quanto a carteira rendeu nos últimos 30 dias, somando só o que foi anotado
  const trintaDias = new Date(Date.now() - 30 * 86400000);
  const rendimento30 = rendimentoNoPeriodo(investments, trintaDias);

  const escolhido = curva === 'todos' ? null : investments.find(i => i.id === curva);
  const serie = escolhido ? serieDe(escolhido) : serieDaCarteira(investments);

  const handleCreateInvestment = async (e) => {
    e.preventDefault();
    await fetch('/api/investments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ name: '', type: 'RENDA_FIXA', institution: '', currentValue: '', totalInvested: '', cdiPercentage: '100', color: CHART_PALETTE[0] });
    fetchData();
  };

  const handleCreateEntry = async (e) => {
    e.preventDefault();
    await fetch('/api/investments/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entryForm),
    });
    setShowEntryForm(false);
    setEntryForm({ investmentId: '', date: todayISO(), type: 'APORTE', amount: '', description: '' });
    fetchData();
  };

  // A cor gravada é o passo escuro da paleta. No tema claro, troca pelo par
  // equivalente, que foi validado contra fundo branco.
  const forTheme = (cor) => {
    if (!cor) return '#8a8aa3';
    if (theme !== 'light') return cor;
    const i = CHART_PALETTE.indexOf(cor);
    return i >= 0 ? CHART_PALETTE_LIGHT[i] : cor;
  };

  const typeLabels = { RENDA_FIXA: 'Renda Fixa', RENDA_VARIAVEL: 'Renda Variável', CRIPTO: 'Cripto', OUTRO: 'Outro' };

  const changeColor = async (inv, color) => {
    setSavingColor(inv.id);
    await fetch('/api/investments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, color }),
    });
    setSavingColor(null);
    fetchData();
  };

  const openForm = () => {
    setForm(f => ({ ...f, color: nextChartColor(investments.map(i => i.color)) }));
    setShowForm(true);
  };

  const doughnutData = {
    labels: investments.map(i => i.name),
    datasets: [{
      data: investments.map(i => i.currentValue),
      // Cor própria de cada investimento — antes vinha do tipo, então dois
      // investimentos do mesmo tipo saíam idênticos no gráfico.
      backgroundColor: investments.map(i => forTheme(i.color)),
      // Anel na cor da superfície separa fatias vizinhas de tom parecido.
      borderColor: chart.surface,
      borderWidth: 2,
      hoverOffset: 6,
    }],
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Investimentos</h1>
          <p className="page-subtitle">Acompanhe a evolução do seu patrimônio</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => setShowEntryForm(true)}><Icon name="nota" /> Novo Aporte</button>
          <button className="btn btn-primary" onClick={openForm}><Icon name="adicionar" /> Novo Investimento</button>
        </div>
      </div>

      {/* Summary */}
      <div className="stat-cards">
        <div className="card stat-card balance">
          <div className="stat-label">Patrimônio Total</div>
          <div className="stat-value positive">{formatBRL(totalValue)}</div>
        </div>
        <div className="card stat-card income">
          <div className="stat-label">Total Investido</div>
          <div className="stat-value">{formatBRL(totalInvested)}</div>
        </div>
        <div className="card stat-card variation">
          <div className="stat-label">Lucro Total</div>
          <div className={`stat-value ${totalProfit >= 0 ? 'positive' : 'negative'}`}>{formatBRL(totalProfit)}</div>
          {totais.percentual !== null && (
            <div className={`stat-change ${totalProfit >= 0 ? 'up' : 'down'}`}>
              {totais.percentual > 0 ? '+' : ''}{totais.percentual.toFixed(2)}% sobre o investido
            </div>
          )}
        </div>
        <div className="card stat-card balance">
          <div className="stat-label">Rendeu em 30 dias</div>
          <div className={`stat-value ${rendimento30 >= 0 ? 'positive' : 'negative'}`}>{formatBRL(rendimento30)}</div>
          <div className="stat-change">somando os saldos que você anotou</div>
        </div>
      </div>

      {/* Evolução: a distância entre as duas linhas é o lucro */}
      <div className="card chart-card" style={{ marginBottom: 28 }}>
        <div className="panel-header">
          <div>
            <div className="chart-title"><Icon name="curva" /> Evolução do saldo</div>
            <div className="panel-subtitle">
              {serie.length > 1
                ? 'Cada ponto é uma vez que você anotou o saldo ou movimentou'
                : 'Anote o saldo algumas vezes e a curva aparece aqui'}
            </div>
          </div>
          {investments.length > 1 && (
            <select className="form-select" value={curva} onChange={e => setCurva(e.target.value)}>
              <option value="todos">Carteira inteira</option>
              {investments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          )}
        </div>

        {serie.length > 1 ? (
          <div className="chart-wrapper">
            <Line
              data={{
                labels: serie.map(p => formatDate(`${p.date}T00:00:00.000Z`)),
                datasets: [
                  {
                    label: 'Saldo',
                    data: serie.map(p => p.saldo),
                    borderColor: chart.income,
                    backgroundColor: chart.incomeFill,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 3,
                  },
                  {
                    label: 'Investido',
                    data: serie.map(p => p.investido),
                    borderColor: chart.muted,
                    borderDash: [5, 4],
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                  legend: { labels: { color: chart.text, font: { family: 'Inter', size: 12 } } },
                  tooltip: {
                    backgroundColor: chart.tooltipBg,
                    titleColor: chart.tooltipText,
                    bodyColor: chart.tooltipText,
                    borderColor: chart.tooltipBorder,
                    borderWidth: 1,
                    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatBRL(ctx.raw)}` },
                  },
                },
                scales: {
                  x: { ticks: { color: chart.muted, maxTicksLimit: 8 }, grid: { display: false } },
                  y: { ticks: { color: chart.muted, callback: v => formatBRL(v) }, grid: { color: chart.grid } },
                },
              }}
            />
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-state-text">
              Sem histórico ainda. Use <strong>Atualizar saldo</strong> num investimento
              para começar a registrar como ele cresce.
            </p>
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 28 }}>
        {/* Chart */}
        <div className="card" style={{ padding: 24 }}>
          <div className="chart-title"><Icon name="grafico" /> Distribuição</div>
          {investments.length > 0 ? (
            <>
              <div style={{ maxWidth: 240, margin: '0 auto' }}>
                <Doughnut data={doughnutData} options={{
                  cutout: '62%',
                  plugins: {
                    // Legenda própria abaixo: mais legível e com valor.
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: chart.tooltipBg,
                      titleColor: chart.tooltipText,
                      bodyColor: chart.tooltipText,
                      borderColor: chart.tooltipBorder,
                      borderWidth: 1,
                      callbacks: { label: (ctx) => `${ctx.label}: ${formatBRL(ctx.raw)}` },
                    },
                  },
                }} />
              </div>

              {/* Rótulo direto: a cor é pista secundária, o nome identifica */}
              <div className="inv-legend">
                {investments.map(inv => {
                  const pct = totalValue > 0 ? (inv.currentValue / totalValue) * 100 : 0;
                  return (
                    <div key={inv.id} className="inv-legend-row">
                      <span className="inv-swatch" style={{ background: forTheme(inv.color) }} />
                      <span className="inv-legend-name">{inv.name}</span>
                      <span className="inv-legend-pct">{pct.toFixed(0)}%</span>
                      <span className="inv-legend-value">{formatBRL(inv.currentValue)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state"><p className="empty-state-text">Sem dados</p></div>
          )}
        </div>

        {/* Investment cards */}
        <div>
          <div className="section-title"> Seus Investimentos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {investments.map(inv => (
              <div key={inv.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{inv.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {typeLabels[inv.type]} • {inv.institution}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="badge badge-income">{inv.cdiPercentage}% CDI</span>
                    <ColorPicker
                      value={inv.color}
                      busy={savingColor === inv.id}
                      onChange={(c) => changeColor(inv, c)}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div>
                    <div className="stat-label">Valor Atual</div>
                    <div style={{ fontWeight: 700, color: 'var(--income)' }}>{formatBRL(inv.currentValue)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Investido</div>
                    <div style={{ fontWeight: 600 }}>{formatBRL(inv.totalInvested)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Lucro</div>
                    <div style={{ fontWeight: 600, color: inv.profit >= 0 ? 'var(--income)' : 'var(--expense)' }}>{formatBRL(inv.profit)}</div>
                  </div>
                </div>
                <div className="inv-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setAtualizando(inv)}
                  >
                    <Icon name="curva" size={14} /> Atualizar saldo
                  </button>
                  <span className="inv-ultima">
                    {ultimaAtualizacao(inv)
                      ? `anotado em ${formatDate(ultimaAtualizacao(inv))}`
                      : 'nunca anotado'}
                  </span>
                </div>

                {inv.entries && inv.entries.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Últimas movimentações</div>
                    {inv.entries.slice(0, 3).map(entry => (
                      <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {formatDate(entry.date)} - <Icon name={entry.type === 'APORTE' ? 'entrada' : entry.type === 'RESGATE' ? 'saida' : 'investimentos'} /> {entry.description || entry.type}
                        </span>
                        <span style={{ fontWeight: 600, color: entry.type === 'RESGATE' ? 'var(--expense)' : 'var(--income)' }}>
                          {formatBRL(entry.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {investments.length === 0 && !loading && (
              <div className="card empty-state">
                <div className="empty-state-icon"><Icon name="investimentos" /></div>
                <p className="empty-state-text">Nenhum investimento cadastrado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Investment Modal */}
      {showForm && (
        <Modal onClose={() => { setShowForm(false); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title"><Icon name="adicionar" /> Novo Investimento</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><Icon name="fechar" /></button>
            </div>
            <form onSubmit={handleCreateInvestment}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Nome</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: CDB Inter" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="RENDA_FIXA">Renda Fixa</option>
                      <option value="RENDA_VARIAVEL">Renda Variável</option>
                      <option value="CRIPTO">Cripto</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Instituição</label>
                    <input className="form-input" value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} placeholder="Ex: Inter" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">% CDI</label>
                  <input type="number" step="0.1" className="form-input" value={form.cdiPercentage} onChange={e => setForm(f => ({ ...f, cdiPercentage: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cor no gráfico</label>
                  <div className="color-picker-grid inline">
                    {CHART_PALETTE.map(c => (
                      <button
                        key={c}
                        type="button"
                        className={`color-swatch ${form.color === c ? 'active' : ''}`}
                        style={{ background: c }}
                        onClick={() => setForm(f => ({ ...f, color: c }))}
                        aria-label={c}
                      />
                    ))}
                    <input
                      type="color"
                      className="color-swatch-custom"
                      value={form.color}
                      onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                      aria-label="Outra cor"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Criar</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* New Entry Modal */}
      {atualizando && (
        <BalanceUpdate
          investment={atualizando}
          onClose={() => setAtualizando(null)}
          onSaved={() => { setAtualizando(null); fetchData(); }}
        />
      )}

      {showEntryForm && (
        <Modal onClose={() => { setShowEntryForm(false); }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title"><Icon name="nota" /> Nova Movimentação</h2>
              <button className="modal-close" onClick={() => setShowEntryForm(false)}><Icon name="fechar" /></button>
            </div>
            <form onSubmit={handleCreateEntry}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Investimento</label>
                  <select className="form-select" value={entryForm.investmentId} onChange={e => setEntryForm(f => ({ ...f, investmentId: e.target.value }))} required>
                    <option value="">Selecione...</option>
                    {investments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={entryForm.type} onChange={e => setEntryForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="APORTE">Aporte</option>
                      <option value="RESGATE">Resgate</option>
                      {/* Rendimento não entra aqui: ele nasce de "Atualizar
                          saldo", onde a conta é feita pelo app. Dois caminhos
                          para a mesma coisa só criariam divergência. */}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Data</label>
                    <input type="date" className="form-input" value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Valor (R$)</label>
                    <MoneyInput className="form-input" value={entryForm.amount} onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Descrição</label>
                    <input className="form-input" value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEntryForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar</button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Cores da paleta validada, mais um campo livre para qualquer outra. */
function ColorPicker({ value, onChange, busy }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="color-picker">
      <button
        type="button"
        className="color-picker-trigger"
        style={{ background: value || '#8a8aa3' }}
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        aria-label="Alterar cor no gráfico"
        title="Alterar cor no gráfico"
      />
      {open && (
        <>
          <span className="color-picker-backdrop" onClick={() => setOpen(false)} />
          <span className="color-picker-pop">
            <span className="color-picker-grid">
              {CHART_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${value === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => { onChange(c); setOpen(false); }}
                  aria-label={c}
                />
              ))}
            </span>
            <label className="color-picker-custom">
              Outra
              <input
                type="color"
                value={value || '#8a8aa3'}
                onChange={e => onChange(e.target.value)}
              />
            </label>
          </span>
        </>
      )}
    </span>
  );
}
