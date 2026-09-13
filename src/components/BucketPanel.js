'use client';

import { useState } from 'react';
import { formatBRL } from '@/lib/utils';
import Icon from '@/components/Icon';

/**
 * Os quatro baldes do mês.
 *
 * O que importa aqui não é o total — esse já está no topo da tela. É a
 * proporção: quanto do que entra já estava comprometido antes do mês
 * começar, e quanto ainda dá para decidir.
 */
const CONFIG = [
  { id: 'recebimentos', label: 'Recebimentos', icon: 'entrada', tom: 'in',
    ajuda: 'Tudo que entra no mês, realizado e previsto' },
  { id: 'parcelamentos', label: 'Parcelamentos', icon: 'parcelas', tom: 'out',
    ajuda: 'Compras divididas: já tinham data e valor antes do mês começar' },
  { id: 'assinaturas', label: 'Fixos e assinaturas', icon: 'recorrente', tom: 'out',
    ajuda: 'Aluguel, internet, plano — o que se repete todo mês' },
  { id: 'variaveis', label: 'Variáveis', icon: 'variavel', tom: 'out',
    ajuda: 'O resto: compras do mês e a parte da fatura que não é parcela' },
];

export default function BucketPanel({ buckets }) {
  const [aberto, setAberto] = useState(null);

  if (!buckets) return null;

  const maior = Math.max(
    buckets.recebimentos, buckets.parcelamentos, buckets.assinaturas, buckets.variaveis, 1,
  );

  return (
    <div className="card panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Para onde vai o mês</div>
          <div className="panel-subtitle">
            {buckets.comprometidoPct === null
              ? 'Sem entradas registradas neste mês'
              : `${Math.round(buckets.comprometidoPct)}% da renda já estava comprometida`}
          </div>
        </div>
      </div>

      <div className="buckets">
        {CONFIG.map(cfg => {
          const valor = buckets[cfg.id] || 0;
          const itens = buckets.detalhe?.[cfg.id] || [];
          const expandido = aberto === cfg.id;

          return (
            <div key={cfg.id} className={`bucket ${cfg.tom} ${expandido ? 'open' : ''}`}>
              <button
                type="button"
                className="bucket-head"
                onClick={() => setAberto(expandido ? null : cfg.id)}
                aria-expanded={expandido}
                title={cfg.ajuda}
              >
                <span className="bucket-label">
                  <Icon name={cfg.icon} size={14} /> {cfg.label}
                </span>
                <span className="bucket-value">
                  {cfg.tom === 'in' ? '+ ' : ''}{formatBRL(valor)}
                </span>
              </button>

              <div className="bucket-bar">
                <i style={{ width: `${Math.min(100, (valor / maior) * 100)}%` }} />
              </div>

              {expandido && (
                <ul className="bucket-list">
                  {itens.length === 0 && <li className="bucket-empty">Nada neste balde</li>}
                  {itens.slice(0, 12).map((item, i) => (
                    <li key={i}>
                      <span>
                        {item.nome}
                        {item.parcela && <em className="bucket-tag">{item.parcela}</em>}
                        {item.previsto && <em className="bucket-tag">previsto</em>}
                        {item.daFatura && <em className="bucket-tag">da fatura</em>}
                      </span>
                      <strong>{formatBRL(item.valor)}</strong>
                    </li>
                  ))}
                  {itens.length > 12 && (
                    <li className="bucket-empty">e mais {itens.length - 12}</li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* A fatura não é um balde: é um envelope que contém parcela e gasto
          variável. Mostrada aqui decomposta, para o total do mês fechar. */}
      {buckets.faturas?.length > 0 && (
        <div className="bucket-faturas">
          {buckets.faturas.map(f => (
            <div key={f.nome} className="bucket-fatura">
              <span>
                Fatura {f.nome}
                {f.estimada && <em className="bucket-tag">estimada</em>}
              </span>
              <span>
                {formatBRL(f.total)}
                {f.emParcelas > 0 && (
                  <em> · {formatBRL(f.emParcelas)} em parcelas</em>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="panel-footer bucket-footer">
        <div>
          <div className="stat-label">Comprometido</div>
          <div className="footer-value">{formatBRL(buckets.comprometido)}</div>
        </div>
        <div>
          <div className="stat-label">Total de saídas</div>
          <div className="footer-value">{formatBRL(buckets.saidas)}</div>
        </div>
        <div>
          <div className="stat-label">Sobra</div>
          <div className={`footer-value ${buckets.sobra < 0 ? 'negative-text' : ''}`}>
            {formatBRL(buckets.sobra)}
          </div>
        </div>
      </div>
    </div>
  );
}
