'use client';

import { useState, useEffect, useMemo } from 'react';
import MonthCalendar from '@/components/MonthCalendar';
import { useTheme } from '@/components/ThemeProvider';
import { formatBRL, getMonthName } from '@/lib/utils';
import {
  COLOR_METRICS, COLOR_SCHEMES, INTENSITIES,
  DEFAULT_SETTINGS, buildColorScale,
} from '@/lib/settings';

export default function SettingsPage() {
  const { theme, setTheme, hideValues, setHideValues, settings, saveSettings } = useTheme();
  const [draft, setDraft] = useState(settings);
  const [preview, setPreview] = useState(null);

  // O provider carrega as preferências depois do primeiro render
  useEffect(() => { setDraft(settings); }, [settings]);

  useEffect(() => {
    const now = new Date();
    fetch(`/api/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}&months=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setPreview(d?.months?.[0] || null))
      .catch(() => setPreview(null));
  }, []);

  // Aplica na hora: o calendário da prévia usa o rascunho, o resto do app
  // só muda quando o provider recebe o valor salvo.
  const update = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    saveSettings(next);
  };

  const scale = useMemo(
    () => (preview ? buildColorScale(preview.days, draft, { theme }) : null),
    [preview, draft, theme],
  );

  const activeMetric = COLOR_METRICS.find(m => m.id === draft.colorBy);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">Como o app se apresenta e como o calendário pinta os dias</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-main">
          {/* ---------------- Aparência ---------------- */}
          <div className="card panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Aparência</div>
                <div className="panel-subtitle">Vale só neste navegador</div>
              </div>
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-name">Tema</div>
                <div className="setting-hint">Começa seguindo o do sistema até você escolher</div>
              </div>
              <div className="segmented">
                <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
                  ☀️ Claro
                </button>
                <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
                  🌙 Escuro
                </button>
              </div>
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-name">Esconder os valores</div>
                <div className="setting-hint">
                  Borra o dinheiro na tela. Protege de quem olha por cima do ombro,
                  não de quem inspeciona a página.
                </div>
              </div>
              <div className="segmented">
                <button className={!hideValues ? 'active' : ''} onClick={() => setHideValues(false)}>
                  👁️ Mostrar
                </button>
                <button className={hideValues ? 'active' : ''} onClick={() => setHideValues(true)}>
                  🙈 Esconder
                </button>
              </div>
            </div>
          </div>

          {/* ---------------- Cores do calendário ---------------- */}
          <div className="card panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Cores do calendário</div>
                <div className="panel-subtitle">Segue a sua conta, em qualquer aparelho</div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => update(DEFAULT_SETTINGS)}
              >
                Restaurar padrão
              </button>
            </div>

            <div className="setting-block">
              <div className="setting-name">O que decide a cor do dia</div>
              <div className="setting-options">
                {COLOR_METRICS.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className={`setting-option ${draft.colorBy === m.id ? 'active' : ''}`}
                    onClick={() => update({ colorBy: m.id })}
                  >
                    <span className="setting-option-label">{m.label}</span>
                    <span className="setting-option-hint">{m.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {draft.colorBy !== 'none' && (
              <>
                <div className="setting-block">
                  <div className="setting-name">Par de cores</div>
                  <div className="setting-hint" style={{ marginBottom: 10 }}>
                    Sobra puxa para um lado, falta para o outro. O meio fica neutro,
                    sem cor — é assim que o zero se distingue dos dois extremos.
                  </div>
                  <div className="setting-options">
                    {COLOR_SCHEMES.map(sc => {
                      const arm = theme === 'light' ? 'light' : 'dark';
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          className={`setting-option ${draft.scheme === sc.id ? 'active' : ''}`}
                          onClick={() => update({ scheme: sc.id })}
                        >
                          <span className="scheme-strip">
                            <i style={{ background: `rgba(${sc.negative[arm]}, 0.62)` }} />
                            <i style={{ background: `rgba(${sc.negative[arm]}, 0.28)` }} />
                            <i className="scheme-neutral" />
                            <i style={{ background: `rgba(${sc.positive[arm]}, 0.28)` }} />
                            <i style={{ background: `rgba(${sc.positive[arm]}, 0.62)` }} />
                          </span>
                          <span className="setting-option-label">{sc.label}</span>
                          <span className="setting-option-hint">{sc.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="setting-row">
                  <div>
                    <div className="setting-name">Intensidade</div>
                    <div className="setting-hint">Quão forte a cor chega no extremo</div>
                  </div>
                  <div className="segmented">
                    {INTENSITIES.map(i => (
                      <button
                        key={i.id}
                        className={draft.intensity === i.id ? 'active' : ''}
                        onClick={() => update({ intensity: i.id })}
                      >
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="setting-row">
                  <div>
                    <div className="setting-name">Escala simétrica</div>
                    <div className="setting-hint">
                      Os dois lados usam o mesmo teto. Desligando, cada lado se
                      ajusta ao próprio extremo — e um dia pouco negativo pode
                      parecer tão grave quanto o pior do mês.
                    </div>
                  </div>
                  <div className="segmented">
                    <button className={draft.symmetric ? 'active' : ''} onClick={() => update({ symmetric: true })}>
                      Simétrica
                    </button>
                    <button className={!draft.symmetric ? 'active' : ''} onClick={() => update({ symmetric: false })}>
                      Por lado
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ---------------- Prévia ---------------- */}
        <div className="card panel settings-preview">
          <div className="panel-header">
            <div>
              <div className="panel-title">Prévia</div>
              <div className="panel-subtitle">
                {preview
                  ? `${getMonthName(preview.month).toLowerCase()} ${preview.year}, com seus dados`
                  : 'Carregando…'}
              </div>
            </div>
          </div>

          {preview ? (
            <>
              <MonthCalendar
                month={preview}
                metric="both"
                size="sm"
                showHeader={false}
                colorSettings={draft}
              />

              {scale?.enabled && (
                <div className="scale-legend">
                  <span className="scale-end negative">
                    {formatBRL(scale.domain.min)}
                  </span>
                  <span className="scale-bar">
                    {Array.from({ length: 9 }, (_, i) => {
                      const t = (i - 4) / 4; // -1 .. +1
                      const arm = theme === 'light' ? 'light' : 'dark';
                      const rgb = t >= 0 ? scale.scheme.positive[arm] : scale.scheme.negative[arm];
                      const alpha = Math.abs(t) === 0 ? 0 : 0.12 + Math.sqrt(Math.abs(t)) * 0.5;
                      return <i key={i} style={{ background: `rgba(${rgb}, ${alpha})` }} />;
                    })}
                  </span>
                  <span className="scale-end positive">
                    {formatBRL(scale.domain.max)}
                  </span>
                </div>
              )}

              <p className="setting-hint" style={{ marginTop: 14 }}>
                {draft.colorBy === 'none'
                  ? 'As células ficam neutras, só com os números.'
                  : `Cada dia é pintado por: ${activeMetric.label.toLowerCase()}.`}
              </p>
            </>
          ) : (
            <div className="skeleton" style={{ height: 300 }} />
          )}
        </div>
      </div>
    </div>
  );
}
