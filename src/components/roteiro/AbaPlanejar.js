'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { useConfirm } from '@/components/ConfirmProvider';

const IDEIAS = [
  'Monte um roteiro de 8 dias pela Serra Gaúcha saindo de Itapema/SC, de carro, com cachorro.',
  'Troque os passeios que não aceitam cachorro por opções que aceitem.',
  'Deixe o penúltimo dia mais leve, com no máximo duas atividades.',
  'O que vale fazer à noite em Gramado nas nossas datas?',
];

const ACOES = {
  adicionar: { sinal: '+', classe: 'add' },
  remover: { sinal: '−', classe: 'rem' },
  alterar: { sinal: '~', classe: 'alt' },
  mover: { sinal: '→', classe: 'mov' },
};

const SITUACOES = {
  pendente: null,
  aplicada: 'Aplicada',
  descartada: 'Descartada',
  expirada: 'Expirou',
  'com-erros': 'Não dá para aplicar',
  desatualizada: 'O roteiro mudou depois desta proposta',
};

const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const mostrar = (campo, v) => {
  if (v == null || v === '') return '—';
  return campo === 'data' ? dm(String(v)) : String(v);
};

function Proposta({ p, ocupado, onAplicar, onDescartar }) {
  const rotulo = SITUACOES[p.situacao];
  return (
    <div className={`proposta proposta-${p.situacao}`}>
      <div className="proposta-cabeca">
        <strong><Icon name="roteiro" /> {p.resumo || 'Mudanças propostas'}</strong>
        {rotulo && <span className="roteiro-selo">{rotulo}</span>}
      </div>
      <ul className="proposta-diff">
        {p.diff.map((x, i) => {
          const a = ACOES[x.acao];
          return (
            <li key={i} className={`diff-${a.classe}`}>
              <span className="diff-sinal" aria-hidden="true">{a.sinal}</span>
              <span>
                <span className="diff-tipo">{x.tipo === 'parada' ? 'Parada' : 'Atividade'}</span>{' '}
                <strong>{x.titulo}</strong> <span className="diff-data">{dm(x.data)}</span>
                {x.mudancas.length > 0 && (
                  <span className="diff-mudancas">
                    {x.mudancas.map((m, j) => (
                      <span key={j}>{m.campo}: <s>{mostrar(m.campo, m.antes)}</s> → {mostrar(m.campo, m.depois)}</span>
                    ))}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {p.erros.length > 0 && (
        <ul className="proposta-erros">
          {p.erros.map((e, i) => <li key={i}><Icon name="atencao" /> {e.mensagem}</li>)}
        </ul>
      )}
      {p.situacao === 'pendente' && (
        <div className="proposta-acoes">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDescartar} disabled={ocupado}>Descartar</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onAplicar} disabled={ocupado}>
            {ocupado ? 'Aplicando…' : `Aplicar ${p.diff.length} ${p.diff.length === 1 ? 'mudança' : 'mudanças'}`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Planejar a viagem conversando com a IA (RFC 0004). A IA só propõe; cada
 * proposta aparece como lista de diferenças, e nada muda até "Aplicar".
 */
export default function AbaPlanejar({ tripId, hojeISO, onAplicado }) {
  const confirmar = useConfirm();
  const [mensagens, setMensagens] = useState(null);
  const [uso, setUso] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aplicando, setAplicando] = useState(null);
  const [erro, setErro] = useState('');
  const fim = useRef(null);

  const carregarUso = () => fetch(`/api/trips/${tripId}/ia/uso`).then(r => (r.ok ? r.json() : null)).then(setUso);
  const carregar = () => fetch(`/api/trips/${tripId}/ia/conversa`).then(r => (r.ok ? r.json() : { mensagens: [] })).then(j => setMensagens(j.mensagens));

  useEffect(() => {
    carregar();
    carregarUso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens?.length, enviando]);

  const enviar = async (t = texto) => {
    const conteudo = t.trim();
    if (!conteudo || enviando) return;
    setErro('');
    setEnviando(true);
    setTexto('');
    setMensagens(m => [...(m || []), { id: 'enviando', papel: 'user', texto: conteudo }]);
    const res = await fetch(`/api/trips/${tripId}/ia/conversa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: conteudo, hoje: hojeISO }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setEnviando(false);
    if (!res?.ok) {
      setMensagens(m => m.filter(x => x.id !== 'enviando'));
      setTexto(conteudo);
      return setErro(j.error || 'A IA não respondeu agora. Tente de novo.');
    }
    setMensagens(m => [...m.filter(x => x.id !== 'enviando'), ...j.mensagens]);
    carregarUso();
  };

  const decidir = async (proposta, acao) => {
    setErro('');
    setAplicando(proposta.id);
    const res = await fetch(`/api/trips/${tripId}/ia/propostas/${proposta.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setAplicando(null);
    if (!res?.ok) setErro(j.error || 'Não deu para concluir.');
    await carregar();
    if (res?.ok && acao === 'aplicar') onAplicado?.();
  };

  const recomecar = async () => {
    const ok = await confirmar({
      titulo: 'Recomeçar a conversa?',
      texto: 'O histórico com a IA some. O roteiro e o que já foi aplicado continuam como estão.',
      confirmarLabel: 'Recomeçar',
    });
    if (!ok) return;
    await fetch(`/api/trips/${tripId}/ia/conversa`, { method: 'DELETE' });
    setMensagens([]);
  };

  if (uso && !uso.configurada) {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon"><Icon name="dica" /></div>
        <p className="empty-state-text">
          A IA não está configurada neste servidor. Coloque a chave da Anthropic em
          <code> ANTHROPIC_API_KEY</code> (no .env e na Vercel) para planejar conversando.
        </p>
      </div>
    );
  }

  return (
    <div className="planejar">
      <div className="planejar-topo">
        <p className="quick-add-note" style={{ margin: 0 }}>
          Diga como quer viajar; a IA propõe mudanças e você confere antes de aplicar.
        </p>
        <div className="planejar-uso">
          {uso && <span>{uso.hoje.chamadas}/{uso.hoje.limite} hoje · US$ {(uso.viagem?.custo ?? 0).toFixed(2)} nesta viagem</span>}
          {mensagens?.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={recomecar} disabled={enviando}>Recomeçar</button>
          )}
        </div>
      </div>

      <div className="card planejar-chat" aria-live="polite">
        {mensagens === null && <div className="skeleton" style={{ height: 80 }} />}
        {mensagens?.length === 0 && !enviando && (
          <div className="planejar-ideias">
            <p>Comece por aqui, ou escreva do seu jeito:</p>
            {IDEIAS.map(i => (
              <button key={i} type="button" className="filter-chip" onClick={() => enviar(i)}>{i}</button>
            ))}
          </div>
        )}
        {mensagens?.map(m => (
          <div key={m.id} className={`balao balao-${m.papel}`}>
            {m.texto && <p>{m.texto}</p>}
            {m.proposta && (
              <Proposta
                p={m.proposta} ocupado={aplicando === m.proposta.id}
                onAplicar={() => decidir(m.proposta, 'aplicar')}
                onDescartar={() => decidir(m.proposta, 'descartar')}
              />
            )}
          </div>
        ))}
        {enviando && (
          <div className="balao balao-assistant balao-pensando">
            <span /><span /><span />
            <small>A IA está pensando; pode pesquisar na web.</small>
          </div>
        )}
        <div ref={fim} />
      </div>

      {erro && <p className="detalhe-nota detalhe-aviso">{erro}</p>}

      <form className="planejar-envio" onSubmit={e => { e.preventDefault(); enviar(); }}>
        <textarea
          className="form-input" rows={2} value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="Ex.: troque o Mini Mundo por algo que aceite cachorro"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          disabled={enviando} aria-label="Mensagem para a IA"
        />
        <button type="submit" className="btn btn-primary" disabled={enviando || !texto.trim()}>Enviar</button>
      </form>
    </div>
  );
}
