/**
 * Categorização automática por regra.
 *
 * Nada de adivinhação estatística: uma regra liga um pedaço de descrição a
 * uma categoria, e dá para ver e apagar cada uma delas. Se um lançamento caiu
 * em Transporte, existe uma linha explicando por quê.
 *
 * As regras nascem sozinhas: quando você corrige a categoria de um
 * lançamento, o app guarda o padrão e acerta na próxima.
 */

/**
 * Maiúsculas, sem acento, sem pontuação e sem número.
 *
 * As descrições de fatura vêm como "PAG*IFOOD  *4829" ou "Uber   *Trip" —
 * o que importa é o miolo alfabético.
 */
export function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Palavras que aparecem em toda fatura e não dizem nada sobre o gasto.
 * Sem isso, a primeira regra aprendida seria "PAG → alguma coisa" e passaria
 * a marcar metade dos lançamentos.
 */
const RUIDO = new Set([
  'PAG', 'PAGTO', 'PAGAMENTO', 'COMPRA', 'CARTAO', 'CARD', 'DEBITO', 'CREDITO',
  'PIX', 'TED', 'DOC', 'TRANSF', 'TRANSFERENCIA', 'ENVIADO', 'RECEBIDO',
  'PARC', 'PARCELA', 'MENSALIDADE', 'FATURA', 'BOLETO', 'SAQUE', 'TARIFA',
  'LTDA', 'ME', 'SA', 'EIRELI', 'BR', 'BRA', 'BRASIL', 'COM', 'WWW',
  'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM', 'NO', 'NA', 'PARA', 'POR', 'COM',
]);

/**
 * O pedaço da descrição que vale virar regra.
 *
 * Pega o trecho alfabético mais longo que não seja ruído — é quase sempre o
 * nome do estabelecimento. Devolve null quando sobra só ruído, e aí o app
 * prefere não aprender nada a aprender errado.
 */
export function extractPattern(description) {
  const tokens = normalize(description)
    .split(' ')
    .filter(t => t.length >= 3 && !/^\d+$/.test(t) && !RUIDO.has(t));

  if (!tokens.length) return null;

  return tokens.reduce((best, t) => (t.length > best.length ? t : best), '');
}

/**
 * Lojas que praticamente todo mundo tem na fatura, ligadas ao NOME da
 * categoria padrão. Serve de chute inicial enquanto o usuário não tem regra
 * própria; a regra dele sempre ganha.
 */
