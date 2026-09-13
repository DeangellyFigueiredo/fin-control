'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';

/**
 * Barra fixa no rodapé, só no celular. Cobre os quatro destinos usados no
 * dia a dia; o menu lateral continua existindo para o resto (metas,
 * investimentos, configurações).
 *
 * O botão de lançar fica no meio, destacado, porque é a ação mais
 * frequente — antes exigia navegar até o dia no calendário.
 */
const ITEMS = [
  { href: '/', label: 'Início', icon: 'dashboard' },
  { href: '/calendar', label: 'Calendário', icon: 'calendario' },
  { href: '/transactions', label: 'Extrato', icon: 'transacoes' },
  { href: '/settings', label: 'Ajustes', icon: 'configuracoes' },
];

export default function MobileNav({ onQuickAdd }) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {ITEMS.slice(0, 2).map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
        >
          <span className="bottom-nav-icon"><Icon name={item.icon} size={20} /></span>
          <span className="bottom-nav-label">{item.label}</span>
        </Link>
      ))}

      <button
        type="button"
        className="bottom-nav-add"
        onClick={onQuickAdd}
        aria-label="Adicionar lançamento"
      >
        <Icon name="adicionar" size={24} />
      </button>

      {ITEMS.slice(2).map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
        >
          <span className="bottom-nav-icon"><Icon name={item.icon} size={20} /></span>
          <span className="bottom-nav-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
