'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';

/**
 * As dicas do mês.
 *
 * Duas decisões que definem o componente:
 *
 * 1. Sem dica, sem painel. Nada de "tudo certo por aqui!" — um bloco que
 *    aparece sempre vira moldura, e o olho aprende a pular.
 * 2. Três de cada vez, as mais graves primeiro. O resto fica atrás de um
 *    "ver todas", porque uma lista de doze conselhos não é conselho.
 */
const VISIVEIS = 3;

const ICONE = { alerta: 'atencao', atencao: 'atencao', info: 'dica' };

export default function InsightList({ insights = [] }) {
  const [tudo, setTudo] = useState(false);

  if (!insights.length) return null;

  const mostrando = tudo ? insights : insights.slice(0, VISIVEIS);
  const escondidas = insights.length - mostrando.length;

  return (
    <div className="insights">
      {mostrando.map(dica => (
        <div key={dica.id} className={`insight ${dica.nivel}`}>
          <span className="insight-icon"><Icon name={ICONE[dica.nivel]} size={16} /></span>
          <div className="insight-body">
            <strong>{dica.titulo}</strong>
            <p>{dica.texto}</p>
          </div>
        </div>
      ))}

      {(escondidas > 0 || tudo) && (
        <button type="button" className="insight-more" onClick={() => setTudo(!tudo)}>
          {tudo ? 'Ver menos' : `Ver mais ${escondidas}`}
        </button>
      )}
    </div>
  );
}
