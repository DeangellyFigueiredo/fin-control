'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Peças de movimento do roteiro. Ver "Motion design" em
 * docs/rfc/0003-roteiro.md: o movimento mostra o fluxo da viagem, e quem
 * pede menos movimento ao sistema recebe a tela já no estado final.
 */

const CONSULTA = '(prefers-reduced-motion: reduce)';

export function useMenosMovimento() {
  const [menos, setMenos] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const ler = () => setMenos(mq.matches);
    ler();
    mq.addEventListener('change', ler);
    return () => mq.removeEventListener('change', ler);
  }, []);
  return menos;
}

export const menosMovimentoAgora = () =>
  typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches;

/** Mesma curva de --ease-out, para animações feitas em JS. */
export function easeOut(t) {
  // cubic-bezier(.2,.8,.2,1) aproximada por uma quártica, sem resolver a curva
  return 1 - Math.pow(1 - t, 4);
}

/**
 * O valor anima do anterior até o novo quando muda. Na primeira renderização
 * já nasce no valor: contar de zero a cada abertura cansa.
 */
export function useNumeroAnimado(valor, duracao = 600) {
  const [mostrado, setMostrado] = useState(valor);
  const anterior = useRef(valor);

  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    if (de === valor) return;
    if (menosMovimentoAgora()) { setMostrado(valor); return; }

    let quadro;
    const inicio = performance.now();
    const passo = (agora) => {
      const t = Math.min((agora - inicio) / duracao, 1);
      setMostrado(de + (valor - de) * easeOut(t));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, duracao]);

  return mostrado;
}

/**
 * Os filhos com `[data-revelar]` entram em cascata quando aparecem na
 * rolagem, uma vez só. A marca é o atributo `data-revelado`, não uma classe:
 * o React reescreve o className quando o destaque muda e apagaria a classe.
 * Os que entram no mesmo instante ganham 50ms de diferença entre si; o resto
 * da lista espera a rolagem chegar.
 */
export function useRevelarEmCascata(ref, deps = []) {
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    const itens = [...raiz.querySelectorAll('[data-revelar]:not([data-revelado])')];
    if (!itens.length) return;

    if (menosMovimentoAgora() || typeof IntersectionObserver === 'undefined') {
      itens.forEach(el => { el.dataset.revelado = ''; });
      return;
    }

    const obs = new IntersectionObserver((entradas) => {
      let i = 0;
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.style.setProperty('--atraso', `${i++ * 50}ms`);
        e.target.dataset.revelado = '';
        obs.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });

    itens.forEach(el => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
