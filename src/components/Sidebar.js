'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/calendar', label: 'Calendário', icon: '🗓️' },
  { href: '/planning', label: 'Pré-cadastro', icon: '🧾' },
  { href: '/transactions', label: 'Transações', icon: '💸' },
  { href: '/investments', label: 'Investimentos', icon: '📈' },
  { href: '/goals', label: 'Metas', icon: '🎯' },
  { href: '/accounts', label: 'Contas', icon: '🏦' },
  { href: '/onboarding', label: 'Refazer cadastro', icon: '🧭' },
];

export default function Sidebar({ userName = '' }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <>
      <button className="mobile-toggle" onClick={() => setOpen(!open)} aria-label="Menu">
        {open ? '✕' : '☰'}
      </button>

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">FinControl</div>
          <div className="sidebar-subtitle">
            {userName ? `Olá, ${userName}` : 'Controle Financeiro'}
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-link" onClick={handleLogout} style={{ color: 'var(--expense)' }}>
            <span className="nav-icon">🚪</span>
            Sair
          </button>
        </div>
      </aside>

      {open && <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 99
      }} onClick={() => setOpen(false)} />}
    </>
  );
}
