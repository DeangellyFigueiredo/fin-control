'use client';

import { formatBRL } from '@/lib/utils';
import { isToday } from '@/lib/calendar';

/**
 * Extrato dia a dia: uma linha por dia com o saldo acumulado, o que entrou
 * e o que saiu. O saldo fica vermelho quando o dia fecha negativo — é o
 * sinal de que falta repor dinheiro naquele período.
 */
export default function DailyLedger({
  months,
  onlyWithMovement = true,
  onDayClick,
  selectedDate = null,
  compact = false,
}) {
  const rows = [];

  for (const month of months) {
    for (const day of month.days) {
      if (onlyWithMovement && !day.hasMovement) continue;
      rows.push({ ...day, year: month.year, month: month.month });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <p className="empty-state-text">Nenhum lançamento no período</p>
      </div>
    );
  }

  const incomesOf = (day) => day.items.filter(i => i.type === 'INCOME');
  // Aporte sai da conta, então aparece junto das saídas, mas com cor própria.
  const expensesOf = (day) => day.items.filter(i => i.type === 'EXPENSE' || i.type === 'INVESTMENT');

  return (
    <div className={`ledger ${compact ? 'ledger-compact' : ''}`}>
      <div className="ledger-head" aria-hidden="true">
        <span>Dia</span>
        <span className="ledger-num">Saldo</span>
        <span>Entradas</span>
        <span>Saídas</span>
      </div>

      <div className="ledger-body">
        {rows.map(day => {
          const [y, m, d] = day.date.split('-');
          const today = isToday(day.year, day.month, day.day);
          const negative = day.balance < 0;

          return (
            <button
              type="button"
              key={day.date}
              className={[
                'ledger-row',
                today ? 'is-today' : '',
                selectedDate === day.date ? 'is-selected' : '',
                negative ? 'is-negative' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDayClick?.(day)}
            >
              <span className="ledger-date">
                {d}/{m}{compact ? '' : `/${y}`}
                {today && <span className="ledger-today-tag">hoje</span>}
              </span>

              <span className={`ledger-num ledger-balance ${negative ? 'negative' : ''}`}>
                {formatBRL(day.balance)}
              </span>

              <span className="ledger-side">
                {incomesOf(day).length === 0 ? (
                  <span className="ledger-none">–</span>
                ) : (
                  incomesOf(day).map(item => (
                    <span key={item.id} className="ledger-entry">
                      <b className="amount-income">+{formatBRL(item.amount)}</b>
                      <em>{item.description}</em>
                      {item.kind !== 'tx' && <i className="ledger-planned" title="Previsto">~</i>}
                    </span>
                  ))
                )}
              </span>

              <span className="ledger-side">
                {expensesOf(day).length === 0 ? (
                  <span className="ledger-none">–</span>
                ) : (
                  expensesOf(day).map(item => (
                    <span key={item.id} className="ledger-entry">
                      <b className={item.type === 'INVESTMENT' ? 'amount-investment' : 'amount-expense'}>
                        -{formatBRL(item.amount)}
                      </b>
                      <em>{item.type === 'INVESTMENT' ? `📈 ${item.description}` : item.description}</em>
                      {item.kind !== 'tx' && <i className="ledger-planned" title="Previsto">~</i>}
                    </span>
                  ))
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
