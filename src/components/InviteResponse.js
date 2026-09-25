'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** Os botões do convite: aceitar leva para a viagem, recusar invalida o link. */
export default function InviteResponse({ token }) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [recusado, setRecusado] = useState(false);

  const responder = async (action) => {
    setError('');
    setLoading(action);

    try {
      const res = await fetch('/api/trips/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Erro ao responder o convite');
        return;
      }
      if (action === 'decline') {
        setRecusado(true);
        return;
      }
      router.push(`/trips/${data.tripId}`);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading('');
    }
  };

  if (recusado) {
    return (
      <>
        <div className="login-success" style={{ marginBottom: 16 }}>Convite recusado. O link deixou de valer.</div>
        <Link href="/" className="btn btn-secondary">Ir para o início</Link>
      </>
    );
  }

  return (
    <>
      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="invite-actions">
        <button className="btn btn-primary" onClick={() => responder('accept')} disabled={Boolean(loading)}>
          {loading === 'accept' ? 'Entrando...' : 'Participar da viagem'}
        </button>
        <button className="btn btn-secondary" onClick={() => responder('decline')} disabled={Boolean(loading)}>
          {loading === 'decline' ? 'Aguarde...' : 'Recusar'}
        </button>
      </div>
    </>
  );
}
