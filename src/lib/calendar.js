/**
 * Helpers to build a day-by-day view of a month, mixing real transactions
 * with projections coming from recurring entries and credit card cycles.
 */

export const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Clamps a day-of-month (e.g. 31) to the last valid day of that month. */
export function clampDay(day, year, month) {
  return Math.min(Math.max(parseInt(day, 10) || 1, 1), daysInMonth(year, month));
}

export function toISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Moves `offset` months from a {year, month} pair (month is 1-12). */
export function shiftMonth(year, month, offset) {
  const total = year * 12 + (month - 1) + offset;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Dates entered through `<input type="date">` are stored at UTC midnight, so
 * every comparison against them has to be read in UTC — reading them locally
 * shifts the calendar day by one in negative offsets such as UTC-3.
 */
export function monthStartUTC(year, month) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

export function monthEndUTC(year, month) {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

/** Calendar day of a stored date, read in UTC. */
export function utcParts(value) {
  const d = new Date(value);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Comparable YYYYMMDD integer for a stored date. */
export function dateKey(value) {
  const { year, month, day } = utcParts(value);
  return year * 10000 + month * 100 + day;
}

/** Does a recurring entry fire in this month, and on which day? */
export function recurringDayFor(entry, year, month) {
  if (!entry.active) return null;

  if (entry.frequency === 'YEARLY' && entry.monthOfYear && entry.monthOfYear !== month) {
    return null;
  }

  const day = clampDay(entry.dayOfMonth, year, month);
  const key = year * 10000 + month * 100 + day;

  if (entry.startDate && dateKey(entry.startDate) > key) return null;
  if (entry.endDate && dateKey(entry.endDate) < key) return null;

  return day;
}

/**
 * Card events for a month: fatura opening, fatura due and the actual payment.
 * Only the payment moves money, so it is the only one with an amount.
 */
export function cardEventsFor(card, year, month) {
  if (!card.active) return [];

  const events = [
    {
      kind: 'card',
      subtype: 'opening',
      cardId: card.id,
      label: `Abertura ${card.name}`,
      day: clampDay(card.openingDay, year, month),
      color: card.color,
      icon: card.icon,
      amount: 0,
      type: null,
    },
    {
      kind: 'card',
      subtype: 'due',
      cardId: card.id,
      label: `Vencimento ${card.name}`,
      day: clampDay(card.dueDay, year, month),
      color: card.color,
      icon: card.icon,
      amount: 0,
      type: null,
    },
    {
      kind: 'card',
      subtype: 'payment',
      cardId: card.id,
      label: `Pagamento ${card.name}`,
      day: clampDay(card.paymentDay, year, month),
      color: card.color,
      icon: card.icon,
      amount: card.estimatedAmount || 0,
      type: 'EXPENSE',
    },
  ];

  return events;
}

/**
 * Builds the grid of a month: leading blanks so day 1 lands on its weekday,
 * then one cell per day carrying its own items and totals.
 */
export function buildMonthGrid(year, month, days) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (const day of days) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function isToday(year, month, day) {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;
}

/** Compact money label used inside the small calendar cells: "R$ 31,2mil". */
export function compactBRL(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `R$ ${(value / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}mi`;
  if (abs >= 1000) return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}mil`;
  return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/**
 * Even shorter label for phone-sized cells: "31,2k". A calendar cell is
 * roughly 37px wide on a 390px screen, where the full label overflows.
 */
export function compactBRLShort(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1000) return `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
