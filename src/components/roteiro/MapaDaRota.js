'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Car } from 'lucide-react';
import Icon from '@/components/Icon';
import { enquadrar, trechosSuaves, progressoDaRota } from '@/lib/roteiro';
import { decodificarPolyline } from '@/lib/estrada';
import { CONTORNOS } from '@/lib/contornos';
import { COR_CASA, noitesTexto } from './formato';
import { easeOut, menosMovimentoAgora } from './movimento';

/** Quanto leva o traço para ir da origem ao fim na entrada. */
const DESENHO_MS = 1200;
/** O carro sai depois do traço, até a posição de hoje. */
const CARRO_MS = 900;

const f1 = (n) => n.toFixed(1);

/**
 * Onde vai o nome de cada pino: embaixo, em cima, à direita ou à esquerda,
 * o primeiro lugar que não bate em outro nome, num pino ou na borda. As
 * cidades da serra ficam a 50 km umas das outras; no celular, com a casa
 * longe, os pinos se amontoam e o nome fixo embaixo encavalaria.
 */
function posicionarRotulos(pinos, W, H) {
  const ocupado = pinos.map(p => ({ x0: p.x - 16, x1: p.x + 16, y0: p.y - 16, y1: p.y + 16 }));
  const bate = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

  return pinos.map(p => {
    const largura = Math.max(p.titulo.length * 7.4, p.sub.length * 6.2) + 8;
    const opcoes = [
      { ancora: 'middle', x: 0, y: 26 },
      { ancora: 'middle', x: 0, y: -32 },
      { ancora: 'start', x: 14, y: 2 },
      { ancora: 'end', x: -14, y: 2 },
    ];
    const caixa = (o) => {
      const x0 = o.ancora === 'start' ? p.x + o.x : o.ancora === 'end' ? p.x + o.x - largura : p.x - largura / 2;
      return { x0, x1: x0 + largura, y0: p.y + o.y - 13, y1: p.y + o.y + 18 };
    };
    const cabe = (c) => c.x0 >= 2 && c.x1 <= W - 2 && c.y0 >= 2 && c.y1 <= H - 2;
    let escolha = opcoes.find(o => { const c = caixa(o); return cabe(c) && !ocupado.some(b => bate(c, b)); });
    // Sem lugar livre: o que cabe na tela, mesmo encostando
    if (!escolha) escolha = opcoes.find(o => cabe(caixa(o))) || opcoes[0];
    ocupado.push(caixa(escolha));
    return escolha;
  });
}

/**
 * Mapa esquemático da rota, em SVG, sem tiles nem biblioteca de mapas: o
 * contorno dos estados ao fundo, uma curva pelas paradas e o carro onde a
 * viagem está hoje, pela data. Ver docs/rfc/0003-roteiro.md.
 *
 * Camadas, de baixo para cima: contornos, a trilha inteira (tracejada,
 * revelada por uma máscara que se desenha na entrada), os trechos em foco,
 * o percorrido (cheio, até o carro), os pinos e o carro.
 *
 * O carro e o percorrido andam por atributos no DOM, não por estado: são 60
 * quadros por segundo, e re-renderizar o SVG inteiro em cada um não precisa.
 */
