'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';

/**
 * Confirmação dentro do app, no lugar do `confirm()` do navegador.
 *
 * O diálogo nativo é feio de um jeito que não combina com nada — tipografia do
 * sistema operacional, botões em inglês ou em outra ordem conforme o
 * navegador, e no celular ele cola no topo da tela com o domínio escrito em
 * cima. Também trava a aba inteira enquanto está aberto.
 *
 * A interface é uma promessa de propósito, e não um componente que cada tela
 * renderiza: assim a troca em cada lugar é de uma linha só, e o fluxo do
 * código continua lendo de cima para baixo.
 *
 *   const confirmar = useConfirm();
 *   if (!await confirmar({ titulo: 'Excluir?', texto: '...' })) return;
 */
const ConfirmContext = createContext(null);

export function useConfirm() {
  const confirmar = useContext(ConfirmContext);
  if (!confirmar) throw new Error('useConfirm precisa estar dentro de ConfirmProvider');
  return confirmar;
}

export default function ConfirmProvider({ children }) {
  const [pedido, setPedido] = useState(null);
  // A promessa fica aqui fora do estado: guardá-la no estado faria o React
  // recriar a função de resolução a cada render e perder a resposta.
  const resolver = useRef(null);

  const confirmar = useCallback((opcoes) => {
    // Dois pedidos em sequência (clique rápido em dois botões de remover)
    // sobrescreveriam o resolvedor, e o primeiro `await` ficaria pendurado
    // para sempre. O anterior é encerrado como "cancelou".
    resolver.current?.(false);

    setPedido({
      titulo: 'Tem certeza?',
      confirmarLabel: 'Confirmar',
      cancelarLabel: 'Cancelar',
      perigo: true,
      ...opcoes,
    });

    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const responder = useCallback((resposta) => {
    setPedido(null);
    resolver.current?.(resposta);
    resolver.current = null;
  }, []);

  // Se a tela for desmontada com um pedido aberto, a promessa ficaria
  // pendurada para sempre e o `await` de quem chamou nunca voltaria.
  useEffect(() => () => resolver.current?.(false), []);

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}

      {pedido && (
        <Modal onClose={() => responder(false)} labelledBy="titulo-confirmacao">
          <ConfirmDialog pedido={pedido} onResponder={responder} />
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * O conteúdo do diálogo, fora do `Modal`.
 *
 * Separado pelo mesmo motivo da lista de pendências: o `Modal` renderiza por
 * portal e só existe depois de montar no navegador, então o conteúdo não
 * apareceria no HTML do servidor. Solto, dá para conferi-lo.
 */
export function ConfirmDialog({ pedido, onResponder }) {
  return (
    <div className="modal modal-confirm">
      <div className="modal-header">
        <h2 className="modal-title" id="titulo-confirmacao">
          {pedido.perigo && (
            <span className="confirm-icon"><Icon name="atencao" size={18} /></span>
          )}
          {pedido.titulo}
        </h2>
      </div>

      {pedido.texto && <p className="confirm-text">{pedido.texto}</p>}

      <div className="modal-actions">
        {/* O foco começa em Cancelar de propósito: num diálogo que apaga
            coisas, o Enter apressado tem que ser inofensivo. */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onResponder(false)}
          autoFocus
        >
          {pedido.cancelarLabel}
        </button>
        <button
          type="button"
          className={`btn ${pedido.perigo ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => onResponder(true)}
        >
          {pedido.confirmarLabel}
        </button>
      </div>
    </div>
  );
}
