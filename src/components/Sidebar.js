'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import Icon from '@/components/Icon';
import WalletSwitcher from '@/components/WalletSwitcher';
import { limparDadosDoUsuario } from '@/lib/clientState';

const navItems = [
  { href: '/', label: 'Dashboard', icon: 'dashboard' },
  { href: '/calendar', label: 'Calendário', icon: 'calendario' },
  { href: '/planning', label: 'Pré-cadastro', icon: 'preCadastro' },
  { href: '/transactions', label: 'Transações', icon: 'transacoes' },
  { href: '/import', label: 'Importar extrato', icon: 'importar' },
  { href: '/installments', label: 'Parcelamentos', icon: 'parcelas' },
  { href: '/investments', label: 'Investimentos', icon: 'investimentos' },
  { href: '/debts', label: 'Dívidas e empréstimos', icon: 'dividas' },
  { href: '/goals', label: 'Metas', icon: 'metas' },
  { href: '/trips', label: 'Viagens', icon: 'viagem' },
  { href: '/accounts', label: 'Contas', icon: 'contas' },
  { href: '/onboarding', label: 'Refazer cadastro', icon: 'onboarding' },
  { href: '/wallets', label: 'Carteiras', icon: 'carteiras' },
  { href: '/settings', label: 'Configurações', icon: 'configuracoes' },
];

export default function Sidebar({ userName = '', wallets = [], activeWalletId = null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme, hideValues, toggleHideValues } = useTheme();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });

    // O rascunho pode ter salário, saldo e nome de contas. Sair de um
    // computador compartilhado não pode deixar isso para trás. Tema e
    // "esconder valores" ficam: são do aparelho, não da conta.
    limparDadosDoUsuario();

    window.location.href = '/login';
  };

  return (
    <>
      <button className="mobile-toggle" onClick={() => setOpen(!open)} aria-label="Menu">
        <Icon name={open ? 'fechar' : 'menu'} size={20} />
      </button>

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div>
              <div className="sidebar-logo">FinControl</div>
              <div className="sidebar-subtitle">
                {userName ? `Olá, ${userName}` : 'Controle Financeiro'}
              </div>
            </div>

            <div className="sidebar-actions">
              <button
                type="button"
                className="btn-icon"
                onClick={toggleHideValues}
                aria-pressed={hideValues}
                aria-label={hideValues ? 'Mostrar valores' : 'Esconder valores'}
                title={hideValues ? 'Mostrar valores' : 'Esconder valores'}
              >
                <Icon name={hideValues ? 'esconder' : 'mostrar'} size={16} />
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              >
                <Icon name={theme === 'dark' ? 'temaClaro' : 'temaEscuro'} size={16} />
              </button>
            </div>
          </div>

          <WalletSwitcher wallets={wallets} activeId={activeWalletId} />
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-link" onClick={handleLogout} style={{ color: 'var(--expense)' }}>
            <span className="nav-icon"><Icon name="sair" size={18} /></span>
            Sair
          </button>
        </div>
      </aside>

      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
    </>
  );
}
