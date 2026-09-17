'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import { formatBRL, formatDate, todayISO } from '@/lib/utils';
import { previaDaAtualizacao, ultimaAtualizacao } from '@/lib/investments';
import MoneyInput from '@/components/MoneyInput';

/**
 * Atualizar o saldo de um investimento a partir do extrato do banco.
 *
 * A pergunta é "quanto tem", não "quanto rendeu". O banco mostra um saldo;
 * pedir o rendimento obrigaria a pessoa a fazer a subtração de cabeça toda
 * vez, e é justamente a conta que o app deveria fazer por ela.
 *
 * Enquanto digita, a prévia mostra o que aquele número significa: quanto
 * rendeu, em quantos dias, e a que ritmo mensal — e é isso que transforma
 * teclar um valor em enxergar o rendimento.
 */
export default function BalanceUpdate({ investment, onClose, onSaved }) {
  return (
    <Modal onClose={onClose} labelledBy="titulo-saldo">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="titulo-saldo">Atualizar saldo</h2>
            <p className="modal-subtitle">{investment.name}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="fechar" />
          </button>
        </div>

        <BalanceForm investment={investment} onClose={onClose} onSaved={onSaved} />
      </div>
    </Modal>
  );
}

/**
 * O formulário, fora do `Modal`.
 *
 * Mesma razão da lista de pendências e do diálogo de confirmação: o `Modal`
 * renderiza por portal e só existe depois de montar no navegador, então o
 * conteúdo não apareceria no HTML do servidor. Solto, dá para conferi-lo.
 */
export function BalanceForm({ investment, onClose, onSaved }) {
  const [saldo, setSaldo] = useState(String(investment.currentValue ?? ''));
  const [data, setData] = useState(todayISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const previa = previaDaAtualizacao(investment, String(saldo).replace(',', '.'), new Date(`${data}T00:00:00.000Z`));
  const ultima = ultimaAtualizacao(investment);

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);

    const res = await fetch('/api/investments/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ investmentId: investment.id, balance: saldo, date: data }),
    });

    setSalvando(false);
    if (!res.ok) return setErro((await res.json()).error || 'Não foi possível atualizar');

    onSaved?.();
  };

  return (
    <form onSubmit={salvar}>
      <div className="saldo-antes">
        <span>Saldo anotado por último</span>
        <strong>{formatBRL(investment.currentValue)}</strong>
        {ultima && <em>em {formatDate(ultima)}</em>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="saldo-novo">Saldo que o banco mostra hoje</label>
          <MoneyInput
            id="saldo-novo"
            className="form-input"
            required
            autoFocus
            value={saldo}
            onChange={e => setSaldo(e.target.value)}
            onFocus={e => e.target.select()}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="saldo-data">Quando você olhou</label>
          <input
            id="saldo-data"
            className="form-input"
            type="date"
            required
            max={todayISO()}
            value={data}
            onChange={e => setData(e.target.value)}
          />
        </div>
      </div>

      {previa && previa.rendimento !== 0 && (
        <div className={`saldo-previa ${previa.rendimento > 0 ? 'sobe' : 'cai'}`}>
          <Icon name={previa.rendimento > 0 ? 'entrada' : 'saida'} size={15} />
          <div>
            <strong>
              {previa.rendimento > 0 ? 'Rendeu' : 'Caiu'} {formatBRL(Math.abs(previa.rendimento))}
              {previa.percentual !== null && ` (${previa.percentual > 0 ? '+' : ''}${previa.percentual.toFixed(2)}%)`}
            </strong>
            <span>
              {previa.dias === null
                ? 'primeira anotação deste investimento'
                : previa.dias === 0
                  ? 'no mesmo dia da última anotação'
                  : `em ${previa.dias} ${previa.dias === 1 ? 'dia' : 'dias'}`}
              {previa.aoMes !== null && ` · ritmo de ${formatBRL(previa.aoMes)} por mês`}
            </span>
          </div>
        </div>
      )}

      {previa && previa.rendimento === 0 && (
        <p className="form-hint">
          Mesmo saldo da última anotação — nada será gravado.
        </p>
      )}

      {erro && <div className="form-error">{erro}</div>}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar saldo'}
        </button>
      </div>
    </form>
  );
}
