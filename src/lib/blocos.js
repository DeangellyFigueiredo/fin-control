/**
 * Blocos do roteiro: a viagem dividida por cidade. Ver
 * docs/rfc/0004-roteiro-inteligente.md.
 *
 * O bloco é derivado das estadias, sem tabela própria:
 * - origem: "Saída de Itapema", o trecho de estrada que abre a viagem;
 * - pernoite: a cidade, da chegada até a véspera da saída. O dia da saída é
 *   o dia de chegada da próxima, e fica no bloco dela, onde está o check-in;
 * - passagem: a cidade de 0 noites, no dia em que se passa por ela;
 * - fim: "Volta para Itapema", o último trecho, com o que houver no dia.
 *
 * Assim cada dia da viagem cai em exatamente um bloco.
 */

import { diaDe, isoDoDia, centavos } from './trips.js';

/**
 * `lista` vem de estadias(); `dias`, de diasDoRoteiro(). Devolve um bloco por
 * parada, na ordem da viagem.
 */
export function blocosDoRoteiro(lista, dias) {
  const porData = new Map(dias.map(d => [d.data, d]));
  const somar = (ds, campo) => ds.reduce((s, d) => s + centavos(d[campo]), 0) / 100;

  return lista.map((s, i) => {
    const proxima = lista[i + 1];
    let tipo;
    let titulo;
    let datas;

    if (s.tipo === 'origem') {
      tipo = 'saida';
      titulo = `Saída de ${s.city}`;
      datas = [];
    } else if (s.tipo === 'fim') {
      tipo = 'volta';
      titulo = lista[0] && lista[0].city === s.city ? `Volta para ${s.city}` : `Chegada em ${s.city}`;
      datas = [s.chegada];
    } else if (s.tipo === 'passagem') {
      tipo = 'passagem';
      titulo = s.city;
      datas = [s.chegada];
    } else {
      tipo = 'estadia';
      titulo = s.city;
      datas = [];
      for (let d = diaDe(s.chegada); d < diaDe(s.saida); d++) datas.push(isoDoDia(d));
    }

    const diasDoBloco = datas.map(iso => porData.get(iso)).filter(Boolean);
    const atividades = diasDoBloco.flatMap(d => d.atividades);

    return {
      id: s.id,
      tipo,
      titulo,
      parada: s,
      // O trecho que leva à cidade; na saída, o que sai dela
      trecho: tipo === 'saida'
        ? (proxima ? { de: s, para: proxima, km: proxima.legKm ?? null, minutos: proxima.legMinutes ?? null } : null)
        : (i > 0 ? { de: lista[i - 1], para: s, km: s.legKm ?? null, minutos: s.legMinutes ?? null } : null),
      inicio: tipo === 'saida' ? s.chegada : datas[0] ?? s.chegada,
      fim: tipo === 'saida' ? s.chegada : datas[datas.length - 1] ?? s.chegada,
      noites: s.noites,
      dias: diasDoBloco,
      atividades: atividades.length,
      feitas: atividades.filter(a => a.status === 'FEITA').length,
      estimado: somar(diasDoBloco, 'estimado'),
      gasto: somar(diasDoBloco, 'gasto'),
    };
  });
}

/** Em que bloco está um dia: o primeiro que o contém. */
export function blocoDoDia(blocos, iso) {
  return blocos.find(b => b.dias.some(d => d.data === iso)) || null;
}
