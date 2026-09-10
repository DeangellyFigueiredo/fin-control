/**
 * Paleta categórica dos gráficos, passo escuro, validada contra o fundo dos
 * cards (#1a1a2e) com scripts/validate_palette.js:
 *   faixa de luminosidade, croma, separação para daltonismo e contraste.
 *
 * Só os TRÊS primeiros slots passam no teste de "todos os pares", que é o
 * caso de um donut, onde qualquer fatia pode encostar em qualquer outra.
 * Por isso o gráfico de investimentos rotula cada fatia diretamente: a cor é
 * pista secundária, nunca a única forma de identificar a fatia.
 *
 * Ordem fixa, nunca cíclica.
 */
export const CHART_PALETTE = [
  '#3987e5', // azul
  '#d95926', // laranja
  '#199e70', // verde-água
  '#c98500', // amarelo
  '#d55181', // magenta
  '#008300', // verde
  '#9085e9', // violeta
  '#e66767', // vermelho
];

/**
 * Mesmos oito matizes, no passo validado para fundo claro. A posição é
 * pareada com CHART_PALETTE: o índice de uma é o índice da outra.
 */
export const CHART_PALETTE_LIGHT = [
  '#2a78d6', // azul
  '#eb6834', // laranja
  '#1baf7a', // verde-água
  '#eda100', // amarelo
  '#e87ba4', // magenta
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // vermelho
];

/** Primeira cor da paleta ainda não usada; cinza neutro se todas estiverem. */
export function nextChartColor(usedColors = []) {
  const used = new Set(usedColors.map(c => (c || '').toLowerCase()));
  return CHART_PALETTE.find(c => !used.has(c.toLowerCase())) || '#8a8aa3';
}


/**
 * Categorias padrão. Não existe tela para cadastrá-las, então tanto o seed
 * quanto o passo a passo inicial garantem que elas existam.
 */
export const INCOME_CATEGORIES = [
  { name: 'Salário', type: 'INCOME', color: '#00cec9', icon: '💰' },
  { name: 'Pro-labore', type: 'INCOME', color: '#00b894', icon: '💼' },
  { name: 'Freelance', type: 'INCOME', color: '#0984e3', icon: '💻' },
  { name: 'Lucros', type: 'INCOME', color: '#6c5ce7', icon: '📈' },
  { name: 'Rendimentos', type: 'INCOME', color: '#a29bfe', icon: '🏦' },
  { name: 'Outras Entradas', type: 'INCOME', color: '#55efc4', icon: '➕' },
];

export const EXPENSE_CATEGORIES = [
  { name: 'Moradia', type: 'EXPENSE', color: '#ff6b6b', icon: '🏠' },
  { name: 'Alimentação', type: 'EXPENSE', color: '#ff9ff3', icon: '🍔' },
  { name: 'Transporte', type: 'EXPENSE', color: '#feca57', icon: '🚗' },
  { name: 'Saúde', type: 'EXPENSE', color: '#ff6348', icon: '🏥' },
  { name: 'Educação', type: 'EXPENSE', color: '#48dbfb', icon: '📚' },
  { name: 'Lazer', type: 'EXPENSE', color: '#ff9f43', icon: '🎮' },
  { name: 'Fatura Cartão', type: 'EXPENSE', color: '#ee5a24', icon: '💳' },
  { name: 'Conta de Luz', type: 'EXPENSE', color: '#f9ca24', icon: '💡' },
  { name: 'Conta de Água', type: 'EXPENSE', color: '#3dc1d3', icon: '💧' },
  { name: 'Internet/Telefone', type: 'EXPENSE', color: '#6ab04c', icon: '📱' },
  { name: 'Assinaturas', type: 'EXPENSE', color: '#e056fd', icon: '📺' },
  { name: 'Parcelas', type: 'EXPENSE', color: '#c44569', icon: '📋' },
  { name: 'Plano de Saúde', type: 'EXPENSE', color: '#cf6a87', icon: '🩺' },
  { name: 'Seguros', type: 'EXPENSE', color: '#574b90', icon: '🛡️' },
  { name: 'Outras Saídas', type: 'EXPENSE', color: '#786fa6', icon: '➖' },
];

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

/** Como a pessoa descreve a própria situação, no passo 2 do onboarding. */
export const FINANCIAL_STATUS = [
  { id: 'TRANQUILO', label: 'Tranquilo', icon: '😌', hint: 'Sobra dinheiro todo mês e tenho reserva' },
  { id: 'ESTAVEL', label: 'Estável', icon: '🙂', hint: 'Fecho o mês no azul, mas sem muita folga' },
  { id: 'APERTADO', label: 'Apertado', icon: '😬', hint: 'O mês fecha no limite ou no vermelho' },
  { id: 'ENDIVIDADO', label: 'Endividado', icon: '😣', hint: 'Tenho dívidas que preciso organizar' },
];

/** Sugestões clicáveis para acelerar o cadastro. */
export const GOAL_SUGGESTIONS = [
  { name: 'Reserva de emergência', type: 'RESERVA_EMERGENCIA', icon: '🛡️' },
  { name: 'Quitar dívidas', type: 'OUTRO', icon: '🧾' },
  { name: 'Viagem', type: 'OUTRO', icon: '✈️' },
  { name: 'Trocar de carro', type: 'OUTRO', icon: '🚗' },
  { name: 'Casa própria', type: 'PATRIMONIO', icon: '🏡' },
  { name: 'Aposentadoria', type: 'PATRIMONIO', icon: '🌴' },
];

export const FIXED_EXPENSE_SUGGESTIONS = [
  { name: 'Aluguel', icon: '🏠', category: 'Moradia' },
  { name: 'Condomínio', icon: '🏢', category: 'Moradia' },
  { name: 'Luz', icon: '💡', category: 'Conta de Luz' },
  { name: 'Água', icon: '💧', category: 'Conta de Água' },
  { name: 'Internet', icon: '📶', category: 'Internet/Telefone' },
  { name: 'Celular', icon: '📱', category: 'Internet/Telefone' },
  { name: 'Streaming', icon: '📺', category: 'Assinaturas' },
  { name: 'Academia', icon: '🏋️', category: 'Lazer' },
  { name: 'Plano de saúde', icon: '🩺', category: 'Plano de Saúde' },
  { name: 'Escola', icon: '🎓', category: 'Educação' },
];

export const INCOME_SUGGESTIONS = [
  { name: 'Salário', icon: '💰', category: 'Salário' },
  { name: 'Pro-labore', icon: '💼', category: 'Pro-labore' },
  { name: 'Freelance', icon: '💻', category: 'Freelance' },
  { name: 'Aluguel recebido', icon: '🏠', category: 'Outras Entradas' },
];
