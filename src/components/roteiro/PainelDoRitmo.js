'use client';

import {
  Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTheme } from '@/components/ThemeProvider';
import Icon from '@/components/Icon';
import { formatBRL } from '@/lib/utils';
import { useMenosMovimento, useNumeroAnimado } from './movimento';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Filler);

function Frase({ dinheiro, limiteDia, diasAteIda }) {
  const valor = useNumeroAnimado(dinheiro.diferenca);
  switch (dinheiro.estado) {
    case 'antes':
      return <>Meta de <strong>{formatBRL(limiteDia)}</strong> por dia{diasAteIda > 0 && <>, começa em {diasAteIda} {diasAteIda === 1 ? 'dia' : 'dias'}</>}</>;
    case 'no-ritmo':
      return <><strong className="positive">No ritmo</strong> do planejado</>;
    case 'acima':
      return <><strong className="negative">{formatBRL(valor)}</strong> acima do planejado até hoje</>;
    default:
      return <>Sobrando <strong className="positive">{formatBRL(valor)}</strong> até hoje</>;
  }
}

function Barra({ valor, total }) {
  return (
    <div className="roteiro-ritmo-barra" aria-hidden="true">
      <div style={{ transform: `scaleX(${total ? Math.min(valor / total, 1) : 0})` }} />
    </div>
  );
}

/**
 * O ritmo da viagem: o dinheiro acumulado contra a meta fixa por dia, e o
 * roteiro (atividades e km) contra o plano. O número do dia continua sendo
 * o "ainda pode gastar hoje" do resumo; aqui é a tendência.
 */
export default function PainelDoRitmo({ ritmo: r, dias, diasAteIda }) {
  const { chart } = useTheme();
  const menos = useMenosMovimento();
  const km = useNumeroAnimado(r.km.rodados);
  const pesados = dias.filter(d => d.pesado).length;
  const acima = r.dinheiro.estado === 'acima';

  return (
    <div className="card roteiro-ritmo">
      <p className="roteiro-ritmo-frase">
        <Frase dinheiro={r.dinheiro} limiteDia={r.limiteDia} diasAteIda={diasAteIda} />
      </p>

      <div className="roteiro-ritmo-grafico">
        <Line
          data={{
            labels: dias.map(d => `D${d.numero}`),
            datasets: [
              {
                label: 'Planejado',
                data: r.serie.map(p => p.planejado),
                borderColor: chart.muted,
                borderDash: [5, 4],
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
              },
              {
                label: 'Gasto',
                data: r.serie.map(p => p.real),
                borderColor: acima ? chart.expense : chart.accentLight,
                backgroundColor: chart.accentFill,
                borderWidth: 2.5,
                pointRadius: 3,
                pointBackgroundColor: acima ? chart.expense : chart.accentLight,
                tension: 0.25,
                fill: true,
                spanGaps: false,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: menos ? false : { duration: 700, easing: 'easeOutQuart' },
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: chart.tooltipBg,
                titleColor: chart.tooltipText,
                bodyColor: chart.tooltipText,
                borderColor: chart.tooltipBorder,
                borderWidth: 1,
                callbacks: { label: (ctx) => (ctx.raw == null ? null : `${ctx.dataset.label}: ${formatBRL(ctx.raw)}`) },
              },
            },
            scales: {
              x: { ticks: { color: chart.muted }, grid: { display: false } },
              y: { ticks: { color: chart.muted, maxTicksLimit: 4, callback: v => formatBRL(v) }, grid: { color: chart.grid } },
            },
          }}
        />
      </div>

      <div className="roteiro-ritmo-numeros">
        <div>
          <span className="roteiro-ritmo-rotulo"><Icon name="concluir" /> Atividades</span>
          <span className="roteiro-ritmo-valor">
            {r.atividades.feitas} <small>de {r.atividades.total}</small>
          </span>
          <Barra valor={r.atividades.feitas} total={r.atividades.total} />
          {r.atividades.ateHoje > r.atividades.feitas && (
            <span className="roteiro-ritmo-nota">{r.atividades.ateHoje - r.atividades.feitas} até hoje sem marcar</span>
          )}
        </div>
        <div>
          <span className="roteiro-ritmo-rotulo"><Icon name="carro" /> Estrada</span>
          <span className="roteiro-ritmo-valor">
            {Math.round(km)} <small>de {Math.round(r.km.total)} km</small>
          </span>
          <Barra valor={r.km.rodados} total={r.km.total} />
          {pesados > 0 && (
            <span className="roteiro-ritmo-nota">{pesados} {pesados === 1 ? 'dia pesado' : 'dias pesados'} no plano</span>
          )}
        </div>
      </div>
    </div>
  );
}