export default function MapaDaRota({ estadias: lista, dias, cores, hojeISO, destaque, onFoco, onEditarParada }) {
  const caixa = useRef(null);
  const [W, setW] = useState(0);
  // O useId do React 19 tem caracteres que não valem dentro de url(#…)
  const mascara = `rota${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setW(Math.round(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const estreito = W < 560;
  const H = estreito ? Math.round(W * 0.95) : Math.round(Math.min(W * 0.5, 420));

  const geo = useMemo(() => {
    if (!W) return null;
    // A faixa de cima é da legenda e do botão: os pinos começam abaixo dela
    const topo = 44;
    const enq = enquadrar(lista, W, H - topo, estreito ? 44 : 64);
    const proj = (la, ln) => { const p = enq(la, ln); return { x: p.x, y: p.y + topo }; };
    const pontos = lista.map(s => proj(s.lat, s.lng));
    const contornos = Object.entries(CONTORNOS).map(([uf, anel]) => {
      const pts = anel.map(([la, ln]) => proj(la, ln));
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      return { uf, d: `M${pts.map(p => `${f1(p.x)} ${f1(p.y)}`).join('L')}Z`, cx, cy };
    });
    // Trecho com rota pelas ruas (RFC 0004) vira o traçado real; sem rota,
    // a curva da 0003. O traçado começa e termina nos pinos, para o carro
    // não pular de um para o outro.
    const curvas = trechosSuaves(pontos);
    const trechos = curvas.map((curva, i) => {
      const poly = lista[i + 1]?.rota?.polyline;
      if (!poly) return curva;
      const meio = decodificarPolyline(poly).map(([la, ln]) => proj(la, ln));
      const pts = [pontos[i], ...meio, pontos[i + 1]];
      return `M${pts.map(p => `${f1(p.x)} ${f1(p.y)}`).join('L')}`;
    });

    // Pinos: a mesma cidade (a casa, no início e no fim) vira um pino só
    const pinos = [];
    for (const [i, s] of lista.entries()) {
      const p = pontos[i];
      const junto = pinos.find(x => Math.hypot(x.x - p.x, x.y - p.y) < 4);
      if (junto) { junto.paradas.push(s); continue; }
      pinos.push({ x: p.x, y: p.y, paradas: [s] });
    }
    for (const p of pinos) {
      const casa = p.paradas.some(x => x.tipo === 'origem');
      const pernoites = p.paradas.filter(x => x.tipo === 'pernoite');
      p.titulo = p.paradas[0].city;
      p.casa = casa;
      p.sub = casa
        ? (p.paradas.some(x => x.tipo === 'fim') ? 'início e fim' : 'saída')
        : pernoites.length ? noitesTexto(pernoites.reduce((n, x) => n + x.noites, 0))
          : p.paradas[0].tipo === 'fim' ? 'chegada' : 'passagem';
    }
    const rotulos = posicionarRotulos(pinos, W, H);
    pinos.forEach((p, i) => { p.rotulo = rotulos[i]; });
    return { pontos, contornos, trechos, pinos };
  }, [lista, W, H, estreito]);

  // Comprimento de cada trecho, medido no DOM depois de desenhar
  const trechoRefs = useRef([]);
  const rotaRef = useRef(null);
  const percorridoRef = useRef(null);
  const carroRef = useRef(null);
  const [medidas, setMedidas] = useState(null);

  useLayoutEffect(() => {
    if (!geo) return;
    const lens = geo.trechos.map((_, i) => trechoRefs.current[i]?.getTotalLength() || 0);
    const acum = [0];
    for (const l of lens) acum.push(acum[acum.length - 1] + l);
    setMedidas({ lens, acum, total: acum[acum.length - 1] });
  }, [geo]);

  const progresso = progressoDaRota(lista, hojeISO);
  const alvo = useMemo(() => {
    if (!medidas || !medidas.total) return 0;
    const i = Math.min(Math.floor(progresso.posicao), medidas.lens.length);
    const resto = progresso.posicao - i;
    return medidas.acum[i] + (medidas.lens[i] || 0) * resto;
  }, [medidas, progresso.posicao]);

  /** Põe o carro e o fim do percorrido num ponto da rota, em px de traço. */
  const posicionar = useCallback((len) => {
    const rota = rotaRef.current;
    if (!rota || !medidas) return;
    const p = medidas.total ? rota.getPointAtLength(Math.max(0, Math.min(len, medidas.total))) : geo.pontos[0];
    if (!p) return;
    carroRef.current?.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y)})`);
    if (percorridoRef.current) percorridoRef.current.style.strokeDashoffset = String(medidas.total - len);
  }, [medidas, geo]);

  const quadro = useRef(0);
  const atual = useRef(0);
  const [entrou, setEntrou] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [rotulo, setRotulo] = useState(null);

  const animar = useCallback((de, ate, duracao, aoCruzar) => new Promise(resolve => {
    cancelAnimationFrame(quadro.current);
    const inicio = performance.now();
    const passo = (agora) => {
      const t = Math.min((agora - inicio) / duracao, 1);
      const len = de + (ate - de) * easeOut(t);
      atual.current = len;
      posicionar(len);
      aoCruzar?.(len);
      if (t < 1) quadro.current = requestAnimationFrame(passo);
      else resolve();
    };
    quadro.current = requestAnimationFrame(passo);
  }), [posicionar]);

  // Entrada: o traço se desenha (CSS), e o carro sai atrás dele até hoje.
  // Depois disso, mudanças de dados só reposicionam.
  useEffect(() => {
    if (!medidas) return;
    if (entrou || menosMovimentoAgora()) {
      if (!rodando) { atual.current = alvo; posicionar(alvo); }
      setEntrou(true);
      return;
    }
    posicionar(0);
    const t = setTimeout(() => {
      animar(0, alvo, CARRO_MS).then(() => setEntrou(true));
    }, DESENHO_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medidas, alvo]);

  useEffect(() => () => cancelAnimationFrame(quadro.current), []);

  /** ▶ O percurso inteiro, com o dia e o km ao passar por cada cidade. */
  const rever = async () => {
    if (!medidas?.total || rodando) return;
    if (menosMovimentoAgora()) { posicionar(medidas.total); return; }
    setRodando(true);

    let proxima = 1;
    let km = 0;
    const aoCruzar = (len) => {
      while (proxima < lista.length && len >= medidas.acum[proxima] - 0.5) {
        const s = lista[proxima];
        km += s.legKm || 0;
        const dia = dias.find(d => d.data === s.chegada);
        const p = geo.pontos[proxima];
        setRotulo({ x: p.x, y: p.y, linha1: s.city, linha2: [dia && `D${dia.numero}`, km && `${Math.round(km)} km`].filter(Boolean).join(' · ') });
        proxima++;
      }
    };

    setRotulo(null);
    await animar(0, medidas.total, Math.max(3200, lista.length * 900), aoCruzar);
    await new Promise(r => setTimeout(r, 1100));
    setRotulo(null);
    await animar(medidas.total, alvo, 700);
    setRodando(false);
  };

  const legenda = (() => {
    if (lista.length < 2) return null;
    const ultimo = lista[lista.length - 1];
    if (hojeISO < lista[0].chegada) return `Saída de ${lista[0].city}`;
    if (hojeISO > ultimo.chegada) return 'Rota completa';
    const dia = dias.find(d => d.data === hojeISO);
    if (!dia) return null;
    return progresso.emTrecho ? `Hoje: estrada para ${dia.noite.city}` : `Hoje em ${dia.noite.city}`;
  })();

  const pronto = geo && medidas;
  const desenhando = pronto && !entrou && !menosMovimentoAgora();

  return (
    <div className="card roteiro-mapa" ref={caixa}>
      <div className="roteiro-mapa-topo">
        {legenda && <span className="roteiro-mapa-legenda"><Icon name="local" /> {legenda}</span>}
        {lista.length > 1 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={rever} disabled={rodando}>
            <Icon name="reproduzir" /> {rodando ? 'Percorrendo…' : 'Rever o percurso'}
          </button>
        )}
      </div>

      {lista.length === 0 && (
        <p className="roteiro-mapa-vazio">Adicione as paradas para ver a rota.</p>
      )}

      {geo && lista.length > 0 && (
        <svg
          width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          className={`roteiro-mapa-svg ${desenhando ? 'desenhando' : ''}`}
          role="img" aria-label={`Rota: ${lista.map(s => s.city).join(', ')}`}
        >
          <defs>
            <mask id={mascara} maskUnits="userSpaceOnUse">
              <path
                d={geo.trechos.join(' ')} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round"
                className="roteiro-mapa-revelar"
                // Parado no fim; a animação de entrada (CSS) parte de --comprimento
                style={medidas ? { strokeDasharray: medidas.total + 1, strokeDashoffset: 0, '--comprimento': medidas.total + 1 } : undefined}
              />
            </mask>
          </defs>

          <g className="roteiro-mapa-estados">
            {geo.contornos.map(c => <path key={c.uf} d={c.d} />)}
            {geo.contornos.map(c => (
              c.cx > 0 && c.cx < W && c.cy > 0 && c.cy < H
                ? <text key={c.uf} x={c.cx} y={c.cy}>{c.uf}</text>
                : null
            ))}
          </g>

          {/* Trilha inteira, tracejada, revelada pela máscara */}
          <g mask={`url(#${mascara})`}>
            {geo.trechos.map((d, i) => (
              <path key={i} d={d} ref={el => { trechoRefs.current[i] = el; }} className="roteiro-mapa-trilha" />
            ))}
          </g>

          {geo.trechos.map((d, i) => (
            <path key={i} d={d} className={`roteiro-mapa-foco ${destaque.trechos.has(i) ? 'ativo' : ''}`} />
          ))}

          <path ref={rotaRef} d={geo.trechos.join(' ')} fill="none" stroke="none" />
          {medidas && (
            <path
              ref={percorridoRef} d={geo.trechos.join(' ')} className="roteiro-mapa-percorrido"
              style={{ strokeDasharray: medidas.total + 1, strokeDashoffset: medidas.total + 1 }}
            />
          )}

          {geo.pinos.map((p, i) => {
            const s = p.paradas[0];
            const { casa, sub, rotulo: o } = p;
            const atrasoMs = medidas?.total ? (medidas.acum[s.indice] / medidas.total) * DESENHO_MS : 0;
            const ativo = p.paradas.some(x => destaque.paradas.has(x.id));
            const cor = casa ? COR_CASA : cores[s.id];

            return (
              <g
                key={i}
                className={`roteiro-mapa-pino ${ativo ? 'ativo' : ''}`}
                transform={`translate(${f1(p.x)} ${f1(p.y)})`}
                style={{ '--cor': cor, '--atraso': `${Math.round(atrasoMs)}ms` }}
                tabIndex={0} role="button"
                aria-label={`${s.city}, ${sub}. Editar parada.`}
                onMouseEnter={() => onFoco({ tipo: 'parada', ids: p.paradas.map(x => x.id) })}
                onMouseLeave={() => onFoco(null)}
                onFocus={() => onFoco({ tipo: 'parada', ids: p.paradas.map(x => x.id) })}
                onBlur={() => onFoco(null)}
                onClick={() => onEditarParada(p.paradas[p.paradas.length - 1])}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditarParada(p.paradas[p.paradas.length - 1]); } }}
              >
                <g className="roteiro-mapa-pino-corpo">
                  <circle r="14" className="roteiro-mapa-pino-halo" />
                  <circle r="7" className="roteiro-mapa-pino-ponto" />
                  <text x={o.x} y={o.y} textAnchor={o.ancora} className="roteiro-mapa-cidade">{s.city}</text>
                  <text x={o.x} y={o.y + 14} textAnchor={o.ancora} className="roteiro-mapa-sub">{sub}</text>
                </g>
              </g>
            );
          })}

          {medidas && (
            <g ref={carroRef} className={`roteiro-mapa-carro ${rodando ? 'rodando' : ''}`} transform={`translate(${f1(geo.pontos[0].x)} ${f1(geo.pontos[0].y)})`}>
              <circle r="19" className="roteiro-mapa-carro-pulso" />
              <circle r="13" className="roteiro-mapa-carro-fundo" />
              <Car size={15} x={-7.5} y={-7.5} strokeWidth={2.2} className="roteiro-mapa-carro-icone" />
            </g>
          )}

          {rotulo && (
            <g transform={`translate(${f1(Math.min(Math.max(rotulo.x, 66), W - 66))} ${f1(Math.max(rotulo.y - 40, 26))})`} key={rotulo.linha1 + rotulo.linha2}>
              {/* O transform do SVG posiciona; o do CSS anima. Num g só, um apagaria o outro */}
              <g className="roteiro-mapa-rotulo">
                <rect x="-62" y="-22" width="124" height="40" rx="8" />
                <text y="-5">{rotulo.linha1}</text>
                <text y="11" className="roteiro-mapa-rotulo-sub">{rotulo.linha2}</text>
              </g>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
