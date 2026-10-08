'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import TripEntryForm from '@/components/TripEntryForm';
import { useConfirm } from '@/components/ConfirmProvider';
import { estadias, diasDoRoteiro, ritmo } from '@/lib/roteiro';
import { diaDe, isoDoDia, resumoViagem } from '@/lib/trips';
import { blocosDoRoteiro } from '@/lib/blocos';
import { aplicarRotas } from '@/lib/estrada';
import MapaDaRota from './MapaDaRota';
import TimelineDoRoteiro from './TimelineDoRoteiro';
import CalendarioDeEstadias from './CalendarioDeEstadias';
import PainelDoRitmo from './PainelDoRitmo';
import ParadaForm from './ParadaForm';
import AtividadeForm from './AtividadeForm';
import ImportarRoteiro from './ImportarRoteiro';
import BlocosDoRoteiro from './BlocosDoRoteiro';
import DetalheDoBloco from './DetalheDoBloco';
import { useClimaDoRoteiro } from './Clima';
import { useRotas } from './useRotas';
import { coresDasParadas } from './formato';
import { menosMovimentoAgora } from './movimento';

/** O que acende em cada vista a partir do foco (dia ou parada sob o mouse). */
function calcularDestaque(foco, lista, dias) {
  const vazio = { dias: new Set(), paradas: new Set(), trechos: new Set() };
  if (!foco) return vazio;

  if (foco.tipo === 'dia') {
    const d = dias.find(x => x.data === foco.data);
    if (!d) return vazio;
    return {
      dias: new Set([d.data]),
      paradas: new Set([d.manha?.id, d.noite?.id].filter(Boolean)),
      trechos: new Set(d.trechos.map(t => t.para.indice - 1)),
    };
  }

  // Parada: os dias da estadia, da chegada até a saída
  const ids = new Set(foco.ids);
  const diasDaParada = new Set();
  for (const s of lista) {
    if (!ids.has(s.id)) continue;
    const ate = s.saida ? diaDe(s.saida) : diaDe(s.chegada);
    for (let x = diaDe(s.chegada); x <= ate; x++) diasDaParada.add(isoDoDia(x));
  }
  return { dias: diasDaParada, paradas: ids, trechos: new Set() };
}

/**
 * A aba Roteiro: mapa, calendário, ritmo e a timeline dos dias. Ver
 * docs/rfc/0003-roteiro.md. Qualquer participante edita; importar é só do
 * dono, e só com o roteiro vazio.
 *
 * Status e ordem mudam primeiro na tela e depois no servidor (`mudarLocal`),
 * porque marcar uma atividade no meio do passeio precisa responder no toque.
 * Se o servidor recusar, recarrega e a tela volta ao que vale.
 */
