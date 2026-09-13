/**
 * Lado servidor da categorização: lê as regras, aplica e aprende.
 *
 * Vive separado de `categorize.js` porque aquele arquivo é puro e roda
 * também no navegador; este toca o banco.
 */

import { findCategory, indexByName, extractPattern, normalize } from './categorize.js';

/**
 * Carrega uma vez o que é preciso para categorizar um lote inteiro.
 * Importar 200 linhas não pode virar 400 consultas.
 */
export async function carregarRegras(db) {
  const [rules, categories] = await Promise.all([
    db.categoryRule.findMany({ select: { id: true, pattern: true, categoryId: true, hits: true } }),
    db.category.findMany({ select: { id: true, name: true, type: true } }),
  ]);

  return { rules, categories, porNome: indexByName(categories) };
}

/**
 * Categoria sugerida para uma descrição, respeitando o tipo do lançamento:
 * uma regra de despesa não pode marcar uma entrada.
 */
export function sugerir(contexto, description, type) {
  const achado = findCategory(description, contexto.rules, contexto.porNome);
  if (!achado) return null;

  const categoria = contexto.categories.find(c => c.id === achado.categoryId);
  if (!categoria) return null;
  if (type && categoria.type !== type) return null;

  return { ...achado, categoria };
}

/** Conta o acerto da regra que pegou — é o desempate entre regras futuras. */
export async function marcarAcerto(db, ruleId) {
  if (!ruleId) return;
  try {
    await db.categoryRule.update({ where: { id: ruleId }, data: { hits: { increment: 1 } } });
  } catch {
    // Contador é estatística, não verdade: se a regra sumiu no meio do
    // caminho, não é motivo para derrubar o lançamento do usuário.
  }
}

/**
 * Aprende com a correção do usuário.
 *
 * Só cria regra quando há o que aprender: descrição com um trecho próprio
 * (não só "PIX ENVIADO") e que ainda não caía sozinha na mesma categoria.
 * Devolve a regra criada, ou null quando decidiu não aprender.
 */
export async function aprender(db, description, categoryId, contexto) {
  if (!categoryId) return null;

  const pattern = extractPattern(description);
  if (!pattern) return null;

  // Já acerta sem regra nova? Então não precisa de regra nova.
  const atual = contexto && findCategory(description, contexto.rules, contexto.porNome);
  if (atual?.categoryId === categoryId) return null;

  // findFirst + create/update em vez de upsert: o cliente escopado injeta o
  // dono no `where` como campo solto, e a chave composta userId_pattern
  // esperaria o userId dentro dela. Assim a regra vale para os dois.
  try {
    const existente = await db.categoryRule.findFirst({ where: { pattern }, select: { id: true } });

    return existente
      ? await db.categoryRule.update({ where: { id: existente.id }, data: { categoryId } })
      : await db.categoryRule.create({ data: { pattern, categoryId } });
  } catch {
    // Aprender é um bônus. Falhar aqui não pode derrubar o lançamento que o
    // usuário acabou de salvar.
    return null;
  }
}

export { normalize };
