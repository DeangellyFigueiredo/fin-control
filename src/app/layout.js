import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata = {
  title: 'FinControl - Controle Financeiro',
  description: 'Sistema de controle financeiro pessoal com dashboard, transações, investimentos e metas.',
  appleWebApp: {
    capable: true,
    title: 'FinControl',
    statusBarStyle: 'black-translucent',
    // O iPhone ignora o manifest para o ícone da tela inicial
    startupImage: [],
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Acompanha o tema em vez de fixar o escuro
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a12' },
    { media: '(prefers-color-scheme: light)', color: '#f4f5fa' },
  ],
  viewportFit: 'cover',
};

/*
 * Roda antes da primeira pintura: sem isso a página nasce escura e pisca
 * para o claro quando o React monta. Também resolve "sistema" aqui, para o
 * CSS precisar de um seletor só em vez de duplicar a paleta numa media query.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var salvo = localStorage.getItem('fincontrol:theme');
    var claro = window.matchMedia('(prefers-color-scheme: light)').matches;
    var tema = salvo === 'light' || salvo === 'dark' ? salvo : (claro ? 'light' : 'dark');
    document.documentElement.dataset.theme = tema;
    document.documentElement.dataset.hideValues =
      localStorage.getItem('fincontrol:hide-values') === 'true' ? 'true' : 'false';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
