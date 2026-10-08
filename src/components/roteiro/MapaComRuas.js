'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { decodificarPolyline } from '@/lib/estrada';

/**
 * Mapa com ruas do trecho, no detalhe do bloco (RFC 0004). Leaflet com os
 * tiles do OpenStreetMap, carregado só quando o painel abre.
 *
 * Regras dos tiles do OSM: crédito visível no mapa (o Leaflet mostra no
 * canto), HTTPS, sem pré-carregar áreas e sem modo offline. A página não pode
 * ter `Referrer-Policy: no-referrer`, porque os tiles exigem o Referer.
 */
export default function MapaComRuas({ de, para, polyline, cor = '#6c5ce7' }) {
  const caixa = useRef(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!caixa.current) return;
    let mapa;
    let vivo = true;

    import('leaflet').then(({ default: L }) => {
      if (!vivo || !caixa.current) return;
      mapa = L.map(caixa.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(mapa);

      // O SVG do Leaflet não entende var(--x): resolve para a cor de verdade
      const tinta = cor.startsWith('var(')
        ? getComputedStyle(caixa.current).getPropertyValue(cor.slice(4, -1)).trim() || '#6c5ce7'
        : cor;
      const pontos = polyline ? decodificarPolyline(polyline) : [[de.lat, de.lng], [para.lat, para.lng]];
      const linha = L.polyline(pontos, {
        color: tinta, weight: 5, opacity: 0.9, dashArray: polyline ? null : '6 8',
      }).addTo(mapa);
      for (const [p, rotulo] of [[de, de.city], [para, para.city]]) {
        L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: tinta, fillOpacity: 1 })
          .bindTooltip(rotulo, { permanent: true, direction: 'top', offset: [0, -8], className: 'mapa-ruas-rotulo' })
          .addTo(mapa);
      }
      mapa.fitBounds(linha.getBounds(), { padding: [28, 28] });
    }).catch(() => { if (vivo) setFalhou(true); });

    return () => {
      vivo = false;
      mapa?.remove();
    };
    // Só o que muda o desenho: objetos novos a cada render recriariam o mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de.lat, de.lng, para.lat, para.lng, de.city, para.city, polyline, cor]);

  if (falhou) return null;
  return <div ref={caixa} className="mapa-ruas" role="img" aria-label={`Mapa de ${de.city} a ${para.city}`} />;
}
