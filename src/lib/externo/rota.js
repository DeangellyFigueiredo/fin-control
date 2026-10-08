import prisma from '../prisma.js';
import { buscarJson } from './http.js';
import { comCache, DIA_MS } from './cache.js';
import { chaveDaRota } from '../estrada.js';

/**
 * Rota de carro pelas ruas, pelo OSRM (sem chave; servidor de demonstração,
 * uso não comercial, 1 pedido por segundo, sem garantia). Ver
 * docs/rfc/0004-roteiro-inteligente.md.
 *
 * A chave do cache é o par de coordenadas: mudar a parada muda a chave, então
 * o cache pode durar muito. "Atualizar" força um pedido novo, no máximo um
 * por trecho a cada 10 minutos.
 */

const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const DEZ_MIN = 10 * 60 * 1000;

export async function rotaEntre(de, para, { atualizar = false } = {}) {
  const chave = chaveDaRota(de, para);

  if (atualizar) {
    const guardado = await prisma.externalCache.findUnique({ where: { key: chave }, select: { fetchedAt: true } });
    if (!guardado || Date.now() - guardado.fetchedAt.getTime() > DEZ_MIN) {
      await prisma.externalCache.deleteMany({ where: { key: chave } });
    }
  }

  return comCache(chave, 180 * DIA_MS, async () => {
    const coords = `${de.lng},${de.lat};${para.lng},${para.lat}`;
    const j = await buscarJson(`${OSRM}/route/v1/driving/${coords}?overview=simplified&geometries=polyline`, { timeoutMs: 10000 });
    const r = j?.code === 'Ok' ? j.routes?.[0] : null;
    if (!r) return { encontrada: false };
    return {
      encontrada: true,
      km: Math.round(r.distance / 100) / 10,
      minutos: Math.round(r.duration / 60),
      polyline: r.geometry,
      calculadaEm: new Date().toISOString(),
    };
  });
}