export const REGRAS_PADRAO = [
  // Transporte
  ['UBER', 'Transporte'], ['99APP', 'Transporte'], ['CABIFY', 'Transporte'],
  ['IPIRANGA', 'Transporte'], ['SHELL', 'Transporte'], ['PETROBRAS', 'Transporte'],
  ['POSTO', 'Transporte'], ['ESTACIONAMENTO', 'Transporte'], ['AUTOPASS', 'Transporte'],
  ['SEMPARAR', 'Transporte'], ['CONECTCAR', 'Transporte'],

  // Alimentação
  ['IFOOD', 'Alimentação'], ['RAPPI', 'Alimentação'], ['UBEREATS', 'Alimentação'],
  ['PADARIA', 'Alimentação'], ['RESTAURANTE', 'Alimentação'], ['LANCHONETE', 'Alimentação'],
  ['MCDONALDS', 'Alimentação'], ['BURGUER', 'Alimentação'], ['SUBWAY', 'Alimentação'],
  ['STARBUCKS', 'Alimentação'],

  // Mercado
  ['CARREFOUR', ['Supermercado', 'Alimentação']], ['EXTRA', ['Supermercado', 'Alimentação']], ['PAODEACUCAR', ['Supermercado', 'Alimentação']],
  ['ASSAI', ['Supermercado', 'Alimentação']], ['ATACADAO', ['Supermercado', 'Alimentação']], ['MERCADO', ['Supermercado', 'Alimentação']],
  ['SUPERMERCADO', ['Supermercado', 'Alimentação']], ['HORTIFRUTI', ['Supermercado', 'Alimentação']],

  // Assinaturas
  ['NETFLIX', 'Assinaturas'], ['SPOTIFY', 'Assinaturas'], ['DISNEY', 'Assinaturas'],
  ['AMAZONPRIME', 'Assinaturas'], ['HBO', 'Assinaturas'], ['MAX', 'Assinaturas'],
  ['YOUTUBE', 'Assinaturas'], ['GOOGLE', 'Assinaturas'], ['APPLE', 'Assinaturas'],
  ['MICROSOFT', 'Assinaturas'], ['ICLOUD', 'Assinaturas'], ['CHATGPT', 'Assinaturas'],
  ['OPENAI', 'Assinaturas'], ['ANTHROPIC', 'Assinaturas'], ['GLOBOPLAY', 'Assinaturas'],
  ['PARAMOUNT', 'Assinaturas'], ['DEEZER', 'Assinaturas'],

  // Saúde
  ['DROGARIA', 'Saúde'], ['DROGASIL', 'Saúde'], ['PACHECO', 'Saúde'],
  ['RAIA', 'Saúde'], ['FARMACIA', 'Saúde'], ['LABORATORIO', 'Saúde'],
  ['UNIMED', 'Plano de Saúde'], ['AMIL', 'Plano de Saúde'], ['BRADESCOSAUDE', 'Plano de Saúde'],

  // Lazer
  ['CINEMARK', 'Lazer'], ['CINEPOLIS', 'Lazer'], ['INGRESSO', 'Lazer'],
  ['SMARTFIT', 'Lazer'], ['ACADEMIA', 'Lazer'], ['STEAM', 'Lazer'],
  ['PLAYSTATION', 'Lazer'], ['NINTENDO', 'Lazer'], ['XBOX', 'Lazer'],

  // Casa e contas
  ['ENEL', 'Conta de Luz'], ['CEMIG', 'Conta de Luz'], ['LIGHT', 'Conta de Luz'],
  ['COPEL', 'Conta de Luz'], ['CELESC', 'Conta de Luz'], ['EQUATORIAL', 'Conta de Luz'],
  ['SABESP', 'Conta de Água'], ['CEDAE', 'Conta de Água'], ['COPASA', 'Conta de Água'],
  ['VIVO', 'Internet/Telefone'], ['CLARO', 'Internet/Telefone'], ['TIM', 'Internet/Telefone'],
  ['OI', 'Internet/Telefone'], ['NET', 'Internet/Telefone'], ['ALGAR', 'Internet/Telefone'],

  // Compras
  ['MERCADOLIVRE', ['Compras', 'Outras Saídas']], ['AMAZON', ['Compras', 'Outras Saídas']], ['SHOPEE', ['Compras', 'Outras Saídas']],
  ['ALIEXPRESS', ['Compras', 'Outras Saídas']], ['MAGAZINE', ['Compras', 'Outras Saídas']], ['AMERICANAS', ['Compras', 'Outras Saídas']],
  ['RENNER', ['Compras', 'Outras Saídas']], ['RIACHUELO', ['Compras', 'Outras Saídas']], ['CENTAURO', ['Compras', 'Outras Saídas']],

  // Educação
  ['UDEMY', 'Educação'], ['ALURA', 'Educação'], ['COURSERA', 'Educação'],
  ['FACULDADE', 'Educação'], ['ESCOLA', 'Educação'], ['COLEGIO', 'Educação'],
];

/**
 * Acha a categoria de uma descrição.
 *
 * Ordem: regra do usuário primeiro (a mais usada ganha o desempate), lista
 * padrão depois. Devolve null quando nenhuma casa — melhor sem categoria do
 * que na categoria errada.
 *
 * @param {string} description
 * @param {Array<{pattern: string, categoryId: string, hits: number}>} rules
 * @param {Map<string, string>} categoryIdByName  nome normalizado → id
 */
export function findCategory(description, rules, categoryIdByName) {
  const texto = normalize(description);
  if (!texto) return null;

  const candidatas = rules
    .filter(r => texto.includes(r.pattern))
    // Padrão mais longo é mais específico: "MERCADOLIVRE" ganha de "MERCADO".
    // Empatou no tamanho, vence a regra que já acertou mais vezes.
    .sort((a, b) => b.pattern.length - a.pattern.length || b.hits - a.hits);

  if (candidatas.length) {
    return { categoryId: candidatas[0].categoryId, rule: candidatas[0], origem: 'regra' };
  }

  // A lista padrão compara sem espaço para pegar "MERCADO LIVRE" e
  // "MERCADOLIVRE" com a mesma entrada.
  const colado = texto.replace(/\s/g, '');
  for (const [pattern, nomes] of REGRAS_PADRAO) {
    if (!colado.includes(pattern)) continue;

    // Uma lista de nomes, na ordem de preferência: "Supermercado" se o
    // usuário tiver criado essa categoria, "Alimentação" (que vem por
    // padrão) se não tiver.
    for (const nome of [].concat(nomes)) {
      const categoryId = categoryIdByName.get(normalize(nome));
      if (categoryId) return { categoryId, rule: null, origem: 'padrao', pattern };
    }
  }

  return null;
}

/** Índice nome normalizado → id, do jeito que findCategory espera. */
export function indexByName(categories) {
  return new Map(categories.map(c => [normalize(c.name), c.id]));
}
