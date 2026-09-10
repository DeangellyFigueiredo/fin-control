/**
 * Manifest do PWA. Como arquivo de convenção do App Router, o Next serve
 * isto em /manifest.webmanifest e injeta o <link rel="manifest"> sozinho.
 */
export default function manifest() {
  return {
    name: 'FinControl — Controle Financeiro',
    short_name: 'FinControl',
    description: 'Calendário financeiro dia a dia, com entradas, saídas, cartões e metas.',
    lang: 'pt-BR',
    start_url: '/',
    // standalone tira a barra do navegador: abre como aplicativo
    display: 'standalone',
    orientation: 'portrait',
    // Igual ao --bg-primary do tema escuro. É a cor da tela de abertura,
    // pintada antes do app carregar, então não dá para variar por tema.
    background_color: '#0a0a12',
    theme_color: '#0a0a12',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O Android recorta em círculo ou squircle: estes têm o fundo
      // sangrando até a borda e a arte na zona segura central.
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Calendário', short_name: 'Calendário', url: '/calendar' },
      { name: 'Transações', short_name: 'Transações', url: '/transactions' },
    ],
  };
}
