'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL, formatDate } from '@/lib/utils';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import { useConfirm } from '@/components/ConfirmProvider';

/**
 * Quem participa da viagem, quanto cada um gastou, e os convites.
 *
 * O link do convite aparece uma vez só, logo depois de gerado: o servidor
 * não guarda o token, então não há como mostrá-lo de novo. Perdeu, cancela
 * e gera outro.
 */
export default function TripMembers({ tripId, tripName, members, dono, me, porPessoa, onChanged }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [convites, setConvites] = useState([]);
  const [link, setLink] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState('');

  const gastoDe = Object.fromEntries(porPessoa.map(p => [p.userId, p.valor]));

  const carregarConvites = useCallback(async () => {
    if (!dono) return;
    const res = await fetch(`/api/trips/${tripId}/invites`);
    setConvites(res.ok ? await res.json() : []);
  }, [dono, tripId]);

  useEffect(() => { carregarConvites(); }, [carregarConvites]);

  const convidar = async () => {
    setErro('');
    setGerando(true);
    const res = await fetch(`/api/trips/${tripId}/invites`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setGerando(false);

    if (!res.ok) return setErro(data.error || 'Erro ao gerar convite');
    setCopiado(false);
    setLink({ url: `${window.location.origin}/trips/invite/${data.token}`, expiresAt: data.expiresAt });
    carregarConvites();
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
    } catch {
      setErro('Não deu para copiar. Selecione o link e copie à mão.');
    }
  };

  const compartilhar = async () => {
    try {
      await navigator.share({ title: `Viagem ${tripName}`, text: `Participe da viagem ${tripName} comigo no FinControl`, url: link.url });
    } catch {
      // Cancelar o compartilhamento também cai aqui; não é erro
    }
  };

  const cancelarConvite = async (inviteId) => {
    await fetch(`/api/trips/${tripId}/invites?inviteId=${inviteId}`, { method: 'DELETE' });
    carregarConvites();
  };

  const remover = async (m) => {
    const saindo = m.userId === me;
    const ok = await confirmar({
      titulo: saindo ? 'Sair desta viagem?' : `Remover ${m.name} da viagem?`,
      texto: saindo
        ? 'Seus gastos saem da viagem. O que você pagou pela conta continua no seu extrato, porque o dinheiro saiu de fato.'
        : `Os gastos de ${m.name} saem da viagem. O que foi pago pela conta continua no extrato dessa pessoa.`,
      confirmarLabel: saindo ? 'Sair da viagem' : 'Remover',
    });
    if (!ok) return;

    const res = await fetch(`/api/trips/${tripId}/members?userId=${m.userId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setErro(data.error || 'Erro ao remover');
    }
    if (saindo) router.push('/trips');
    else onChanged?.();
  };

  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="section">
      <div className="section-title"><Icon name="dividas" /> Participantes</div>
      <div className="card trip-members">
        {erro && <div className="login-error" style={{ marginBottom: 12 }}>{erro}</div>}

        {members.map(m => (
          <div key={m.userId} className="trip-member">
            <div className="trip-member-name">
              {m.name}{m.userId === me && ' (você)'}
              {m.role === 'OWNER' && <span className="trip-member-role">criou a viagem</span>}
            </div>
            <div className="trip-member-spent">{formatBRL(gastoDe[m.userId] || 0)}</div>
            {m.role !== 'OWNER' && (dono || m.userId === me) && (
              <button className="btn btn-sm btn-secondary" onClick={() => remover(m)}>
                {m.userId === me ? 'Sair' : 'Remover'}
              </button>
            )}
          </div>
        ))}

        {dono && (
          <>
            {convites.length > 0 && (
              <div className="trip-invites">
                {convites.map(c => (
                  <div key={c.id} className="trip-invite">
                    <span>Convite aberto · vale até {formatDate(c.expiresAt)}</span>
                    <button className="link-button" onClick={() => cancelarConvite(c.id)}>Cancelar</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={convidar} disabled={gerando} style={{ marginTop: 12 }}>
              <Icon name="adicionar" /> {gerando ? 'Gerando...' : 'Convidar por link'}
            </button>
          </>
        )}
      </div>

      {link && (
        <Modal onClose={() => setLink(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Link do convite</h2>
              <button className="modal-close" onClick={() => setLink(null)} aria-label="Fechar"><Icon name="fechar" /></button>
            </div>
            <p className="quick-add-note" style={{ marginTop: 0 }}>
              Mande para quem vai viajar com você. O link funciona uma vez, até{' '}
              {formatDate(link.expiresAt)}, e só para quem já tem conta no app.
              Ele não aparece de novo depois de fechar esta janela.
            </p>
            <input className="form-input invite-link" readOnly value={link.url} onFocus={e => e.target.select()} />
            <div className="modal-actions">
              {podeCompartilhar && (
                <button className="btn btn-secondary" onClick={compartilhar}>Compartilhar</button>
              )}
              <button className="btn btn-primary" onClick={copiar}>
                <Icon name={copiado ? 'concluir' : 'nota'} /> {copiado ? 'Copiado' : 'Copiar link'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
