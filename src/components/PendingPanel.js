'use client';

import { useState, useEffect, useCallback } from 'react';
import PendingModal from '@/components/PendingModal';
import Icon from '@/components/Icon';
import { formatBRL } from '@/lib/utils';

/**
 * O bloco de pendências e a porta de volta para o modal.
 *
 * O modal abre sozinho uma vez por dia. Se aparecesse toda vez que o app é
 * aberto, em duas semanas seria fechado sem leitura — e o passo seguinte é
 * responder "paguei" por reflexo, o que corrompe o saldo em vez de corrigi-lo.
 *
 * A marca do dia mora no localStorage: é preferência de aparelho, não dado
 * financeiro. Se o navegador esquecer, o pior que acontece é o modal abrir
 * uma vez a mais.
 */
const CHAVE = 'fincontrol:pendencias-vistas';

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function jaPerguntouHoje() {
  try {
    return localStorage.getItem(CHAVE) === hojeISO();
  } catch {
    // Janela anônima, armazenamento bloqueado: melhor perguntar do que sumir
    return false;
  }
}

function marcarPerguntado() {
  try {
    localStorage.setItem(CHAVE, hojeISO());
  } catch {
    // Sem lugar para guardar, o modal volta na próxima abertura. Aceitável.
  }
}

export default function PendingPanel({ onResolved }) {
  const [dados, setDados] = useState(null);
  const [aberto, setAberto] = useState(false);

  const buscar = useCallback(async () => {
    const res = await fetch('/api/pendencies');
    if (!res.ok) return;
    const d = await res.json();
    setDados(d);
    return d;
  }, []);

  useEffect(() => {
    buscar().then(d => {
      if (d?.doDia?.length && !jaPerguntouHoje()) {
        setAberto(true);
        marcarPerguntado();
      }
    });
  }, [buscar]);

  const resolvida = async () => {
    const d = await buscar();
    // Respondida a última, o modal já não tem o que perguntar
    if (!d?.doDia?.length) setAberto(false);
    onResolved?.();
  };

  const abrir = () => {
    marcarPerguntado();
    setAberto(true);
  };

  if (!dados) return null;

  const total = dados.total;
  const doDia = dados.doDia || [];
  const valor = doDia.reduce((s, p) => s + (p.type === 'INCOME' ? 0 : p.amount), 0);

  return (
    <>
      <div className={`pend-bar ${total ? 'has' : 'empty'}`}>
        {total > 0 ? (
          <>
            <span className="pend-bar-icon"><Icon name="atencao" size={16} /></span>
            <div className="pend-bar-text">
              <strong>{total === 1 ? '1 pendência' : `${total} pendências`}</strong>
              {valor > 0 && (
                <span>
                  {formatBRL(valor)} em saídas que venceram e ainda contam no saldo
                </span>
              )}
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={abrir}>
              Resolver
            </button>
          </>
        ) : (
          <>
            <span className="pend-bar-icon"><Icon name="concluir" size={16} /></span>
            <div className="pend-bar-text">
              <strong>Não há pendências hoje</strong>
              <span>Tudo que venceu já foi confirmado</span>
            </div>
          </>
        )}
      </div>

      {aberto && (
        <PendingModal
          pendencias={doDia.length ? doDia : dados.itens}
          onClose={() => setAberto(false)}
          onResolved={resolvida}
        />
      )}
    </>
  );
}
