'use client';

import { useState, useEffect, useCallback } from 'react';
import TransactionForm from '@/components/TransactionForm';
import MobileNav from '@/components/MobileNav';
import { todayISO } from '@/lib/utils';

/**
 * Botão de lançamento sempre à mão, mais a barra de navegação do celular.
 *
 * Vive no layout, fora das páginas, então busca contas e investimentos por
 * conta própria — e só quando o modal abre pela primeira vez, para não
 * pesar em toda navegação.
 */
export default function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!open || carregado) return;

    Promise.all([
      fetch('/api/accounts').then(r => (r.ok ? r.json() : [])),
      fetch('/api/investments').then(r => (r.ok ? r.json() : [])),
      fetch('/api/debts').then(r => (r.ok ? r.json() : [])),
    ])
      .then(([a, i, d]) => {
        setAccounts(Array.isArray(a) ? a : []);
        setInvestments(Array.isArray(i) ? i : []);
        // Só as em aberto: quitada não deve aparecer para receber pagamento
        setDebts(Array.isArray(d) ? d.filter(x => !x.quitada) : []);
        setCarregado(true);
      })
      .catch(() => setCarregado(true));
  }, [open, carregado]);

  const abrir = useCallback(() => setOpen(true), []);

  return (
    <>
      <button
        type="button"
        className="fab"
        onClick={abrir}
        aria-label="Adicionar lançamento"
        title="Adicionar lançamento"
      >
        <span aria-hidden="true">+</span>
      </button>

      <MobileNav onQuickAdd={abrir} />

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Novo lançamento</div>
                <div className="page-subtitle" style={{ marginTop: 2 }}>
                  Entra em hoje; marque retroativo para escolher outro dia
                </div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">✕</button>
            </div>

            {carregado ? (
              <TransactionForm
                baseDate={todayISO()}
                accounts={accounts}
                investments={investments}
                debts={debts}
                onSaved={() => setOpen(false)}
                onCancel={() => setOpen(false)}
              />
            ) : (
              <div className="skeleton" style={{ height: 220 }} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
