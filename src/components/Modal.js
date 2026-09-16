'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Overlay de modal, renderizado direto no <body>.
 *
 * O portal não é preferência de estilo, é necessidade: as páginas usam
 * `.animate-in`, cuja animação termina com `transform: translateY(0)` e o
 * mantém aplicado por causa do `forwards`. Um transform não-nulo cria bloco
 * de contenção para descendentes `position: fixed`, então o `inset: 0` do
 * overlay passava a valer contra a altura da PÁGINA, não da tela — e o
 * modal aparecia no meio do conteúdo, longe do meio da janela.
 *
 * Saindo para o body, o modal fica imune a isso e a qualquer transform,
 * filter ou perspective que apareça num ancestral no futuro.
 */
/**
 * `dismissOnBackdrop=false` para os modais em que fechar sem querer custa caro
 * — o de pendências, que só volta sozinho no dia seguinte.
 */
export default function Modal({ onClose, children, labelledBy, dismissOnBackdrop = true }) {
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  // Esc fecha, e a página atrás para de rolar enquanto o modal está aberto
  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', aoTeclar);

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [onClose]);

  if (!montado) return null;

  return createPortal(
    <div
      className="modal-overlay"
      // Só fecha em clique no próprio véu: funciona mesmo quando o conteúdo
      // não interrompe a propagação do clique.
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {children}
    </div>,
    document.body,
  );
}
