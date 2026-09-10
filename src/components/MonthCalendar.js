'use client';

import { WEEKDAYS, buildMonthGrid, isToday, compactBRL, compactBRLShort } from '@/lib/calendar';
import { getMonthName } from '@/lib/utils';
import { buildColorScale } from '@/lib/settings';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Both labels are rendered and CSS picks one, so the phone gets the short
 * form without a viewport check that would break server rendering.
 */
function Money({ value, className, sign = '' }) {
  return (
    <span className={className}>
      <span className="val-long">{sign}{compactBRL(value)}</span>
      <span className="val-short">{sign}{compactBRLShort(value)}</span>
    </span>
  );
}

const CARD_MARKER_LABEL = {
  opening: 'Abertura da fatura',
  due: 'Vencimento da fatura',
  payment: 'Pagamento da fatura',
};

/**
 * Day-by-day grid of a single month.
 *
 * metric  'expense' | 'income' | 'both'  — what the cells show
 * size    'sm' compact heat map (dashboard) | 'lg' full day view (calendar page)
 */
export default function MonthCalendar({
  month,
  metric = 'both',
  size = 'lg',
  showProjections = true,
  selectedDate = null,
  onDayClick,
  showHeader = true,
  colorSettings = null,
}) {
  const { theme, settings } = useTheme();
  const cells = buildMonthGrid(month.year, month.month, month.days);

  const valueOf = (day, kind) => {
    const real = kind === 'income' ? day.income : day.expense;
    const planned = kind === 'income' ? day.plannedIncome : day.plannedExpense;
    return showProjections ? real + planned : real;
  };

  // Escala divergente: o fundo do dia sai das preferências da conta e é
  // independente de `metric`, que decide apenas qual número aparece.
  const scale = buildColorScale(month.days, colorSettings || settings, {
    theme,
    showProjections,
  });

  return (
    <div className={`cal ${size === 'sm' ? 'cal-sm' : 'cal-lg'}`}>
      {showHeader && (
        <div className="cal-month-title">
          {getMonthName(month.month)} <span>{month.year}</span>
        </div>
      )}

      <div className="cal-weekdays">
        {WEEKDAYS.map(w => <div key={w} className="cal-weekday">{w}</div>)}
      </div>

      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} className="cal-cell cal-cell-blank" />;

          const today = isToday(month.year, month.month, day.day);
          const background = scale.colorFor(day);
          const income = valueOf(day, 'income');
          const expense = valueOf(day, 'expense');
          const hasPlanned = day.plannedIncome > 0 || day.plannedExpense > 0;
          const empty = income === 0 && expense === 0;
          const selected = selectedDate === day.date;

          return (
            <button
              type="button"
              key={day.date}
              onClick={() => onDayClick?.(day)}
              className={[
                'cal-cell',
                today ? 'is-today' : '',
                selected ? 'is-selected' : '',
                empty ? 'is-empty' : '',
                background ? 'is-tinted' : '',
              ].filter(Boolean).join(' ')}
              style={background ? { background } : undefined}
            >
              <span className="cal-daynum">
                {day.day}
                {today && <span className="cal-today-dot" aria-label="hoje" />}
              </span>

              {metric === 'both' ? (
                <span className="cal-values">
                  {income > 0 && <Money className="cal-in" value={income} sign="+" />}
                  {expense > 0 && <Money className="cal-out" value={expense} sign="-" />}
                  {empty && <span className="cal-none">–</span>}
                </span>
              ) : (
                <span className="cal-values">
                  {(metric === 'income' ? income : expense) > 0 ? (
                    <Money
                      className={metric === 'income' ? 'cal-in' : 'cal-out'}
                      value={metric === 'income' ? income : expense}
                    />
                  ) : (
                    <span className="cal-none">–</span>
                  )}
                </span>
              )}

              {day.cardMarkers.length > 0 && (
                <span className="cal-markers">
                  {day.cardMarkers.map((m, idx) => (
                    <span
                      key={`${m.cardId}-${m.subtype}-${idx}`}
                      className={`cal-marker marker-${m.subtype}`}
                      style={{ '--marker-color': m.color }}
                      title={`${CARD_MARKER_LABEL[m.subtype]} · ${m.name}`}
                    />
                  ))}
                </span>
              )}

              {hasPlanned && showProjections && <span className="cal-planned-flag" title="Inclui previsão" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
