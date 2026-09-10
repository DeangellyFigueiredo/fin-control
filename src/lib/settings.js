/**
 * Preferências de leitura do calendário.
 *
 * A cor do dia é uma escala DIVERGENTE: dois polos com um neutro no meio.
 * O neutro é a própria superfície do card — cinza no tema claro, quase preto
 * no escuro — e nunca um matiz, senão o "zero" pareceria uma categoria.
 *
 * A intensidade vira alfa sobre essa superfície em vez de uma cor sólida:
 * assim o texto do dia continua legível nos dois temas sem precisar de uma
 * rampa própria para cada um.
 */

/** O que decide a cor de fundo do dia. */
export const COLOR_METRICS = [
  {
    id: 'balance',
    label: 'Saldo acumulado',
    hint: 'Quanto sobra na conta naquele dia, somando os anteriores',
  },
  {
    id: 'net',
    label: 'Resultado do dia',
    hint: 'Só o que entrou menos o que saiu naquele dia',
  },
  {
    id: 'expense',
    label: 'Só as saídas',
    hint: 'Quanto maior a saída, mais forte a cor',
  },
  {
    id: 'income',
    label: 'Só as entradas',
    hint: 'Quanto maior a entrada, mais forte a cor',
  },
  {
    id: 'none',
    label: 'Sem cor de fundo',
    hint: 'Células neutras, só com os números',
  },
];

/**
 * Pares divergentes. Todos combinam um polo quente e um frio: dois tons
 * frios (azul e verde-água, por exemplo) não leem como opostos, e o meio
 * deixaria de parecer "nada".
 */
export const COLOR_SCHEMES = [
  {
    id: 'blue-red',
    label: 'Azul e vermelho',
    hint: 'O par clássico. Sobra puxa para o azul, falta para o vermelho.',
    positive: { dark: '57, 135, 229', light: '42, 120, 214' },
    negative: { dark: '230, 103, 103', light: '227, 73, 72' },
  },
  {
    id: 'teal-orange',
    label: 'Verde-água e laranja',
    hint: 'Mais separado para quem confunde vermelho e verde.',
    positive: { dark: '25, 158, 112', light: '27, 175, 122' },
    negative: { dark: '217, 89, 38', light: '235, 104, 52' },
  },
  {
    id: 'purple-amber',
    label: 'Roxo e âmbar',
    hint: 'Combina com o roxo da interface, com menos peso no vermelho.',
    positive: { dark: '144, 133, 233', light: '74, 58, 167' },
    negative: { dark: '201, 133, 0', light: '237, 161, 0' },
  },
];

/**
 * Quão forte a cor chega no extremo da escala.
 *
 * O teto de 0.66 não é arbitrário: acima disso o par roxo/âmbar sobre o
 * card escuro derruba o texto do dia para 4.47:1, abaixo do mínimo de 4.5.
 * Em 0.66 o pior caso das seis cores, nos dois temas, fica em 4.78:1.
 */
export const INTENSITIES = [
  { id: 'subtle', label: 'Sutil', max: 0.28 },
  { id: 'medium', label: 'Média', max: 0.48 },
  { id: 'strong', label: 'Forte', max: 0.66 },
];

export const DEFAULT_SETTINGS = {
  colorBy: 'balance',
  scheme: 'blue-red',
  intensity: 'medium',
  // Simétrica: os dois lados usam o mesmo teto, então -100 e +100 têm a
  // mesma força. Sem isso, um dia levemente negativo pareceria tão grave
  // quanto o pior dia do mês.
  symmetric: true,
};

const byId = (list, id, fallback) => list.find(x => x.id === id) || list.find(x => x.id === fallback);

/** Mescla o que veio do banco com os padrões, descartando valores inválidos. */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    colorBy: byId(COLOR_METRICS, s.colorBy, DEFAULT_SETTINGS.colorBy).id,
    scheme: byId(COLOR_SCHEMES, s.scheme, DEFAULT_SETTINGS.scheme).id,
    intensity: byId(INTENSITIES, s.intensity, DEFAULT_SETTINGS.intensity).id,
    symmetric: typeof s.symmetric === 'boolean' ? s.symmetric : DEFAULT_SETTINGS.symmetric,
  };
}

/** Valor que decide a cor de um dia, conforme a métrica escolhida. */
export function dayColorValue(day, colorBy, showProjections) {
  const income = day.income + (showProjections ? day.plannedIncome : 0);
  const expense = day.expense + (showProjections ? day.plannedExpense : 0) + day.investment;

  switch (colorBy) {
    case 'balance': return day.balance;
    case 'net': return income - expense;
    case 'expense': return -expense; // saída sempre puxa para o polo negativo
    case 'income': return income;
    default: return 0;
  }
}

/**
 * Escala pronta para uso: recebe o valor do dia e devolve a cor de fundo.
 * `null` significa "deixe a superfície aparecer" — é o neutro.
 */
export function buildColorScale(days, settings, { theme = 'dark', showProjections = true } = {}) {
  const { colorBy, scheme, intensity, symmetric } = normalizeSettings(settings);

  if (colorBy === 'none') {
    return { enabled: false, colorFor: () => null, domain: { min: 0, max: 0 } };
  }

  const pair = byId(COLOR_SCHEMES, scheme, 'blue-red');
  const maxAlpha = byId(INTENSITIES, intensity, 'medium').max;
  const arm = theme === 'light' ? 'light' : 'dark';

  const values = days.map(d => dayColorValue(d, colorBy, showProjections));
  const positives = values.filter(v => v > 0);
  const negatives = values.filter(v => v < 0);

  let topPos = positives.length ? Math.max(...positives) : 0;
  let topNeg = negatives.length ? Math.abs(Math.min(...negatives)) : 0;

  if (symmetric) {
    const shared = Math.max(topPos, topNeg);
    topPos = shared;
    topNeg = shared;
  }

  const colorFor = (day) => {
    const v = dayColorValue(day, colorBy, showProjections);
    if (!v) return null;

    const top = v > 0 ? topPos : topNeg;
    if (!top) return null;

    // Raiz quadrada: sem ela os poucos dias grandes dominam e todo o resto
    // fica indistinguível do neutro.
    const ratio = Math.min(Math.abs(v) / top, 1);
    const alpha = (0.12 + Math.sqrt(ratio) * (maxAlpha - 0.12)).toFixed(3);
    const rgb = v > 0 ? pair.positive[arm] : pair.negative[arm];

    return `rgba(${rgb}, ${alpha})`;
  };

  return {
    enabled: true,
    colorFor,
    scheme: pair,
    arm,
    domain: { min: -topNeg, max: topPos },
  };
}
