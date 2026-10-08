/**
 * Estrada: km e tempo de cada trecho, saída sugerida e folga, sem rede. Ver
 * docs/rfc/0004-roteiro-inteligente.md.
 *
 * Os números digitados na parada (legKm, legMinutes) vencem os calculados
 * pelo OSRM: quem conhece a estrada sabe mais que o roteador. Vazio, vale o
 * OSRM; sem os dois, o trecho fica sem número.
 *
 * O OSRM público não tem trânsito. O tempo é "típico", e a folga existe para
 * cobrir a diferença; o trânsito de verdade fica no link do Google Maps.
 */

/** Acima disso, a parada é "de serra" e o trecho até ela ganha a sugestão de folga extra. */
export const ALTITUDE_SERRA = 700;
export const FOLGA_SERRA = 10;

/**
 * As paradas com km e tempo efetivos. Cada parada ganha `legFonte`
 * ('informado', 'ruas' ou null) e, quando há rota, `rota` com o traçado.
 * Os valores digitados ficam em `legKmInformado`/`legMinutesInformado`, para o
 * formulário de edição não gravar o número do OSRM como se fosse digitado.
 */
export function aplicarRotas(stops, rotas = {}) {
  return stops.map(s => {
    const rota = rotas[s.id] || null;
    const kmDigitado = s.legKm ?? null;
    const minDigitado = s.legMinutes ?? null;
    const legKm = kmDigitado ?? rota?.km ?? null;
    const legMinutes = minDigitado ?? rota?.minutos ?? null;
    const digitado = kmDigitado != null || minDigitado != null;
    return {
      ...s,
      legKm,
      legMinutes,
      legKmInformado: kmDigitado,
      legMinutesInformado: minDigitado,
      legFonte: digitado ? 'informado' : rota ? 'ruas' : null,
      rota,
    };
  });
}

/** Folga do trecho em %: a da parada, senão a da viagem. */
export function folgaDoTrecho(trip, stop) {
  return stop.legBufferPct ?? trip.roadBufferPct ?? 20;
}

/**
 * Sugestão de folga extra para trecho de serra: só quando a parada não tem
 * folga própria (se tem, alguém já decidiu) e fica acima de 700 m.
 */
export function sugestaoDeSerra(trip, stop, altitude) {
  if (altitude == null || altitude < ALTITUDE_SERRA || stop.legBufferPct != null) return null;
  return { altitude: Math.round(altitude), folga: folgaDoTrecho(trip, stop) + FOLGA_SERRA };
}

/**
 * Saída sugerida para chegar até `chegada` ("HH:MM"): tempo de estrada mais
 * a folga, para trás. Se cair no dia anterior, `diaAntes` vem true.
 */
export function saidaSugerida(chegada, minutos, folgaPct) {
  if (!chegada || !/^\d{2}:\d{2}$/.test(chegada) || !minutos) return null;
  const [h, m] = chegada.split(':').map(Number);
  const total = Math.round(minutos * (1 + folgaPct / 100));
  let inicio = h * 60 + m - total;
  const diaAntes = inicio < 0;
  if (diaAntes) inicio += 24 * 60;
  // Arredonda para baixo em 5 minutos: sair 07:12 não ajuda ninguém
  inicio = Math.floor(inicio / 5) * 5;
  const hh = String(Math.floor(inicio / 60)).padStart(2, '0');
  const mm = String(inicio % 60).padStart(2, '0');
  return { horario: `${hh}:${mm}`, comFolga: total, diaAntes };
}

/** Trajeto no Google Maps com origem e destino, para ver o trânsito na hora. URL pública, sem chave. */
export function linkGoogleMaps(de, para) {
  const q = new URLSearchParams({
    api: '1',
    origin: `${de.lat},${de.lng}`,
    destination: `${para.lat},${para.lng}`,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Chave da rota no cache: as duas coordenadas com 4 casas (~11 m). */
export function chaveDaRota(de, para) {
  const c = (p) => `${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`;
  return `osrm:${c(de)};${c(para)}`;
}

/**
 * Polyline do OSRM (formato Google, precisão 5) para pares [lat, lng].
 * Pura e pequena: não vale uma dependência.
 */
export function decodificarPolyline(texto) {
  const pontos = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < texto.length) {
    for (const eixo of [0, 1]) {
      let resultado = 0;
      let deslocamento = 0;
      let b;
      do {
        b = texto.charCodeAt(i++) - 63;
        resultado |= (b & 0x1f) << deslocamento;
        deslocamento += 5;
      } while (b >= 0x20);
      const delta = resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
      if (eixo === 0) lat += delta; else lng += delta;
    }
    pontos.push([lat / 1e5, lng / 1e5]);
  }
  return pontos;
}
