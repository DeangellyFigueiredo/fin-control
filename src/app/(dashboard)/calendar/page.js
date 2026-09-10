'use client';

import { useState, useEffect, useCallback } from 'react';
import MonthCalendar from '@/components/MonthCalendar';
import DayDetail from '@/components/DayDetail';
import { formatBRL, getMonthName } from '@/lib/utils';
import { shiftMonth } from '@/lib/calendar';

const RANGES = [
  { months: 1, label: '1 mês' },
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '12 meses' },
];

const METRICS = [
  { value: 'both', label: 'Entradas e saídas' },
  { value: 'expense', label: 'Só saídas' },
  { value: 'income', label: 'Só entradas' },
];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [range, setRange] = useState(1);
  const [metric, setMetric] = useState('both');
  const [showProjections, setShowProjections] = useState(true);
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      year, month, months: range,
      projections: showProjections ? '1' : '0',
    });
    const res = await fetch(`/api/calendar?${params}`);
    const data = await res.json();
    setMonths(data.months || []);
    setLoading(false);
  }, [year, month, range, showProjections]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const step = (offset) => {
    const next = shiftMonth(year, month, offset);
    setYear(next.year);
    setMonth(next.month);
  };

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  const grandTotals = months.reduce((acc, m) => ({
    income: acc.income + m.totals.income + (showProjections ? m.totals.plannedIncome : 0),
    expense: acc.expense + m.totals.expense + (showProjections ? m.totals.plannedExpense : 0),
  }), { income: 0, expense: 0 });

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendário</h1>
          <p className="page-subtitle">Dia a dia das entradas e saídas, mês a mês</p>
        </div>
        <div className="cal-nav">
          <button className="btn-icon" onClick={() => step(-1)} aria-label="Mês anterior">‹</button>
          <span className="cal-nav-label">{getMonthName(month)} {year}</span>
          <button className="btn-icon" onClick={() => step(1)} aria-label="Próximo mês">›</button>
          <button className="btn btn-secondary btn-sm" onClick={goToday}>Hoje</button>
        </div>
      </div>

      <div className="filters-bar">
        {RANGES.map(r => (
          <button
            key={r.months}
            className={`filter-chip ${range === r.months ? 'active' : ''}`}
            onClick={() => setRange(r.months)}
          >
            {r.label}
          </button>
        ))}

        <span className="filters-divider" />

        <select className="form-select" style={{ width: 'auto' }} value={metric} onChange={e => setMetric(e.target.value)}>
          {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <label className="switch-label">
          <input
            type="checkbox"
            checked={showProjections}
            onChange={e => setShowProjections(e.target.checked)}
          />
          Incluir previsões (recorrentes e cartões)
        </label>
      </div>

      <div className="stat-cards">
        <div className="card stat-card income">
          <div className="stat-label">Entradas no período</div>
          <div className="stat-value positive">{formatBRL(grandTotals.income)}</div>
        </div>
        <div className="card stat-card expense">
          <div className="stat-label">Saídas no período</div>
          <div className="stat-value negative">{formatBRL(grandTotals.expense)}</div>
        </div>
        <div className="card stat-card balance">
          <div className="stat-label">Resultado do período</div>
          <div className={`stat-value ${grandTotals.income - grandTotals.expense >= 0 ? 'positive' : 'negative'}`}>
            {formatBRL(grandTotals.income - grandTotals.expense)}
          </div>
        </div>
        <div className="card stat-card variation">
          <div className="stat-label">Meses exibidos</div>
          <div className="stat-value">{months.length}</div>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="skeleton" style={{ height: 380 }} /></div>
      ) : (
        <div className={`months-grid ${range > 1 ? 'multi' : ''}`}>
          {months.map(m => {
            const income = m.totals.income + (showProjections ? m.totals.plannedIncome : 0);
            const expense = m.totals.expense + (showProjections ? m.totals.plannedExpense : 0);

            return (
              <div key={`${m.year}-${m.month}`} className="card month-card">
                <div className="month-card-header">
                  <div className="cal-month-title">
                    {getMonthName(m.month)} <span>{m.year}</span>
                  </div>
                  <div className="month-card-totals">
                    <span className="amount-income">+{formatBRL(income)}</span>
                    <span className="amount-expense">-{formatBRL(expense)}</span>
                    <span className={income - expense >= 0 ? 'amount-income' : 'amount-expense'}>
                      = {formatBRL(income - expense)}
                    </span>
                  </div>
                </div>

                <MonthCalendar
                  month={m}
                  metric={metric}
                  size={range > 1 ? 'sm' : 'lg'}
                  showProjections={showProjections}
                  showHeader={false}
                  selectedDate={selectedDay?.date}
                  onDayClick={setSelectedDay}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="cal-legend">
        <span><i className="legend-dot marker-opening" /> Abertura do cartão</span>
        <span><i className="legend-dot marker-due" /> Vencimento</span>
        <span><i className="legend-dot marker-payment" /> Pagamento</span>
        <span><i className="legend-dot legend-today" /> Hoje</span>
        <span className="cal-legend-hint">Clique num dia para ver os lançamentos</span>
      </div>

      {selectedDay && <DayDetail day={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}
