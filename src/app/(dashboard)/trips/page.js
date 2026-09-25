'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBRL, formatDate, todayISO } from '@/lib/utils';
import { resumoViagem } from '@/lib/trips';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import TripForm from '@/components/TripForm';

const GRUPOS = [
  { status: 'durante', titulo: 'Em andamento' },
  { status: 'antes', titulo: 'Próximas' },
  { status: 'encerrada', titulo: 'Encerradas' },
];

function linhaDeStatus(r) {
  if (r.status === 'antes') {
    return r.diasAteIda === 1 ? 'Começa amanhã' : `Começa em ${r.diasAteIda} dias`;
  }
  if (r.status === 'durante') {
    return `Dia ${r.hoje.diaDaViagem} de ${r.totalDias} · hoje ainda pode ${formatBRL(Math.max(r.hoje.resta, 0))}`;
  }
  return `Encerrada · ${formatBRL(r.gasto.total)} de ${formatBRL(r.orcamento)}`;
}

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/trips');
    setTrips(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hoje = todayISO();
  const comResumo = trips.map(t => ({ trip: t, r: resumoViagem(t, t.entries, hoje) }));

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Viagens</h1>
          <p className="page-subtitle">Orçamento, gastos e quanto dá para gastar por dia</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="adicionar" /> Nova viagem
        </button>
      </div>

      {loading && <div className="skeleton" style={{ height: 140 }} />}

      {!loading && trips.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon"><Icon name="viagem" /></div>
          <p className="empty-state-text">Nenhuma viagem ainda</p>
        </div>
      )}

      {GRUPOS.map(({ status, titulo }) => {
        const doGrupo = comResumo.filter(x => x.r.status === status);
        if (!doGrupo.length) return null;

        // Próximas em ordem de chegada; as outras, a mais recente primeiro
        if (status === 'antes') doGrupo.reverse();

        return (
          <div key={status} className="section">
            <div className="section-title"><Icon name="viagem" /> {titulo}</div>
            <div className="grid-2">
              {doGrupo.map(({ trip, r }) => {
                const pct = r.orcamento > 0 ? Math.min((r.gasto.total / r.orcamento) * 100, 100) : 0;
                const estourou = r.gasto.total > r.orcamento;
                return (
                  <Link key={trip.id} href={`/trips/${trip.id}`} className="card goal-card trip-card">
                    <div className="goal-header">
                      <span className="goal-name">{trip.name}</span>
                      <span className="goal-percentage">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="trip-card-dates">
                      {formatDate(trip.startDate)} a {formatDate(trip.endDate)}
                    </div>
                    <div className="progress-bar">
                      <div className={`progress-fill ${estourou ? 'expense' : pct >= 85 ? 'warning' : 'income'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="goal-amounts">
                      <span>{formatBRL(r.gasto.total)}</span>
                      <span>{formatBRL(r.orcamento)}</span>
                    </div>
                    <div className="trip-card-status">{linhaDeStatus(r)}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Nova viagem</h2>
              <button className="modal-close" onClick={() => setShowForm(false)} aria-label="Fechar"><Icon name="fechar" /></button>
            </div>
            <TripForm
              onCancel={() => setShowForm(false)}
              onSaved={(trip) => { setShowForm(false); router.push(`/trips/${trip.id}`); }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
