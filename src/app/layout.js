import './globals.css';

export const metadata = {
  title: 'FinControl - Controle Financeiro',
  description: 'Sistema de controle financeiro pessoal com dashboard, transações, investimentos e metas.',
  appleWebApp: {
    capable: true,
    title: 'FinControl',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the phone's browser chrome match the app's dark background.
  themeColor: '#0a0a12',
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
