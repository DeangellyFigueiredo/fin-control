'use client';

import { useState, useEffect, useCallback } from 'react';
import TransactionForm from '@/components/TransactionForm';
import TripEntryForm from '@/components/TripEntryForm';
import MobileNav from '@/components/MobileNav';
import Icon from '@/components/Icon';
import { todayISO } from '@/lib/utils';
import Modal from '@/components/Modal';
import { diaDe } from '@/lib/trips';

/**
 * Botão de lançamento sempre à mão, mais a barra de navegação do celular.
 *
 * Vive no layout, fora das páginas, então busca contas e investimentos por
 * conta própria — e só quando o modal abre pela primeira vez, para não
 * pesar em toda navegação.
 *
 * Com uma viagem em andamento, o lançamento vai para ela por padrão: é o
 * momento em que se lança mais, e com o celular na mão. As viagens são
 * buscadas a cada abertura, porque uma viagem pode ter começado hoje.
 */
export default function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [debts, setDebts] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [viagens, setViagens] = useState([]);
  // '' = lançamento comum; senão, o id da viagem
  const [tripId, setTripId] = useState('');

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

  useEffect(() => {
    if (!open) return;

    fetch('/api/trips')
      .then(r => (r.ok ? r.json() : []))
      .then(lista => {
        const hoje = diaDe(todayISO());
        const ativas = (Array.isArray(lista) ? lista : [])
          .filter(t => diaDe(t.startDate) <= hoje && hoje <= diaDe(t.endDate));
        setViagens(ativas);
        setTripId(ativas[0]?.id || '');
      })
      .catch(() => setViagens([]));
  }, [open]);

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
        <Icon name="adicionar" size={24} />
      </button>

      <MobileNav onQuickAdd={abrir} />

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Novo lançamento</div>
                <div className="page-subtitle" style={{ marginTop: 2 }}>
                  {tripId ? 'Pago pela conta, entra também no extrato' : 'Entra em hoje; marque retroativo para escolher outro dia'}
                </div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar"><Icon name="fechar" size={18} /></button>
            </div>

            {carregado && viagens.length > 0 && (
              <label className="trip-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(tripId)}
                  onChange={e => setTripId(e.target.checked ? viagens[0].id : '')}
                />
                <Icon name="viagem" />
                {viagens.length === 1 || !tripId ? (
                  <span>Lançar na viagem {viagens[0].name}</span>
                ) : (
                  <select className="form-select form-select-sm" value={tripId} onChange={e => setTripId(e.target.value)}>
                    {viagens.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
              </label>
            )}

            {carregado && tripId ? (
              <TripEntryForm
                key={tripId}
                tripId={tripId}
                accounts={accounts}
                onSaved={() => setOpen(false)}
                onCancel={() => setOpen(false)}
              />
            ) : carregado ? (
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
        </Modal>
      )}
    </>
  );
}
