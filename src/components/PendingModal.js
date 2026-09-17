'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import { formatBRL } from '@/lib/utils';
import MoneyInput from '@/components/MoneyInput';

/**
 * O modal de pendências: recorrentes que venceram sem ninguém confirmar.
 *
 * Duas decisões que definem o componente:
 *
 * 1. **Não fecha no clique fora.** É o único modal do app assim. Fechar sem
 *    querer aqui custa caro — o modal só volta amanhã sozinho —, e o botão
 *    "Depois" já é uma saída de um clique.
 * 2. **O valor vem editável.** O contador cobra R$ 450 e vem R$ 480. Aceitar
 *    só o valor cadastrado faria o saldo nascer errado e exigiria uma edição
 *    logo em seguida.
 */
export default function PendingModal({ pendencias = [], onClose, onResolved }) {
  const restantes = pendencias.length;

  return (
    <Modal onClose={onClose} labelledBy="titulo-pendencias" dismissOnBackdrop={false}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="titulo-pendencias">
              {restantes === 1 ? 'Uma pendência' : `${restantes} pendências`}
            </h2>
            <p className="modal-subtitle">
              Venceram e continuam contando no saldo até você dizer o que aconteceu.
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="fechar" />
          </button>
        </div>

        <PendingList pendencias={pendencias} onResolved={onResolved} />

        <div className="modal-actions">
          <p className="pend-hint">
            O que ficar sem resposta continua pesando no saldo — é assim que o
            mês para de melhorar sozinho.
          </p>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Depois
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * A lista em si, fora do modal.
 *
 * Separada porque o `Modal` renderiza por portal e só existe depois de montar
 * no navegador — o que torna impossível conferir o conteúdo pelo HTML do
 * servidor. Com a lista solta, dá para verificá-la.
 */
export function PendingList({ pendencias = [], onResolved }) {
  const [valores, setValores] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [erro, setErro] = useState('');

  const chave = (p) => `${p.recurringId}:${p.year}:${p.month}`;

  const valorDe = (p) => {
    const v = valores[chave(p)];
    return v === undefined ? String(p.amount) : v;
  };

  const responder = async (p, action) => {
    setErro('');
    setOcupado(chave(p));

    const res = await fetch('/api/pendencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recurringId: p.recurringId,
        year: p.year,
        month: p.month,
        action,
        ...(action === 'PAID' ? { amount: valorDe(p), date: p.date } : {}),
      }),
    });

    setOcupado(null);

    if (!res.ok) {
      setErro((await res.json()).error || 'Não foi possível registrar');
      return;
    }

    onResolved?.(p);
  };

  return (
    <>
      {erro && <div className="form-error">{erro}</div>}

      <ul className="pend-list">
          {pendencias.map(p => {
            const ocupada = ocupado === chave(p);
            const entrada = p.type === 'INCOME';

            return (
              <li key={chave(p)} className="pend-item">
                <div className="pend-head">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="pend-meta">
                      venceu em {p.date.slice(8, 10)}/{p.date.slice(5, 7)}
                      {p.atraso > 0 && (
                        <span className="pend-late">
                          {p.atraso} {p.atraso === 1 ? 'dia' : 'dias'} de atraso
                        </span>
                      )}
                      {p.account && <> · {p.account.name}</>}
                    </div>
                  </div>
                  <span className={`pend-amount ${entrada ? 'amount-income' : 'amount-expense'}`}>
                    {entrada ? '+' : '−'} {formatBRL(p.amount)}
                  </span>
                </div>

                <div className="pend-actions">
                  <label className="pend-value">
                    <span>{entrada ? 'Entrou' : 'Saiu'}</span>
                    <MoneyInput
                      id={`valor-${chave(p)}`}
                      className="form-input"
                      value={valorDe(p)}
                      onChange={e => setValores(v => ({ ...v, [chave(p)]: e.target.value }))}
                      disabled={ocupada}
                    />
                  </label>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => responder(p, 'PAID')}
                    disabled={ocupada}
                  >
                    <Icon name="concluir" size={14} /> {entrada ? 'Recebi' : 'Paguei'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => responder(p, 'SKIP')}
                    disabled={ocupada}
                  >
                    {entrada ? 'Não caiu' : 'Não vai sair'}
                  </button>
                </div>
              </li>
            );
          })}
      </ul>
    </>
  );
}
