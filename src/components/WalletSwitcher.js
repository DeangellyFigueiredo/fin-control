'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

/**
 * Seletor de carteira, no topo do menu.
 *
 * Trocar de carteira troca o app inteiro de contexto — contas, cartões,
 * lançamentos, metas, tudo. Por isso a troca força um recarregamento completo
 * em vez de um refresh de rota: qualquer dado que tenha ficado em estado de
 * componente é da carteira anterior, e mostrá-lo misturado seria pior do que
 * a meia dúzia de milissegundos que o reload custa.
 */
export default function WalletSwitcher({ wallets = [], activeId }) {
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(null);
  const caixa = useRef(null);
  const router = useRouter();

  // Fecha ao clicar fora e no Esc
  useEffect(() => {
    if (!aberto) return;

    const aoClicar = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    const aoTeclar = (e) => { if (e.key === 'Escape') setAberto(false); };

    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const ativa = wallets.find(w => w.id === activeId) || wallets[0];
  if (!ativa) return null;

  const trocar = async (id) => {
    if (id === activeId) return setAberto(false);

    setTrocando(id);
    const res = await fetch('/api/wallets/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId: id }),
    });

    if (res.ok) window.location.reload();
    else setTrocando(null);
  };

  // Com uma carteira só, um seletor seria enfeite: mostra o nome e pronto.
  if (wallets.length === 1) {
    return (
      <div className="wallet-switch single">
        <span className="dot" style={{ background: ativa.color }} />
        <span className="wallet-name">{ativa.name}</span>
      </div>
    );
  }

  return (
    <div className="wallet-switch" ref={caixa}>
      <button
        type="button"
        className="wallet-current"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
      >
        <span className="dot" style={{ background: ativa.color }} />
        <span className="wallet-name">{ativa.name}</span>
        <Icon name={aberto ? 'recolher' : 'expandir'} size={14} className="wallet-caret" />
      </button>

      {aberto && (
        <ul className="wallet-menu" role="listbox" aria-label="Carteiras">
          {wallets.map(w => (
            <li key={w.id}>
              <button
                type="button"
                role="option"
                aria-selected={w.id === activeId}
                className={w.id === activeId ? 'active' : ''}
                onClick={() => trocar(w.id)}
                disabled={trocando !== null}
              >
                <span className="dot" style={{ background: w.color }} />
                <span className="wallet-name">{w.name}</span>
                <span className="wallet-kind">{w.kind}</span>
                {w.id === activeId && <Icon name="concluir" size={13} />}
                {trocando === w.id && <span className="wallet-loading">…</span>}
              </button>
            </li>
          ))}

          <li className="wallet-menu-sep">
            <button type="button" onClick={() => { setAberto(false); router.push('/wallets'); }}>
              <Icon name="configuracoes" size={13} /> Gerenciar carteiras
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
