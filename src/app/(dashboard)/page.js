'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import MonthCalendar from '@/components/MonthCalendar';
import DailyLedger from '@/components/DailyLedger';
import DayDetail from '@/components/DayDetail';
import { formatBRL, getMonthName, getMonthShort } from '@/lib/utils';
import { shiftMonth } from '@/lib/calendar';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

const CHART_MONTHS = 6;

const tooltipStyle = {
  backgroundColor: '#12121e',
  titleColor: '#f0f0f8',
  bodyColor: '#f0f0f8',
  borderColor: '#2a2a44',
  borderWidth: 1,
};

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [months, setMonths] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProjections, setShowProjections] = useState(true);
  const [carryOver, setCarryOver] = useState(false);
  const [gridMetric, setGridMetric] = useState('both');
  const [onlyWithMovement, setOnlyWithMovement] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchData = useCallback(async () => {
    // Busca a partir do mês anterior: assim a comparação e o gráfico de
    // tendência saem do mesmo cálculo que a tela mostra.
    const first = shiftMonth(year, month, -1);
    const params = new URLSearchParams({
      year: first.year,
      month: first.month,
      months: CHART_MONTHS,
      projections: showProjections ? '1' : '0',
      carryOver: carryOver ? '1' : '0',
    });

    const [sumRes, calRes, accRes, invRes] = await Promise.all([
      fetch(`/api/summary?year=${year}&month=${month}`),
      fetch(`/api/calendar?${params}`),
      fetch('/api/accounts'),
      fetch('/api/investments'),
    ]);

    setSummary(await sumRes.json());
    setMonths((await calRes.json()).months || []);
    setAccounts(await accRes.json());
    setInvestments(await invRes.json());
    setLoading(false);
  }, [year, month, showProjections, carryOver]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const previous = months[0] || null;
  const calendar = months[1] || null;

  const selectedDay = useMemo(
    () => calendar?.days.find(d => d.date === selectedDate) || null,
    [calendar, selectedDate],
  );

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

  const { totalBalance, savings } = summary;
  const t = calendar.totals;

  const periodIncome = t.income + (showProjections ? t.plannedIncome : 0);
  const periodExpense = t.expense + (showProjections ? t.plannedExpense : 0);
  const periodInvested = t.investment;
  const periodResult = periodIncome - periodExpense - periodInvested;

  // Compara resultado projetado com resultado projetado — antes o número do
  // topo incluía previsões e a variação comparava só o realizado, o que
  // produzia "-100%" em meses ainda sem lançamento.
  const previousResult = previous
    ? (previous.totals.income + (showProjections ? previous.totals.plannedIncome : 0))
      - (previous.totals.expense + (showProjections ? previous.totals.plannedExpense : 0))
      - previous.totals.investment
    : null;

  const resultDelta = previousResult === null ? null : periodResult - previousResult;
  const resultPct = previousResult ? (resultDelta / Math.abs(previousResult)) * 100 : null;

  const stats = showProjections ? calendar.statsProjected : calendar.stats;
  const lowestDay = calendar.days.reduce(
    (worst, d) => (worst && worst.balance <= d.balance ? worst : d),
    null,
  );
  const firstNegative = calendar.days.find(d => d.balance < 0) || null;

  // --- Tendência: inclui previsões, senão meses futuros ficam vazios ---
  const barData = {
    labels: months.map(m => getMonthShort(m.month)),
    datasets: [
      {
        label: 'Entradas',
        data: months.map(m => m.totals.income + m.totals.plannedIncome),
        backgroundColor: 'rgba(0, 206, 201, 0.7)',
        borderColor: '#00cec9',
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: 'Saídas',
        data: months.map(m => m.totals.expense + m.totals.plannedExpense),
        backgroundColor: 'rgba(255, 107, 107, 0.7)',
        borderColor: '#ff6b6b',
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: 'Investido',
        data: months.map(m => m.totals.investment),
        backgroundColor: 'rgba(162, 155, 254, 0.7)',
        borderColor: '#a29bfe',
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
      tooltip: { ...tooltipStyle, callbacks: { label: ctx => `${ctx.dataset.label}: ${formatBRL(ctx.raw)}` } },
    },
    scales: {
      x: { ticks: { color: '#55556a' }, grid: { color: 'rgba(42,42,68,0.5)' } },
      y: { ticks: { color: '#55556a', callback: v => formatBRL(v) }, grid: { color: 'rgba(42,42,68,0.5)' } },
    },
  };

  // --- Curva do saldo dentro do mês ---
  const balances = calendar.days.map(d => d.balance);
  const lineData = {
    labels: calendar.days.map(d => String(d.day).padStart(2, '0')),
    datasets: [{
      label: 'Saldo',
      data: balances,
      borderColor: '#6c5ce7',
      backgroundColor: 'rgba(108, 92, 231, 0.12)',
      fill: true,
      tension: 0.25,
      pointRadius: (ctx) => (calendar.days[ctx.dataIndex]?.hasMovement ? 3.5 : 0),
      pointBackgroundColor: (ctx) => (balances[ctx.dataIndex] < 0 ? '#ff6b6b' : '#a29bfe'),
      pointBorderColor: (ctx) => (balances[ctx.dataIndex] < 0 ? '#ff6b6b' : '#6c5ce7'),
      segment: {
        borderColor: (ctx) => (ctx.p1.parsed.y < 0 ? '#ff6b6b' : '#6c5ce7'),
      },
    }],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items) => `Dia ${items[0].label}`,
          label: (ctx) => `Saldo: ${formatBRL(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: '#55556a', maxTicksLimit: 12 }, grid: { display: false } },
      y: {
        ticks: { color: '#55556a', callback: v => formatBRL(v) },
        grid: { color: (ctx) => (ctx.tick.value === 0 ? 'rgba(255,107,107,0.5)' : 'rgba(42,42,68,0.5)') },
      },
    },
  };

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

      <div className="filters-bar">
        <label className="switch-label">
          <input type="checkbox" checked={showProjections} onChange={e => setShowProjections(e.target.checked)} />
          Incluir previsões
        </label>
        <span className="filters-divider" />
        <label className="switch-label">
          <input type="checkbox" checked={carryOver} onChange={e => setCarryOver(e.target.checked)} />
          Trazer saldo do mês anterior
        </label>
      </div>

      {/* KPIs */}
      <div className="stat-cards">
        <div className="card stat-card balance">
          <div className="stat-label">Resultado do Período</div>
          <div className={`stat-value ${periodResult >= 0 ? 'positive' : 'negative'}`}>{formatBRL(periodResult)}</div>
          {resultDelta === null ? (
            <div className="stat-change">sem mês anterior para comparar</div>
          ) : (
            <div className={`stat-change ${resultDelta >= 0 ? 'up' : 'down'}`}>
              {resultDelta >= 0 ? '▲' : '▼'} {formatBRL(Math.abs(resultDelta))}
              {resultPct !== null && ` (${Math.abs(resultPct).toFixed(0)}%)`} vs {getMonthShort(previous.month)}
            </div>
          )}
        </div>
        <div className="card stat-card income">
          <div className="stat-label">Receitas</div>
          <div className="stat-value positive">{formatBRL(periodIncome)}</div>
          {showProjections && t.plannedIncome > 0 && (
            <div className="stat-change">{formatBRL(t.plannedIncome)} previstos</div>
          )}
        </div>
        <div className="card stat-card expense">
          <div className="stat-label">Despesas</div>
          <div className="stat-value negative">{formatBRL(periodExpense)}</div>
          {periodInvested > 0 && (
            <div className="stat-change">+ {formatBRL(periodInvested)} investidos</div>
          )}
        </div>
        <div className="card stat-card variation">
          <div className="stat-label">Saldo em conta</div>
          <div className="stat-value">{formatBRL(totalBalance)}</div>
          {savings > 0 && <div className="stat-change">+ {formatBRL(savings)} guardados</div>}
        </div>
      </div>

      {/* Grade + extrato */}
      <div className="dash-grid">
        <div className="card panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Movimento por dia</div>
              <div className="panel-subtitle">
                {getMonthName(month).toLowerCase()} {year}
              </div>
            </div>
            <div className="segmented">
              <button className={gridMetric === 'both' ? 'active' : ''} onClick={() => setGridMetric('both')}>Tudo</button>
              <button className={gridMetric === 'expense' ? 'active' : ''} onClick={() => setGridMetric('expense')}>Saídas</button>
              <button className={gridMetric === 'income' ? 'active' : ''} onClick={() => setGridMetric('income')}>Entradas</button>
            </div>
          </div>

          <div className="panel-headline">
            <strong className={gridMetric === 'income' ? 'amount-income' : ''}>
              {formatBRL(gridMetric === 'income' ? periodIncome : periodExpense)}
            </strong>
            <span>
              {gridMetric === 'income'
                ? 'entraram no mês'
                : `em ${stats.daysWithExpense} ${stats.daysWithExpense === 1 ? 'dia com saída' : 'dias com saída'}`}
            </span>
          </div>

          <MonthCalendar
            month={calendar}
            metric={gridMetric}
            size="sm"
            showProjections={showProjections}
            showHeader={false}
            selectedDate={selectedDate}
            onDayClick={(d) => setSelectedDate(d.date)}
          />

          <div className="panel-footer">
            <div>
              <div className="stat-label">Média por dia</div>
              <div className="footer-value">{formatBRL(stats.avgPerDay)}</div>
            </div>
            <div>
              <div className="stat-label">Maior saída</div>
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
            <div className="panel-footer-hint">Clique num dia para ver e lançar</div>
          </div>
        </div>

        <div className="card panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Saldo dia a dia</div>
              <div className="panel-subtitle">
                {carryOver ? 'Continuando do mês anterior' : 'Cada mês começa do zero'}
              </div>
            </div>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={!onlyWithMovement}
                onChange={e => setOnlyWithMovement(!e.target.checked)}
              />
              Todos os dias
            </label>
          </div>

          <div className="ledger-summary">
            <div>
              <div className="stat-label">Abre com</div>
              <div className={`footer-value ${calendar.openingBalance < 0 ? 'negative-text' : ''}`}>
                {formatBRL(calendar.openingBalance)}
              </div>
            </div>
            <div>
              <div className="stat-label">Fecha com</div>
              <div className={`footer-value ${calendar.closingBalance < 0 ? 'negative-text' : ''}`}>
                {formatBRL(calendar.closingBalance)}
              </div>
            </div>
            <div>
              <div className="stat-label">Menor saldo</div>
              <div className={`footer-value ${lowestDay && lowestDay.balance < 0 ? 'negative-text' : ''}`}>
                {lowestDay
                  ? `${String(lowestDay.day).padStart(2, '0')}/${String(month).padStart(2, '0')} · ${formatBRL(lowestDay.balance)}`
                  : '—'}
              </div>
            </div>
          </div>

          {firstNegative && (
            <div className="ledger-alert">
              O saldo fica negativo a partir de {String(firstNegative.day).padStart(2, '0')}/{String(month).padStart(2, '0')} —
              é preciso repor {formatBRL(Math.abs(lowestDay.balance))} para atravessar o mês.
            </div>
          )}

          <DailyLedger
            months={[calendar]}
            onlyWithMovement={onlyWithMovement}
            selectedDate={selectedDate}
            onDayClick={(d) => setSelectedDate(d.date)}
            compact
          />
        </div>
      </div>

      {/* Curva do saldo + tendência */}
      <div className="dash-grid">
        <div className="card chart-card">
          <div className="chart-title">📉 Curva do saldo em {getMonthName(month).toLowerCase()}</div>
          <div className="chart-wrapper">
            <Line data={lineData} options={lineOptions} />
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-title">📊 Entradas, saídas e aportes ({CHART_MONTHS} meses)</div>
          <div className="chart-wrapper">
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
      </div>

      {selectedDay && (
        <DayDetail
          day={selectedDay}
          accounts={accounts}
          investments={investments}
          onClose={() => setSelectedDate(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
