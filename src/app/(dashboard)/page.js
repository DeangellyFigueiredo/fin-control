'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import MonthCalendar from '@/components/MonthCalendar';
import DayDetail from '@/components/DayDetail';
import { formatBRL, getMonthName, getMonthShort } from '@/lib/utils';
import { shiftMonth } from '@/lib/calendar';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tagType, setTagType] = useState('EXPENSE');
  const [showProjections, setShowProjections] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [sumRes, calRes] = await Promise.all([
      fetch(`/api/summary?year=${year}&month=${month}`),
      fetch(`/api/calendar?year=${year}&month=${month}&months=1&projections=${showProjections ? 1 : 0}`),
    ]);
    setSummary(await sumRes.json());
    setCalendar((await calRes.json()).months?.[0] || null);
    setLoading(false);
  }, [year, month, showProjections]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const step = (offset) => {
    const next = shiftMonth(year, month, offset);
    setYear(next.year);
    setMonth(next.month);
  };

  if (loading || !summary || !calendar) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Dashboard</h1></div>
        <div className="stat-cards">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card stat-card">
              <div className="skeleton" style={{ height: 18, width: '55%', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 32, width: '80%' }} />
            </div>
          ))}
        </div>
        <div className="dash-grid">
          <div className="card"><div className="skeleton" style={{ height: 420 }} /></div>
          <div className="card"><div className="skeleton" style={{ height: 420 }} /></div>
        </div>
      </div>
    );
  }

  const { totalBalance, currentIncome, currentExpenses, variation, monthlySummaries, byCategory, uncategorizedCount, savings } = summary;

  const plannedIncome = showProjections ? calendar.totals.plannedIncome : 0;
  const plannedExpense = showProjections ? calendar.totals.plannedExpense : 0;
  const periodIncome = currentIncome + plannedIncome;
  const periodExpense = currentExpenses + plannedExpense;
  const periodResult = periodIncome - periodExpense;

  const tags = byCategory[tagType] || [];
  const tagTotal = tags.reduce((s, t) => s + t.amount, 0);
  const tagPeak = tags[0]?.amount || 0;

  const donutData = {
    labels: tags.map(t => t.name),
    datasets: [{
      data: tags.map(t => t.amount),
      backgroundColor: tags.map(t => t.color),
      borderColor: '#1a1a2e',
      borderWidth: 2,
      hoverOffset: 6,
    }],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#12121e',
        titleColor: '#f0f0f8',
        bodyColor: '#f0f0f8',
        borderColor: '#2a2a44',
        borderWidth: 1,
        callbacks: { label: ctx => `${ctx.label}: ${formatBRL(ctx.raw)}` },
      },
    },
  };

  const barData = {
    labels: monthlySummaries.map(s => getMonthShort(s.month)),
    datasets: [
      {
        label: 'Entradas',
        data: monthlySummaries.map(s => s.income),
        backgroundColor: 'rgba(0, 206, 201, 0.7)',
        borderColor: '#00cec9',
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: 'Saídas',
        data: monthlySummaries.map(s => s.expenses),
        backgroundColor: 'rgba(255, 107, 107, 0.7)',
        borderColor: '#ff6b6b',
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#8888a8', font: { family: 'Inter', size: 12 } } },
      tooltip: {
        backgroundColor: '#12121e',
        titleColor: '#f0f0f8',
        bodyColor: '#f0f0f8',
        borderColor: '#2a2a44',
        borderWidth: 1,
        callbacks: { label: ctx => `${ctx.dataset.label}: ${formatBRL(ctx.raw)}` },
      },
    },
    scales: {
      x: { ticks: { color: '#55556a' }, grid: { color: 'rgba(42,42,68,0.5)' } },
      y: { ticks: { color: '#55556a', callback: v => formatBRL(v) }, grid: { color: 'rgba(42,42,68,0.5)' } },
    },
  };

  const stats = showProjections ? calendar.statsProjected : calendar.stats;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Visão geral do seu controle financeiro</p>
        </div>
        <div className="cal-nav">
          <button className="btn-icon" onClick={() => step(-1)} aria-label="Mês anterior">‹</button>
          <span className="cal-nav-label">{getMonthName(month)} {year}</span>
          <button className="btn-icon" onClick={() => step(1)} aria-label="Próximo mês">›</button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
          >
            Hoje
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-cards">
        <div className="card stat-card balance">
          <div className="stat-label">Resultado do Período</div>
          <div className={`stat-value ${periodResult >= 0 ? 'positive' : 'negative'}`}>{formatBRL(periodResult)}</div>
          <div className={`stat-change ${variation >= 0 ? 'up' : 'down'}`}>
            {variation >= 0 ? '▲' : '▼'} {Math.abs(variation).toFixed(1)}% vs mês anterior
          </div>
        </div>
        <div className="card stat-card income">
          <div className="stat-label">Receitas</div>
          <div className="stat-value positive">{formatBRL(periodIncome)}</div>
          {plannedIncome > 0 && <div className="stat-change">{formatBRL(plannedIncome)} previstos</div>}
        </div>
        <div className="card stat-card expense">
          <div className="stat-label">Despesas</div>
          <div className="stat-value negative">{formatBRL(periodExpense)}</div>
          {plannedExpense > 0 && <div className="stat-change">{formatBRL(plannedExpense)} previstos</div>}
        </div>
        <div className="card stat-card variation">
          <div className="stat-label">Saldo em conta</div>
          <div className="stat-value">{formatBRL(totalBalance)}</div>
          {savings > 0 && <div className="stat-change">+ {formatBRL(savings)} guardados</div>}
        </div>
      </div>

      {/* Day-by-day + tags */}
      <div className="dash-grid">
        <div className="card panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Saídas por dia</div>
              <div className="panel-subtitle">
                {getMonthName(month).toLowerCase()} {year} · quanto saiu em cada dia
              </div>
            </div>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={showProjections}
                onChange={e => setShowProjections(e.target.checked)}
              />
              Previsões
            </label>
          </div>

          <div className="panel-headline">
            <strong>{formatBRL(periodExpense)}</strong>
            <span>em {stats.daysWithExpense} {stats.daysWithExpense === 1 ? 'dia com saída' : 'dias com saída'}</span>
          </div>

          <MonthCalendar
            month={calendar}
            metric="expense"
            size="sm"
            showProjections={showProjections}
            showHeader={false}
            selectedDate={selectedDay?.date}
            onDayClick={setSelectedDay}
          />

          <div className="panel-footer">
            <div>
              <div className="stat-label">Média por dia</div>
              <div className="footer-value">{formatBRL(stats.avgPerDay)}</div>
            </div>
            <div>
              <div className="stat-label">Maior dia</div>
              <div className="footer-value">
                {stats.maxDay
                  ? `${String(stats.maxDay.day).padStart(2, '0')}/${String(month).padStart(2, '0')} · ${formatBRL(stats.maxDay.expense)}`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="stat-label">Dias sem saída</div>
              <div className="footer-value">{stats.daysWithoutExpense}</div>
            </div>
            <div className="panel-footer-hint">Clique num dia para ver as transações</div>
          </div>
        </div>

        <div className="card panel">
          <div className="panel-header">
            <div className="panel-title">Por categoria</div>
            <div className="segmented">
              <button
                className={tagType === 'EXPENSE' ? 'active' : ''}
                onClick={() => setTagType('EXPENSE')}
              >
                Despesas
              </button>
              <button
                className={tagType === 'INCOME' ? 'active' : ''}
                onClick={() => setTagType('INCOME')}
              >
                Receitas
              </button>
            </div>
          </div>

          {tags.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏷️</div>
              <p className="empty-state-text">Nenhum lançamento neste mês</p>
            </div>
          ) : (
            <>
              <div className="donut-wrap">
                <Doughnut data={donutData} options={donutOptions} />
                <div className="donut-center">
                  <div className="donut-value">{formatBRL(tagTotal)}</div>
                  <div className="donut-caption">total no mês</div>
                </div>
              </div>

              <div className="tag-list">
                {tags.map(tag => (
                  <div key={tag.id} className="tag-row">
                    <span className="tag-name">
                      <i className="tag-dot" style={{ background: tag.color }} />
                      {tag.name}
                    </span>
                    <span className="tag-bar">
                      <i style={{ width: `${tagPeak ? (tag.amount / tagPeak) * 100 : 0}%`, background: tag.color }} />
                    </span>
                    <span className="tag-amount">{formatBRL(tag.amount)}</span>
                  </div>
                ))}
              </div>

              {uncategorizedCount > 0 && (
                <div className="panel-note">
                  Dar categoria às transações sem categoria <span className="count-pill">{uncategorizedCount}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Trend */}
      <div className="card chart-card" style={{ marginBottom: 28 }}>
        <div className="chart-title">📊 Entradas vs Saídas (6 meses)</div>
        <div className="chart-wrapper">
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

      {selectedDay && <DayDetail day={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}
