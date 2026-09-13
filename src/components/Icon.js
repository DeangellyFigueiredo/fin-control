'use client';

import {
  CalendarClock, Upload, Lightbulb, Wallet2, Repeat, ShoppingBag,
  ChevronDown, ChevronUp, Building2,
  LayoutDashboard, CalendarDays, ClipboardList, ArrowLeftRight, TrendingUp,
  Target, Wallet, Handshake, Compass, Settings, LogOut, Menu, X,
  Plus, Pencil, Trash2, Check, Undo2, Eye, EyeOff, Sun, Moon,
  ChevronLeft, ChevronRight, CreditCard, PiggyBank, Banknote,
  ArrowDownRight, ArrowUpRight, Receipt, LineChart, BarChart3,
  Lock, FileText, Tag, HelpCircle, Landmark, ShieldCheck, CircleAlert,
} from 'lucide-react';

/**
 * Todos os ícones da interface num mapa só.
 *
 * Centralizar tem duas razões: o nome usado nas telas descreve a FUNÇÃO
 * ("remover") e não o desenho ("lata de lixo"), então trocar o desenho
 * depois é mexer num arquivo; e o import nomeado deixa o bundler incluir
 * apenas o que está aqui, em vez da biblioteca inteira.
 */
const ICONES = {
  // navegação
  dashboard: LayoutDashboard,
  calendario: CalendarDays,
  preCadastro: ClipboardList,
  transacoes: ArrowLeftRight,
  investimentos: TrendingUp,
  metas: Target,
  contas: Wallet,
  dividas: Handshake,
  onboarding: Compass,
  configuracoes: Settings,
  sair: LogOut,

  // ações
  menu: Menu,
  fechar: X,
  adicionar: Plus,
  editar: Pencil,
  remover: Trash2,
  concluir: Check,
  reabrir: Undo2,
  anterior: ChevronLeft,
  proximo: ChevronRight,

  // preferências
  mostrar: Eye,
  esconder: EyeOff,
  temaClaro: Sun,
  temaEscuro: Moon,

  // domínio
  cartao: CreditCard,
  guardado: PiggyBank,
  dinheiro: Banknote,
  entrada: ArrowUpRight,
  saida: ArrowDownRight,
  fatura: Receipt,
  banco: Landmark,
  grafico: BarChart3,
  curva: LineChart,
  categoria: Tag,
  nota: FileText,
  reserva: ShieldCheck,
  senha: Lock,
  desconhecido: HelpCircle,
  atencao: CircleAlert,
  parcelas: CalendarClock,
  importar: Upload,
  dica: Lightbulb,
  balde: Wallet2,
  recorrente: Repeat,
  variavel: ShoppingBag,
  expandir: ChevronDown,
  recolher: ChevronUp,
  carteiras: Building2,
};

/**
 * `size` acompanha a tipografia por padrão (1em), então o ícone cresce
 * junto com o texto ao lado em vez de precisar de ajuste caso a caso.
 */
export default function Icon({ name, size, className = '', ...rest }) {
  const Desenho = ICONES[name];

  if (!Desenho) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Ícone desconhecido: ${name}`);
    }
    return null;
  }

  return (
    <Desenho
      size={size || '1em'}
      strokeWidth={1.75}
      className={`icon ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}

export const NOMES_DE_ICONE = Object.keys(ICONES);
