'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Icon from '@/components/Icon';
import { diaDe } from '@/lib/trips';
import { folgaDoTrecho, sugestaoDeSerra, saidaSugerida, linkGoogleMaps } from '@/lib/estrada';
import { diaCurto, duracao } from './formato';

// O Leaflet mexe em window: só no navegador, e só quando o painel abre
const MapaComRuas = dynamic(() => import('./MapaComRuas'), { ssr: false });

/**
 * O trecho até a cidade, no painel do bloco (RFC 0004): km e tempo (pelas
 * ruas ou informados), a saída sugerida com folga, a sugestão de serra, o
 * trânsito no Google Maps e o mapa com ruas.
 *
 * O tempo é típico, sem trânsito: o OSRM público não tem trânsito, e a tela
 * diz isso em vez de fingir.
 */
export default function ComoChegar({ trecho: t, trip, cor, hojeISO, altitude, titulo, onAtualizar, onUsarFolga }) {
  const [atualizando, setAtualizando] = useState(false);
  const para = t.para;
  const folga = folgaDoTrecho(trip, para);
  const saida = saidaSugerida(para.arriveBy, para.legMinutes, folga);
  const serra = sugestaoDeSerra(trip, para, altitude);
  const faltam = diaDe(para.chegada) - diaDe(hojeISO);
  const perto = faltam >= -1 && faltam <= 7;

  const atualizar = async () => {
    setAtualizando(true);
    await onAtualizar(para.id);
    setAtualizando(false);
  };

  return (
    <section className="detalhe-secao">
      <h3><Icon name="carro" /> {titulo}</h3>
      <p className="detalhe-trecho">
        <strong>{t.de.city} → {para.city}</strong>
        <span>{diaCurto(para.chegada)}</span>
      </p>

      {(para.legKm || para.legMinutes) ? (
        <div className="estrada-numeros">
          {para.legKm != null && <div><span>Distância</span><strong>{Math.round(para.legKm)} km</strong></div>}
          {para.legMinutes != null && <div><span>Tempo típico</span><strong>{duracao(para.legMinutes)}</strong></div>}
          {para.legMinutes != null && <div><span>Com folga de {folga}%</span><strong>{duracao(Math.round(para.legMinutes * (1 + folga / 100)))}</strong></div>}
        </div>
      ) : (
        <p className="detalhe-nota">Sem distância ainda: a rota pelas ruas está sendo calculada ou o serviço está fora do ar.</p>
      )}

      <p className="estrada-fonte">
        {para.legFonte === 'ruas' && <span className="roteiro-selo">pelas ruas · sem trânsito</span>}
        {para.legFonte === 'informado' && <span className="roteiro-selo">informado na parada</span>}
        {para.legFonte === 'informado' && para.rota && (
          <span className="estrada-comparar">pelas ruas: {Math.round(para.rota.km)} km · {duracao(para.rota.minutos)}</span>
        )}
      </p>

      {saida && (
        <p className="estrada-saida">
          <Icon name="hora" /> Para chegar às <strong>{para.arriveBy}</strong>, saia até <strong>{saida.horario}</strong>
          {saida.diaAntes && ' do dia anterior'}.
        </p>
      )}
      {!para.arriveBy && para.legMinutes && (
        <p className="detalhe-nota">Informe na parada a hora em que quer chegar para ver o horário de saída.</p>
      )}

      {serra && (
        <p className="estrada-serra">
          <Icon name="atencao" /> {para.city} fica a {serra.altitude} m: estrada de serra costuma demorar mais que o típico.
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUsarFolga(para, serra.folga)}>
            Usar folga de {serra.folga}%
          </button>
        </p>
      )}

      <div className="estrada-acoes">
        <a
          href={linkGoogleMaps(t.de, para)} target="_blank" rel="noopener noreferrer"
          className={`btn btn-sm ${perto ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Icon name="link" /> Ver trânsito agora no Google Maps
        </a>
        <button type="button" className="btn btn-secondary btn-sm" onClick={atualizar} disabled={atualizando}>
          {atualizando ? 'Atualizando…' : 'Atualizar rota'}
        </button>
      </div>

      <MapaComRuas de={t.de} para={para} polyline={para.rota?.polyline || null} cor={cor} />
    </section>
  );
}
