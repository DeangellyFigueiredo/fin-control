'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { DEFAULT_SETTINGS, normalizeSettings } from '@/lib/settings';

export const THEME_KEY = 'fincontrol:theme';
export const HIDE_KEY = 'fincontrol:hide-values';

const ThemeContext = createContext(null);

/**
 * Paletas dos gráficos. O Chart.js desenha em canvas e não enxerga as
 * variáveis CSS, então as cores precisam vir do React para o gráfico
 * repintar junto com o tema.
 */
const CHART_THEMES = {
  dark: {
    text: '#8888a8',
    muted: '#6b6b85',
    grid: 'rgba(42, 42, 68, 0.5)',
    surface: '#1a1a2e',
    tooltipBg: '#12121e',
    tooltipText: '#f0f0f8',
    tooltipBorder: '#2a2a44',
    income: '#00cec9',
    incomeFill: 'rgba(0, 206, 201, 0.7)',
    expense: '#ff6b6b',
    expenseFill: 'rgba(255, 107, 107, 0.7)',
    investment: '#a29bfe',
    investmentFill: 'rgba(162, 155, 254, 0.7)',
    accent: '#6c5ce7',
    accentLight: '#a29bfe',
    accentFill: 'rgba(108, 92, 231, 0.12)',
    zeroLine: 'rgba(255, 107, 107, 0.5)',
  },
  light: {
    text: '#55556e',
    muted: '#83839a',
    grid: 'rgba(21, 21, 31, 0.10)',
    surface: '#ffffff',
    tooltipBg: '#15151f',
    tooltipText: '#ffffff',
    tooltipBorder: '#2f2f45',
    income: '#0f8a86',
    incomeFill: 'rgba(15, 138, 134, 0.75)',
    expense: '#d1454b',
    expenseFill: 'rgba(209, 69, 75, 0.75)',
    investment: '#6247d4',
    investmentFill: 'rgba(98, 71, 212, 0.75)',
    accent: '#5b4bd6',
    accentLight: '#6247d4',
    accentFill: 'rgba(91, 75, 214, 0.12)',
    zeroLine: 'rgba(209, 69, 75, 0.55)',
  },
};

export function ThemeProvider({ children }) {
  // Começa igual ao que o script no <head> já estampou, para o primeiro
  // render do React bater com o que está na tela.
  const [theme, setThemeState] = useState('dark');
  const [hideValues, setHideValuesState] = useState(false);
  // Preferências de leitura vêm da conta, não do navegador: seguem a pessoa
  // entre o celular e o computador.
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    const root = document.documentElement;
    setThemeState(root.dataset.theme === 'light' ? 'light' : 'dark');
    setHideValuesState(root.dataset.hideValues === 'true');

    let vivo = true;
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d) setSettingsState(normalizeSettings(d)); })
      .catch(() => { /* sem sessão ou offline: seguem os padrões */ });
    return () => { vivo = false; };
  }, []);

  const saveSettings = useCallback(async (next) => {
    const limpo = normalizeSettings(next);
    setSettingsState(limpo); // aplica na hora; o servidor confirma depois
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(limpo),
      });
    } catch {
      /* a preferência já está valendo na tela; volta ao servidor no próximo load */
    }
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* modo privado */ }
  }, []);

  const setHideValues = useCallback((next) => {
    setHideValuesState(next);
    document.documentElement.dataset.hideValues = String(next);
    try { localStorage.setItem(HIDE_KEY, String(next)); } catch { /* modo privado */ }
  }, []);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    hideValues,
    setHideValues,
    toggleHideValues: () => setHideValues(!hideValues),
    chart: CHART_THEMES[theme] || CHART_THEMES.dark,
    settings,
    saveSettings,
  }), [theme, setTheme, hideValues, setHideValues, settings, saveSettings]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa estar dentro de ThemeProvider');
  return ctx;
}
