'use client';

import { diaDe, isoDoDia } from '@/lib/trips';
import { getMonthName } from '@/lib/utils';
import { COR_CASA } from './formato';

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * Os meses da viagem em grade, com cada estadia como uma faixa contínua,
 * como num calendário de hotel: começa no meio do dia do check-in e termina
 * no meio do dia do check-out. Por isso cada semana tem 14 meias-colunas.
 *
 * As outras viagens que caem nos mesmos meses aparecem apagadas, para ver a
 * folga entre elas.
 */
export default function CalendarioDeEstadias({ trip, estadias: lista, cores, outrasViagens = [], hojeISO, destaque, onDia, onFoco }) {
  const inicio = diaDe(trip.startDate);
  const fim = diaDe(trip.endDate);
  const hoje = diaDe(hojeISO);

  const pernoites = lista.filter(s => s.noites > 0 && s.saida);
  const outras = outrasViagens.map(v => ({ ...v, de: diaDe(v.startDate), ate: diaDe(v.endDate) }));

  // Meses da ida até a volta
  const meses = [];
  const d0 = new Date(inicio * 86400000);
  const d1 = new Date(fim * 86400000);
  for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); y < d1.getUTCFullYear() || (y === d1.getUTCFullYear() && m <= d1.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
    meses.push({ y, m });
  }

  return (
    <div className="roteiro-cal">
      {meses.map(({ y, m }) => {
        const primeiro = Date.UTC(y, m, 1) / 86400000;
        const ultimo = Date.UTC(y, m + 1, 0) / 86400000;
        const comeco = primeiro - new Date(primeiro * 86400000).getUTCDay();
        const semanas = [];
        for (let ws = comeco; ws <= ultimo; ws += 7) semanas.push(ws);

        return (
          <div key={`${y}-${m}`} className="roteiro-cal-mes">
            <div className="roteiro-cal-titulo">{getMonthName(m + 1)} {y}</div>
            <div className="roteiro-cal-semana roteiro-cal-cabecalho">
              {SEMANA.map((s, i) => <span key={i}>{s}</span>)}
            </div>

            {semanas.map(ws => {
              const we = ws + 6;

              const faixas = pernoites.flatMap(s => {
                const ch = diaDe(s.chegada), sa = diaDe(s.saida);
                const a = Math.max(ch, ws), b = Math.min(sa, we);
                if (a > b) return [];
                const ini = a === ch ? (a - ws) * 2 + 2 : 1;
                const fimCol = b === sa ? (b - ws) * 2 + 2 : 15;
                if (fimCol <= ini) return [];
                return [{ s, ini, fimCol, rotulo: a === ch || a === ws }];
              });

              const fantasmas = outras.flatMap(v => {
                const a = Math.max(v.de, ws), b = Math.min(v.ate, we);
                if (a > b) return [];
                return [{ v, ini: (a - ws) * 2 + 1, fimCol: (b - ws) * 2 + 3, rotulo: a === v.de || a === ws }];
              });

              return (
                <div key={ws} className="roteiro-cal-semana">
                  {Array.from({ length: 7 }, (_, i) => {
                    const dia = ws + i;
                    const iso = isoDoDia(dia);
                    const doMes = dia >= primeiro && dia <= ultimo;
                    const naViagem = dia >= inicio && dia <= fim;
                    const classes = [
                      'roteiro-cal-dia',
                      !doMes && 'fora',
                      naViagem && 'na-viagem',
                      dia === hoje && 'hoje',
                      destaque.dias.has(iso) && 'focado',
                    ].filter(Boolean).join(' ');
                    const numero = new Date(dia * 86400000).getUTCDate();
                    return naViagem ? (
                      <button
                        key={i} type="button" className={classes} style={{ gridColumn: `${i * 2 + 1} / span 2` }}
                        onClick={() => onDia(iso)}
                        onMouseEnter={() => onFoco({ tipo: 'dia', data: iso })}
                        onMouseLeave={() => onFoco(null)}
                        aria-label={`Ir para o dia ${numero}`}
                      >
                        {numero}
                      </button>
                    ) : (
                      <span key={i} className={classes} style={{ gridColumn: `${i * 2 + 1} / span 2` }}>{numero}</span>
                    );
                  })}

                  {faixas.map(({ s, ini, fimCol, rotulo }) => (
                    <span
                      key={s.id}
                      className={`roteiro-cal-faixa ${destaque.paradas.has(s.id) ? 'ativa' : ''}`}
                      style={{ gridColumn: `${ini} / ${fimCol}`, '--cor': cores[s.id] || COR_CASA }}
                      onMouseEnter={() => onFoco({ tipo: 'parada', ids: [s.id] })}
                      onMouseLeave={() => onFoco(null)}
                      title={`${s.city}: ${s.noites} ${s.noites === 1 ? 'noite' : 'noites'}`}
                    >
                      {rotulo && s.city}
                    </span>
                  ))}

                  {fantasmas.map(({ v, ini, fimCol, rotulo }) => (
                    <span key={v.id} className="roteiro-cal-fantasma" style={{ gridColumn: `${ini} / ${fimCol}` }} title={v.name}>
                      {rotulo && v.name}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