export default function AbaRoteiro({ tripId, trip, dono, stops, activities, entries, accounts, hojeISO, mudarLocal, recarregar }) {
  const confirmar = useConfirm();
  const [foco, setFoco] = useState(null);
  const [modal, setModal] = useState(null);
  const [outras, setOutras] = useState([]);

  // Km e tempo pelas ruas (OSRM) onde a parada não tem número digitado. Daqui
  // para baixo tudo usa as paradas efetivas; editar usa a original (`original`),
  // para o formulário não gravar o número calculado como se fosse digitado.
  const { rotas, atualizar: atualizarRota } = useRotas(stops);
  const efetivas = useMemo(() => aplicarRotas(stops, rotas), [stops, rotas]);
  const original = (s) => stops.find(x => x.id === s.id) || s;

  const lista = useMemo(() => estadias(efetivas), [efetivas]);
  const cores = useMemo(() => coresDasParadas(lista), [lista]);
  const dias = useMemo(() => diasDoRoteiro(trip, efetivas, activities, entries), [trip, efetivas, activities, entries]);
  const r = useMemo(() => ritmo(trip, entries, activities, efetivas, hojeISO), [trip, entries, activities, efetivas, hojeISO]);
  const resumo = useMemo(() => resumoViagem(trip, entries, hojeISO), [trip, entries, hojeISO]);
  const destaque = useMemo(() => calcularDestaque(foco, lista, dias), [foco, lista, dias]);
  const blocos = useMemo(() => blocosDoRoteiro(lista, dias), [lista, dias]);
  const clima = useClimaDoRoteiro(blocos, hojeISO);

  // O bloco aberto fica na URL: recarregar mantém o painel, e o voltar do
  // navegador fecha. Abrir empilha uma entrada no histórico; fechar pelo X
  // desfaz essa entrada em vez de criar outra.
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(() => searchParams.get('bloco'));
  const urlCom = (id) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('bloco', id); else u.searchParams.delete('bloco');
    return `${u.pathname}${u.search}`;
  };
  const abrirBloco = (id) => {
    startTransition(() => setAberto(id));
    window.history.pushState({ bloco: id }, '', urlCom(id));
  };
  const fecharBloco = useCallback(() => {
    if (window.history.state?.bloco) window.history.back();
    else {
      startTransition(() => setAberto(null));
      window.history.replaceState(null, '', urlCom(null));
    }
  }, []);
  useEffect(() => {
    const aoVoltar = () => startTransition(() => setAberto(new URL(window.location.href).searchParams.get('bloco')));
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);
  const blocoAberto = blocos.find(b => b.id === aberto) || null;

  // As outras viagens do mesmo período, apagadas no calendário
  useEffect(() => {
    fetch('/api/trips').then(res => (res.ok ? res.json() : [])).then(todas => {
      if (Array.isArray(todas)) setOutras(todas.filter(v => v.id !== tripId));
    }).catch(() => {});
  }, [tripId]);

  // Durante a viagem, abre no dia de hoje
  const rolou = useRef(false);
  useEffect(() => {
    if (rolou.current || resumo.status !== 'durante') return;
    rolou.current = true;
    const el = document.getElementById(`dia-${hojeISO}`);
    el?.scrollIntoView({ behavior: menosMovimentoAgora() ? 'auto' : 'smooth', block: 'center' });
  }, [resumo.status, hojeISO]);

  const irParaDia = (iso) => {
    const el = document.getElementById(`dia-${iso}`);
    if (!el) return;
    el.scrollIntoView({ behavior: menosMovimentoAgora() ? 'auto' : 'smooth', block: 'center' });
    // Atributo, não classe, pelo mesmo motivo de data-revelado
    delete el.dataset.piscar;
    void el.offsetWidth; // reinicia a animação se clicar duas vezes
    el.dataset.piscar = '';
  };

  const salvarAtividade = async (a, campos) => {
    mudarLocal(d => ({ ...d, activities: d.activities.map(x => (x.id === a.id ? { ...x, ...campos } : x)) }));
    const res = await fetch(`/api/trips/${tripId}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, ...campos }),
    });
    if (!res.ok) recarregar();
  };

  const alternarStatus = (a) => salvarAtividade(a, { status: a.status === 'FEITA' ? 'PLANEJADA' : 'FEITA' });
  const pular = (a) => salvarAtividade(a, { status: a.status === 'PULADA' ? 'PLANEJADA' : 'PULADA' });

  /** Troca com a vizinha no mesmo período e renumera o período inteiro. */
  const mover = async (a, dir, doPeriodo) => {
    const i = doPeriodo.findIndex(x => x.id === a.id);
    const j = i + dir;
    if (j < 0 || j >= doPeriodo.length) return;
    const nova = [...doPeriodo];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    const ordens = new Map(nova.map((x, k) => [x.id, k]));
    const mudaram = nova.filter(x => x.order !== ordens.get(x.id));

    mudarLocal(d => ({
      ...d,
      activities: d.activities.map(x => (ordens.has(x.id) ? { ...x, order: ordens.get(x.id) } : x)),
    }));
    const res = await Promise.all(mudaram.map(x => fetch(`/api/trips/${tripId}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: x.id, order: ordens.get(x.id) }),
    })));
    if (res.some(x => !x.ok)) recarregar();
  };

  const apagarAtividade = async (a) => {
    const ligados = entries.filter(e => e.activityId === a.id).length;
    const ok = await confirmar({
      titulo: `Apagar "${a.title}"?`,
      texto: ligados
        ? `${ligados === 1 ? 'O gasto ligado a ela continua' : `Os ${ligados} gastos ligados a ela continuam`} na viagem, só sem a atividade.`
        : 'Sai só do roteiro.',
      confirmarLabel: 'Apagar',
    });
    if (!ok) return;
    setModal(null);
    await fetch(`/api/trips/${tripId}/activities?activityId=${a.id}`, { method: 'DELETE' });
    recarregar();
  };

  const usarFolga = async (s, folga) => {
    const res = await fetch(`/api/trips/${tripId}/stops`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, legBufferPct: folga }),
    });
    if (res.ok) recarregar();
  };

  const apagarParada = async (s) => {
    const ok = await confirmar({
      titulo: `Tirar ${s.city} do roteiro?`,
      texto: 'As atividades e os gastos dos dias continuam. Só a parada e o trecho até ela saem.',
      confirmarLabel: 'Tirar',
    });
    if (!ok) return;
    setModal(null);
    await fetch(`/api/trips/${tripId}/stops?stopId=${s.id}`, { method: 'DELETE' });
    recarregar();
  };

  const fechar = () => setModal(null);
  const salvo = () => { setModal(null); recarregar(); };
  const vazio = stops.length === 0 && activities.length === 0;

  return (
    <div className="roteiro">
      <div className="roteiro-acoes">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: 'parada' })}>
          <Icon name="local" /> Parada
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: 'atividade' })}>
          <Icon name="adicionar" /> Atividade
        </button>
        {dono && vazio && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ tipo: 'importar' })}>
            <Icon name="importar" /> Importar roteiro
          </button>
        )}
      </div>

      <MapaDaRota
        estadias={lista} dias={dias} cores={cores} hojeISO={hojeISO}
        destaque={destaque} onFoco={setFoco}
        onEditarParada={s => setModal({ tipo: 'parada', stop: original(s) })}
      />

      {blocos.length > 0 && (
        <BlocosDoRoteiro
          blocos={blocos} cores={cores} aberto={aberto} destaque={destaque} climaPorBloco={clima.porBloco}
          onAbrir={abrirBloco} onFoco={setFoco}
        />
      )}

      <div className="roteiro-grade">
        <section className="section">
          <div className="section-title"><Icon name="estadias" /> Estadias</div>
          <div className="card roteiro-cal-card">
            <CalendarioDeEstadias
              trip={trip} estadias={lista} cores={cores} outrasViagens={outras} hojeISO={hojeISO}
              destaque={destaque} onDia={irParaDia} onFoco={setFoco}
            />
          </div>
        </section>
        <section className="section">
          <div className="section-title"><Icon name="ritmo" /> Ritmo</div>
          <PainelDoRitmo ritmo={r} dias={dias} diasAteIda={resumo.diasAteIda} />
        </section>
      </div>

      <section className="section">
        <div className="section-title"><Icon name="roteiro" /> Dia a dia</div>
        <TimelineDoRoteiro
          dias={dias} cores={cores} hojeISO={hojeISO} limiteDia={r.limiteDia}
          destaque={destaque} onFoco={setFoco} climaPorDia={clima.porDia}
          onNovaAtividade={data => setModal({ tipo: 'atividade', data })}
          onEditarAtividade={a => setModal({ tipo: 'atividade', activity: a })}
          onAlternarStatus={alternarStatus}
          onPular={pular}
          onMover={mover}
          onNovoGasto={data => setModal({ tipo: 'gasto', data })}
        />
      </section>

      {blocoAberto && (
        <DetalheDoBloco
          bloco={blocoAberto} cores={cores} hojeISO={hojeISO} limiteDia={r.limiteDia}
          destaque={destaque} onFoco={setFoco} onFechar={fecharBloco}
          clima={clima.porBloco[blocoAberto.id]} climaPorDia={clima.porDia}
          trip={trip} altitudes={Object.fromEntries(Object.entries(clima.porBloco).map(([id, c]) => [id, c.elevacao]))}
          onAtualizarRota={atualizarRota} onUsarFolga={usarFolga}
          onAdicionarSugestao={(sug, bloco) => setModal({
            tipo: 'atividade',
            data: bloco.inicio,
            inicial: {
              title: sug.title,
              category: sug.category,
              period: sug.period,
              pet: sug.pet,
              estimatedCost: sug.estimatedCost,
              link: sug.officialUrl || sug.sources[0] || '',
              notes: `Sugestão da IA. Fontes: ${sug.sources.join(' ')}`,
              wikiTitle: sug.wikiTitle,
              photoUrl: sug.foto?.url || null,
              photoCredit: sug.foto?.credito || null,
              photoSourceUrl: sug.foto?.fonte || null,
            },
          })}
          onEditarParada={s => setModal({ tipo: 'parada', stop: original(s) })}
          onNovaAtividade={data => setModal({ tipo: 'atividade', data })}
          onEditarAtividade={a => setModal({ tipo: 'atividade', activity: a })}
          onAlternarStatus={alternarStatus}
          onPular={pular}
          onMover={mover}
          onNovoGasto={data => setModal({ tipo: 'gasto', data })}
        />
      )}

      {modal && (
        <Modal onClose={fechar}>
          <div className={`modal ${modal.tipo === 'importar' ? 'modal-largo' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {modal.tipo === 'parada' && (modal.stop ? `Parada: ${modal.stop.city}` : 'Nova parada')}
                {modal.tipo === 'atividade' && (modal.activity ? 'Editar atividade' : 'Nova atividade')}
                {modal.tipo === 'gasto' && `Gasto de ${dias.find(d => d.data === modal.data)?.noite?.city || trip.name}`}
                {modal.tipo === 'importar' && 'Importar roteiro'}
              </h2>
              <button className="modal-close" onClick={fechar} aria-label="Fechar"><Icon name="fechar" size={18} /></button>
            </div>

            {modal.tipo === 'parada' && (
              <ParadaForm
                tripId={tripId} trip={trip} stop={modal.stop}
                primeira={modal.stop ? modal.stop.tipo === 'origem' : stops.length === 0}
                onSaved={salvo} onCancel={fechar}
                onDelete={modal.stop ? () => apagarParada(modal.stop) : undefined}
              />
            )}
            {modal.tipo === 'atividade' && (
              <AtividadeForm
                tripId={tripId} trip={trip} activity={modal.activity} dataInicial={modal.data} inicial={modal.inicial}
                onSaved={salvo} onCancel={fechar}
                onDelete={modal.activity ? () => apagarAtividade(modal.activity) : undefined}
              />
            )}
            {modal.tipo === 'gasto' && (
              <TripEntryForm
                tripId={tripId} accounts={accounts} activities={activities}
                defaults={{ date: modal.data }}
                onSaved={salvo} onCancel={fechar}
              />
            )}
            {modal.tipo === 'importar' && <ImportarRoteiro tripId={tripId} trip={trip} onSaved={salvo} onCancel={fechar} />}
          </div>
        </Modal>
      )}
    </div>
  );
}
