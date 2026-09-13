'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatBRL, getMonthShort } from '@/lib/utils';
import { shiftMonth } from '@/lib/calendar';

const MESES = 12;

/**
 * Faturas mês a mês de um cartão.
 *
 * O cartão tem uma fatura estimada que vale para todo mês futuro. Aqui cada
 * mês pode receber o valor real; quem não recebe continua na estimativa, e
 * a tela deixa claro qual é qual.
 */
export default function CardBills({ card }) {
  const hoje = new Date();
  const [bills, setBills] = useState({});
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const chave = (y, m) => `${y}-${m}`;

  const carregar = useCallback(async () => {
    const params = new URLSearchParams({
      year: hoje.getFullYear(),
      month: hoje.getMonth() + 1,
      months: MESES,
    });
    const res = await fetch(`/api/cards/bills?${params}`);
    const todas = res.ok ? await res.json() : [];

    const meu = {};
    for (const b of todas) {
      if (b.creditCardId === card.id) meu[chave(b.year, b.month)] = b.amount;
    }
    setBills(meu);
    setCarregando(false);
  }, [card.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (y, m, valor) => {
    const k = chave(y, m);
    setSalvando(k);

    const limpo = String(valor).trim();
    if (limpo === '') {
      // Campo vazio devolve o mês para a estimativa do cartão
      await fetch(`/api/cards/bills?creditCardId=${card.id}&year=${y}&month=${m}`, { method: 'DELETE' });
    } else {
      await fetch('/api/cards/bills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditCardId: card.id, year: y, month: m, amount: limpo }),
      });
    }

    setRascunho(r => { const n = { ...r }; delete n[k]; return n; });
    setSalvando(null);
    await carregar();
    // Avisa as telas abertas: a projeção do calendário mudou
    window.dispatchEvent(new CustomEvent('fincontrol:transacao-salva'));
  };

  if (carregando) return <div className="skeleton" style={{ height: 140, marginTop: 12 }} />;

  const meses = Array.from({ length: MESES }, (_, i) =>
    shiftMonth(hoje.getFullYear(), hoje.getMonth() + 1, i));

  const informadas = Object.keys(bills).length;

  return (
    <div className="card-bills">
      <div className="card-bills-head">
        <span className="stat-label">Fatura mês a mês</span>
        <span className="setting-hint" style={{ marginTop: 0 }}>
          {informadas > 0
            ? `${informadas} mês(es) com valor real; o resto usa a estimativa`
            : 'Todos usando a estimativa — informe o valor real quando a fatura chegar'}
        </span>
      </div>

      <div className="card-bills-grid">
        {meses.map(({ year, month }) => {
          const k = chave(year, month);
          const informado = bills[k];
          const emEdicao = rascunho[k] !== undefined;
          const valor = emEdicao
            ? rascunho[k]
            : (informado !== undefined ? String(informado) : '');

          return (
            <label key={k} className={`card-bill ${informado !== undefined ? 'is-real' : ''}`}>
              <span className="card-bill-month">
                {getMonthShort(month)}<i>{String(year).slice(2)}</i>
              </span>
              <input
                className="form-input card-bill-input"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder={formatBRL(card.estimatedAmount).replace('R$', '').trim()}
                value={valor}
                disabled={salvando === k}
                onChange={e => setRascunho(r => ({ ...r, [k]: e.target.value }))}
                onBlur={e => { if (emEdicao) salvar(year, month, e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
              <span className="card-bill-tag">
                {informado !== undefined ? 'real' : 'estimada'}
              </span>
            </label>
          );
        })}
      </div>

      <p className="setting-hint">
        Deixe em branco para o mês voltar a usar a estimativa de{' '}
        {formatBRL(card.estimatedAmount)}. Zero significa que não há fatura naquele mês.
      </p>
    </div>
  );
}
