'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import MonthCalendar from '@/components/MonthCalendar';
import DailyLedger from '@/components/DailyLedger';
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
  const [carryOver, setCarryOver] = useState(false);
  const [view, setView] = useState('grid');
  const [onlyWithMovement, setOnlyWithMovement] = useState(true);
  const [months, setMonths] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({
      year, month, months: range,
      projections: showProjections ? '1' : '0',
      carryOver: carryOver ? '1' : '0',
    });
    const [calRes, accRes, invRes] = await Promise.all([
      fetch(`/api/calendar?${params}`),
      fetch('/api/accounts'),
      fetch('/api/investments'),
    ]);
    setMonths((await calRes.json()).months || []);
    setAccounts(await accRes.json());
    setInvestments(await invRes.json());
    setLoading(false);
  }, [year, month, range, showProjections, carryOver]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  // Derivado dos dados atuais, para o modal se atualizar após um lançamento.
  const selectedDay = useMemo(() => {
    for (const m of months) {
      const found = m.days.find(d => d.date === selectedDate);
      if (found) return found;
    }
    return null;
  }, [months, selectedDate]);

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
        <div className="segmented">
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>
            Grade
          </button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            Lista
          </button>
        </div>

        <span className="filters-divider" />

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

        {view === 'grid' ? (
          <select className="form-select" style={{ width: 'auto' }} value={metric} onChange={e => setMetric(e.target.value)}>
            {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        ) : (
          <label className="switch-label">
            <input
              type="checkbox"
              checked={!onlyWithMovement}
              onChange={e => setOnlyWithMovement(!e.target.checked)}
            />
            Mostrar todos os dias
          </label>
        )}

        <label className="switch-label">
          <input
            type="checkbox"
            checked={showProjections}
            onChange={e => setShowProjections(e.target.checked)}
          />
          Incluir previsões (recorrentes e cartões)
        </label>

        <label className="switch-label">
          <input
            type="checkbox"
            checked={carryOver}
            onChange={e => setCarryOver(e.target.checked)}
          />
          Trazer saldo do mês anterior
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
      ) : view === 'list' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          {months.map(m => (
            <div key={`${m.year}-${m.month}`} className="ledger-month">
              <div className="ledger-month-head">
                <div className="cal-month-title">
                  {getMonthName(m.month)} <span>{m.year}</span>
                </div>
                <div className="month-card-totals">
                  <span>abre {formatBRL(m.openingBalance)}</span>
                  <span className={m.closingBalance >= 0 ? 'amount-income' : 'amount-expense'}>
                    fecha {formatBRL(m.closingBalance)}
                  </span>
                </div>
              </div>
              <DailyLedger
                months={[m]}
                onlyWithMovement={onlyWithMovement}
                selectedDate={selectedDate}
                onDayClick={(d) => setSelectedDate(d.date)}
              />
            </div>
          ))}
        </div>
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
                  selectedDate={selectedDate}
                  onDayClick={(d) => setSelectedDate(d.date)}
                />
              </div>
            );
          })}
        </div>
      )}

      {view === 'grid' && <div className="cal-legend">
        <span><i className="legend-dot marker-opening" /> Abertura do cartão</span>
        <span><i className="legend-dot marker-due" /> Vencimento</span>
        <span><i className="legend-dot marker-payment" /> Pagamento</span>
        <span><i className="legend-dot legend-today" /> Hoje</span>
        <span className="cal-legend-hint">Clique num dia para ver e lançar</span>
      </div>}

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
