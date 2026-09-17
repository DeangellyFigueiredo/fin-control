'use client';

import { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import MoneyInput from '@/components/MoneyInput';
import { formatBRL } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import { paraNumero } from '@/lib/money';
import { totaisDaCarteira } from '@/lib/investments';
import { simular, taxaObservada, aporteMedioMensal, mensalDeAnual } from '@/lib/simulate';

/**
 * Simulador de juros compostos.
 *
 * Nasce preenchido com o que o app já sabe: o saldo de hoje, o aporte médio
 * medido no histórico e a taxa que o dinheiro realmente rendeu. Quando não há
 * histórico para medir, o campo da taxa fica VAZIO em vez de vir com um valor
 * plausível — inventar "10% ao ano" seria dar uma resposta que ninguém pediu
 * e que a pessoa levaria como se fosse do app.
 */
const PRAZOS = [
  { meses: 12, label: '1 ano' },
  { meses: 60, label: '5 anos' },
  { meses: 120, label: '10 anos' },
  { meses: 240, label: '20 anos' },
  { meses: 360, label: '30 anos' },
];

export default function InvestmentSimulator({ investments = [], onClose }) {
  const [alvo, setAlvo] = useState('todos');

  const escolhidos = alvo === 'todos'
    ? investments
    : investments.filter(i => i.id === alvo);

  const medida = taxaObservada(escolhidos);
  const totais = totaisDaCarteira(escolhidos);
  const aporteMedido = aporteMedioMensal(escolhidos);

  const [inicial, setInicial] = useState(String(totais.saldo || ''));
  const [aporte, setAporte] = useState(aporteMedido ? String(aporteMedido) : '');
  const [taxa, setTaxa] = useState(medida ? medida.anual.toFixed(2) : '');
  const [meses, setMeses] = useState(120);
  const [inflacao, setInflacao] = useState('');

  // Trocar o alvo repõe os números daquele investimento
  const trocarAlvo = (id) => {
    setAlvo(id);
    const lista = id === 'todos' ? investments : investments.filter(i => i.id === id);
    const t = taxaObservada(lista);
    const a = aporteMedioMensal(lista);
    setInicial(String(totaisDaCarteira(lista).saldo || ''));
    setAporte(a ? String(a) : '');
    setTaxa(t ? t.anual.toFixed(2) : '');
  };

  const taxaAnual = paraNumero(taxa);
  const resultado = useMemo(() => simular({
    inicial: paraNumero(inicial) || 0,
    aporte: paraNumero(aporte) || 0,
    taxaMensal: taxaAnual === null ? 0 : mensalDeAnual(taxaAnual),
    meses,
    inflacaoAnual: paraNumero(inflacao),
  }), [inicial, aporte, taxaAnual, meses, inflacao]);

  return (
    <Modal onClose={onClose} labelledBy="titulo-simulacao">
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="titulo-simulacao">Simulação</h2>
            <p className="modal-subtitle">
              Se o dinheiro continuar rendendo o que rendeu, e você mantiver o aporte
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="fechar" />
          </button>
        </div>

        {investments.length > 1 && (
          <div className="form-group">
            <label className="form-label" htmlFor="sim-alvo">Simular</label>
            <select
              id="sim-alvo"
              className="form-select"
              value={alvo}
              onChange={e => trocarAlvo(e.target.value)}
            >
              <option value="todos">Carteira inteira</option>
              {investments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="sim-inicial">Começando com</label>
            <MoneyInput id="sim-inicial" value={inicial} onChange={e => setInicial(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sim-aporte">Aporte por mês</label>
            <MoneyInput id="sim-aporte" value={aporte} onChange={e => setAporte(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="sim-taxa">Rendimento ao ano (%)</label>
            <input
              id="sim-taxa"
              className="form-input"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder={medida ? '' : 'ex: 12'}
              value={taxa}
              onChange={e => setTaxa(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sim-inflacao">Inflação ao ano (%)</label>
            <input
              id="sim-inflacao"
              className="form-input"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="deixe vazio para ignorar"
              value={inflacao}
              onChange={e => setInflacao(e.target.value)}
            />
          </div>
        </div>

        <p className="form-hint">
          {medida
            ? `A taxa veio do seu histórico: ${(medida.mensal * 100).toFixed(2)}% ao mês, mediana de ${medida.amostras} ${medida.amostras === 1 ? 'medição' : 'medições'}. Dá para trocar.`
            : 'Ainda não há anotações de saldo suficientes para medir o seu rendimento — são precisas pelo menos duas. Informe a taxa que você espera.'}
          {aporteMedido !== null && ` O aporte veio da sua média: ${formatBRL(aporteMedido)} por mês.`}
        </p>

        <div className="segmented sim-prazos">
          {PRAZOS.map(p => (
            <button
              key={p.meses}
              type="button"
              className={meses === p.meses ? 'active' : ''}
              onClick={() => setMeses(p.meses)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <SimulationResult resultado={resultado} meses={meses} temInflacao={paraNumero(inflacao) !== null} />

        <div className="modal-actions">
          <p className="pend-hint">
            Extrapolação, não promessa: repete a taxa informada todo mês, sem
            imposto, sem taxa de corretora e sem os anos ruins.
          </p>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * O resultado, separado do formulário porque o `Modal` renderiza por portal e
 * não aparece no HTML do servidor — solto, dá para conferi-lo.
 */
export function SimulationResult({ resultado, meses, temInflacao }) {
  const { chart } = useTheme();
  const anos = Math.round(meses / 12);

  // Um ponto por mês em 30 anos são 360 marcas para 600px: um a cada seis
  // meses já desenha a mesma curva com um décimo do trabalho.
  const passo = Math.max(1, Math.round(resultado.pontos.length / 60));
  const amostra = resultado.pontos.filter((_, i) => i % passo === 0 || i === resultado.pontos.length - 1);

  return (
    <>
      <div className="sim-cards">
        <div>
          <div className="stat-label">Em {anos} {anos === 1 ? 'ano' : 'anos'}</div>
          <div className="stat-value positive" id="sim-final">{formatBRL(resultado.final)}</div>
          {temInflacao && (
            <div className="stat-change">
              {formatBRL(resultado.finalReal)} no poder de compra de hoje
            </div>
          )}
        </div>
        <div>
          <div className="stat-label">Do seu bolso</div>
          <div className="stat-value" id="sim-aportado">{formatBRL(resultado.aportado)}</div>
        </div>
        <div>
          <div className="stat-label">Em juros</div>
          <div className={`stat-value ${resultado.juros >= 0 ? 'positive' : 'negative'}`} id="sim-juros">
            {formatBRL(resultado.juros)}
          </div>
          <div className="stat-change">{Math.round(resultado.parteDeJuros)}% do total</div>
        </div>
      </div>

      <div className="chart-wrapper sim-chart">
        <Line
          data={{
            labels: amostra.map(p => (p.mes % 12 === 0 ? `${p.mes / 12}a` : `${p.mes}m`)),
            datasets: [
              {
                label: 'Total',
                data: amostra.map(p => p.saldo),
                borderColor: chart.income,
                backgroundColor: chart.incomeFill,
                fill: true,
                tension: 0.2,
                pointRadius: 0,
              },
              {
                // A linha de baixo é o que saiu do bolso; a distância entre as
                // duas é o juro. É o que faz a curva significar alguma coisa.
                label: 'Do seu bolso',
                data: amostra.map(p => p.aportado),
                borderColor: chart.muted,
                borderDash: [5, 4],
                fill: false,
                tension: 0,
                pointRadius: 0,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { labels: { color: chart.text, font: { family: 'Inter', size: 12 } } },
              tooltip: {
                backgroundColor: chart.tooltipBg,
                titleColor: chart.tooltipText,
                bodyColor: chart.tooltipText,
                borderColor: chart.tooltipBorder,
                borderWidth: 1,
                callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatBRL(ctx.raw)}` },
              },
            },
            scales: {
              x: { ticks: { color: chart.muted, maxTicksLimit: 10 }, grid: { display: false } },
              y: { ticks: { color: chart.muted, callback: v => formatBRL(v) }, grid: { color: chart.grid } },
            },
          }}
        />
      </div>
    </>
  );
}
