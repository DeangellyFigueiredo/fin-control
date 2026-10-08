import prisma from '../prisma.js';

/**
 * Cache dos serviços externos na tabela external_cache (RFC 0004).
 *
 * Vencido, busca de novo; se a busca falhar, devolve o valor vencido em vez
 * do erro. Para clima, rota e foto, um dado de ontem vale mais que nada.
 * `buscar` precisa devolver um objeto (a coluna é Json não nulo); "não achei"
 * também é um resultado, e fica em cache para não perguntar de novo.
 */
export async function comCache(chave, ttlMs, buscar) {
  const agora = new Date();
  const guardado = await prisma.externalCache.findUnique({ where: { key: chave } });
  if (guardado && guardado.expiresAt > agora) return guardado.value;

  try {
    const valor = await buscar();
    const expiresAt = new Date(agora.getTime() + ttlMs);
    await prisma.externalCache.upsert({
      where: { key: chave },
      create: { key: chave, value: valor, expiresAt },
      update: { value: valor, fetchedAt: agora, expiresAt },
    });
    return valor;
  } catch (e) {
    if (guardado) return guardado.value;
    throw e;
  }
}

export const DIA_MS = 24 * 60 * 60 * 1000;
