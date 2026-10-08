'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ordenarParadas } from '@/lib/roteiro';

/**
 * Rotas pelas ruas de cada trecho (RFC 0004). Um pedido por trecho; o
 * servidor enfileira (1 por segundo, regra do OSRM) e guarda em cache, então
 * reabrir a viagem não pede de novo.
 *
 * Devolve `{ rotas, atualizar }`: `rotas[stopId]` é o trecho que CHEGA na
 * parada, como `legKm` na RFC 0003.
 */
export function useRotas(stops) {
  const trechos = useMemo(() => {
    const lista = ordenarParadas(stops);
    return lista.slice(1).map((s, i) => ({
      id: s.id,
      url: `/api/externo/rota?de=${lista[i].lat},${lista[i].lng}&para=${s.lat},${s.lng}`,
    }));
  }, [stops]);

  const chave = trechos.map(t => t.url).join('|');
  const [rotas, setRotas] = useState({});

  const buscar = useCallback((t, atualizar = false) =>
    fetch(`${t.url}${atualizar ? '&atualizar=1' : ''}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(j => [t.id, j?.encontrada ? j : null]), []);

  useEffect(() => {
    let vivo = true;
    // Em sequência: o servidor já espaça os pedidos, e assim cada trecho
    // aparece no mapa assim que chega
    (async () => {
      for (const t of trechos) {
        const [id, rota] = await buscar(t);
        if (!vivo) return;
        setRotas(r => ({ ...r, [id]: rota }));
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const atualizar = useCallback(async (stopId) => {
    const t = trechos.find(x => x.id === stopId);
    if (!t) return;
    const [id, rota] = await buscar(t, true);
    setRotas(r => ({ ...r, [id]: rota }));
  }, [trechos, buscar]);

  return { rotas, atualizar };
}
