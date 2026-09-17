'use client';

import { useState, useEffect } from 'react';
import { mascarar, aoSair, paraNumero, valorBruto, formatarValor } from '@/lib/money';

/**
 * Campo de dinheiro com máscara pt-BR.
 *
 * Entra no lugar de um `<input type="number">` sem que quem usa precise mudar
 * nada: o `onChange` recebe um evento com `target.value` já em número puro
 * ("1000.5"), que é o que os formulários e as rotas sempre esperaram. O que
 * muda é só o que aparece na tela — "1.000,50" em vez de "1000.5".
 *
 * O texto vive em estado próprio porque as duas formas não são a mesma coisa:
 * enquanto se digita "1.000", o valor é 1000, mas escrever 1000 de volta no
 * campo apagaria o ponto no meio da digitação e mandaria o cursor para o fim.
 */
export default function MoneyInput({ value, onChange, className = 'form-input', ...rest }) {
  const [texto, setTexto] = useState(() => inicial(value));

  // O pai pode trocar o valor por fora (abrir outro registro para editar,
  // limpar o formulário depois de salvar). Quando isso muda de verdade, o
  // texto acompanha; enquanto se digita, não.
  useEffect(() => {
    // `atual` é o que está escrito na tela e `value` é o valor de máquina:
    // cada um tem o seu parser, porque os dois leem o ponto ao contrário.
    setTexto(atual => (paraNumero(atual) === valorBruto(value) ? atual : inicial(value)));
  }, [value]);

  const digitar = (e) => {
    const visivel = mascarar(e.target.value);
    setTexto(visivel);

    const numero = paraNumero(visivel);
    onChange?.({ target: { value: numero === null ? '' : String(numero) } });
  };

  const sair = (e) => {
    const completo = aoSair(texto);
    setTexto(completo);
    rest.onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      // Abre o teclado numérico no celular sem perder a máscara, que o
      // type="number" não deixaria existir.
      inputMode="decimal"
      className={className}
      value={texto}
      onChange={digitar}
      onBlur={sair}
    />
  );
}

/**
 * Texto inicial: o valor de máquina vira "1.000,00"; vazio continua vazio.
 *
 * Aqui é `valorBruto`, e não `paraNumero`: o que chega é o que o formulário
 * guarda — um número, ou a string dele com ponto decimal. Ler esse ponto como
 * milhar multiplicava o valor por cem na tela.
 */
function inicial(value) {
  const numero = valorBruto(value);
  return numero === null ? '' : formatarValor(numero);
}
