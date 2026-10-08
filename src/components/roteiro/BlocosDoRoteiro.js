'use client';

import { ViewTransition } from 'react';
import Icon from '@/components/Icon';
import { formatBRL } from '@/lib/utils';
import { COR_CASA, noitesTexto, trechoTexto } from './formato';
import { Foto, useFoto } from './fotos';
import { ClimaDoBloco } from './Clima';

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "13 a 16/12" ou "11/12": a estadia vai até o dia da saída. */
export function datasDoBloco(b) {
  if (b.tipo === 'estadia') return `${dm(b.parada.chegada)} a ${dm(b.parada.saida)}`;
  return dm(b.inicio);
}

export function rotuloDoBloco(b) {
  if (b.tipo === 'saida') return 'Saída';
  if (b.tipo === 'volta') return b.titulo.startsWith('Volta') ? 'Volta' : 'Chegada';
  if (b.tipo === 'passagem') return 'Passagem';
  return noitesTexto(b.noites);
}

/**
 * A viagem por cidade: um cartão por bloco, em fila. Clicar abre o detalhe.
 *
 * O cartão aberto perde o nome de transição e o painel ganha o mesmo nome:
 * dentro de startTransition, o React casa os dois e o cartão morfa no painel.
 */
export default function BlocosDoRoteiro({ blocos, cores, aberto, destaque, onAbrir, onFoco, climaPorBloco = {} }) {
  return (
    <div className="blocos" role="list">
      {blocos.map(b => {
        const cor = b.tipo === 'saida' || b.tipo === 'volta' ? COR_CASA : cores[b.id];
        const ativo = destaque.paradas.has(b.id);
        const conteudo = (
          <button
            type="button" role="listitem"
            className={`bloco bloco-${b.tipo} ${ativo ? 'ativo' : ''}`}
            style={{ '--cor': cor }}
            onClick={() => onAbrir(b.id)}
            onMouseEnter={() => onFoco({ tipo: 'parada', ids: [b.id] })}
            onMouseLeave={() => onFoco(null)}
            aria-label={`${b.titulo}, ${datasDoBloco(b)}. Abrir detalhes.`}
          >
            <span className="bloco-faixa" aria-hidden="true" />
            <FotoDoBloco bloco={b} />
            <span className="bloco-rotulo">
              <Icon name={b.tipo === 'saida' || b.tipo === 'volta' ? 'carro' : 'local'} /> {rotuloDoBloco(b)}
            </span>
            <span className="bloco-titulo">{b.titulo}</span>
            <span className="bloco-datas">{datasDoBloco(b)}</span>
            <ClimaDoBloco clima={climaPorBloco[b.id]} />
            {b.tipo === 'saida' || b.tipo === 'volta' ? (
              b.trecho && trechoTexto(b.trecho) && <span className="bloco-linha">{trechoTexto(b.trecho)}</span>
            ) : (
              b.parada.lodgingName && <span className="bloco-linha"><Icon name="hospedagem" /> {b.parada.lodgingName}</span>
            )}
            <span className="bloco-rodape">
              {b.atividades > 0 && <span>{b.feitas}/{b.atividades} atividades</span>}
              {(b.gasto !== 0 || b.estimado > 0) && (
                <span>{formatBRL(b.gasto)}{b.estimado > 0 && <small> / {formatBRL(b.estimado)}</small>}</span>
              )}
            </span>
          </button>
        );

        return aberto === b.id
          ? <div key={b.id} className="bloco-vazio" aria-hidden="true">{conteudo}</div>
          : <ViewTransition key={b.id} name={`bloco-${b.id}`}>{conteudo}</ViewTransition>;
      })}
    </div>
  );
}

/** A cidade ganha foto; saída e volta são estrada, ficam sem. */
function FotoDoBloco({ bloco }) {
  const cidade = bloco.tipo === 'estadia' || bloco.tipo === 'passagem';
  const foto = useFoto(cidade ? bloco.parada : null, { cidade });
  return <Foto foto={foto} className="bloco-foto" emBotao />;
}
