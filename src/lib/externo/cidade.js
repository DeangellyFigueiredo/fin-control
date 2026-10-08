import { buscarJson } from './http.js';
import { comCache, DIA_MS } from './cache.js';
import { lugarExato, NOME_DA_UF } from '../lugares.js';

/**
 * Coordenada de uma cidade: primeiro a lista de lugares.js, depois o
 * Nominatim do OpenStreetMap. Ver docs/rfc/0004-roteiro-inteligente.md.
 *
 * Regras do Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
 * no máximo 1 pedido por segundo somando todos os usuários (a fila de http.js
 * cuida disso), User-Agent do app, resultado em cache e NADA de autocompletar:
 * só se busca ao confirmar, nunca enquanto se digita. `NOMINATIM_DESLIGADO=1`
 * desliga o serviço sem mudar código, como a política exige que seja possível.
 */

const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

export async function coordenadaDaCidade(nome, uf) {
  const daLista = lugarExato(nome, uf);
  if (daLista) return { encontrada: true, city: daLista.nome, uf: daLista.uf, lat: daLista.lat, lng: daLista.lng, fonte: 'lista' };
  if (process.env.NOMINATIM_DESLIGADO === '1') return { encontrada: false };

  const chave = `nominatim:${String(nome).trim().toLowerCase()}|${String(uf || '').toUpperCase()}`;
  return comCache(chave, 180 * DIA_MS, async () => {
    const q = new URLSearchParams({
      city: nome, country: 'Brazil', format: 'jsonv2', limit: '1', 'accept-language': 'pt-BR',
    });
    if (NOME_DA_UF[String(uf || '').toUpperCase()]) q.set('state', NOME_DA_UF[uf.toUpperCase()]);
    const j = await buscarJson(`${NOMINATIM}/search?${q}`);
    const r = Array.isArray(j) ? j[0] : null;
    if (!r) return { encontrada: false };
    return {
      encontrada: true,
      city: nome,
      uf: String(uf || '').toUpperCase(),
      lat: Math.round(Number(r.lat) * 1e5) / 1e5,
      lng: Math.round(Number(r.lon) * 1e5) / 1e5,
      fonte: 'nominatim',
    };
  });
}
