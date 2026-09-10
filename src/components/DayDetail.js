'use client';

import { formatBRL } from '@/lib/utils';

const KIND_BADGE = {
  tx: { label: 'Lançado', className: 'badge-real' },
  recurring: { label: 'Previsto', className: 'badge-planned' },
  card: { label: 'Fatura', className: 'badge-card' },
};

const CARD_MARKER_LABEL = {
  opening: 'Abertura da fatura',
  due: 'Vencimento da fatura',
  payment: 'Pagamento da fatura',
};

/** Modal listing everything that happens on a single day. */
export default function DayDetail({ day, onClose }) {
  if (!day) return null;

  const [y, m, d] = day.date.split('-');
  const income = day.income + day.plannedIncome;
  const expense = day.expense + day.plannedExpense;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{d}/{m}/{y}</div>
            <div className="page-subtitle" style={{ marginTop: 2 }}>
              {day.items.length} {day.items.length === 1 ? 'lançamento' : 'lançamentos'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="day-totals">
          <div>
            <div className="stat-label">Entradas</div>
            <div className="stat-value positive" style={{ fontSize: '1.15rem' }}>{formatBRL(income)}</div>
          </div>
          <div>
            <div className="stat-label">Saídas</div>
            <div className="stat-value negative" style={{ fontSize: '1.15rem' }}>{formatBRL(expense)}</div>
          </div>
          <div>
            <div className="stat-label">Saldo do dia</div>
            <div className={`stat-value ${income - expense >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '1.15rem' }}>
              {formatBRL(income - expense)}
            </div>
          </div>
        </div>

        {day.cardMarkers.length > 0 && (
          <div className="day-markers">
            {day.cardMarkers.map((marker, i) => (
              <span key={i} className="card-chip" style={{ '--marker-color': marker.color }}>
                {marker.icon} {CARD_MARKER_LABEL[marker.subtype]} · {marker.name}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {day.items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🗓️</div>
              <p className="empty-state-text">Nenhuma movimentação neste dia</p>
            </div>
          ) : (
            day.items.map(item => {
              const badge = KIND_BADGE[item.kind];
              return (
                <div key={item.id} className="transaction-item">
                  <div className={`transaction-icon ${item.type === 'INCOME' ? 'income' : 'expense'}`}>
                    {item.category?.icon || item.card?.icon || (item.type === 'INCOME' ? '💰' : '💸')}
                  </div>
                  <div className="transaction-info">
                    <div className="transaction-desc">{item.description}</div>
                    <div className="transaction-meta">
                      <span className={`kind-badge ${badge.className}`}>{badge.label}</span>
                      {item.account && <span>{item.account.name}</span>}
                      {item.category && <span>{item.category.name}</span>}
                    </div>
                  </div>
                  <div className={`transaction-amount ${item.type === 'INCOME' ? 'amount-income' : 'amount-expense'}`}>
                    {item.type === 'INCOME' ? '+' : '-'}{formatBRL(item.amount)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
