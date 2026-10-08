/**
 * Estrada: o informado vence o OSRM, a saída sugerida com folga e a
 * sugestão de serra. Ver docs/rfc/0004-roteiro-inteligente.md.
 */
import {
  aplicarRotas, folgaDoTrecho, sugestaoDeSerra, saidaSugerida, linkGoogleMaps, chaveDaRota, decodificarPolyline,
} from '../src/lib/estrada.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- informado × OSRM ---
{
  const stops = [
    { id: 'a', city: 'Itapema' },
    { id: 'b', city: 'Cambará', legKm: null, legMinutes: null },
    { id: 'c', city: 'Gramado', legKm: 110, legMinutes: null },
    { id: 'd', city: 'Bento' },
  ];
  const rotas = { b: { km: 370, minutos: 307, polyline: 'x' }, c: { km: 98, minutos: 105 } };
  const r = aplicarRotas(stops, rotas);
  ok('sem digitado, vale o OSRM', [r[1].legKm, r[1].legMinutes, r[1].legFonte], [370, 307, 'ruas']);
  ok('digitado vence, campo a campo', [r[2].legKm, r[2].legMinutes, r[2].legFonte], [110, 105, 'informado']);
  ok('o digitado fica guardado à parte', [r[1].legKmInformado, r[2].legKmInformado], [null, 110]);
  ok('sem nada, sem número', [r[3].legKm, r[3].legFonte], [null, null]);
  ok('não mexe no original', stops[1].legKm, null);
}

// --- folga e serra ---
{
  const trip = { roadBufferPct: 20 };
  ok('folga da viagem', folgaDoTrecho(trip, {}), 20);
  ok('folga da parada vence', folgaDoTrecho(trip, { legBufferPct: 35 }), 35);
  ok('Gramado a 849 m: sugere +10%', sugestaoDeSerra(trip, {}, 849), { altitude: 849, folga: 30 });
  ok('Itapema no nível do mar: nada', sugestaoDeSerra(trip, {}, 5), null);
  ok('folga já escolhida: não sugere', sugestaoDeSerra(trip, { legBufferPct: 25 }, 849), null);
}

// --- saída sugerida ---
ok('5h07 + 20% para chegar às 17h', saidaSugerida('17:00', 307, 20), { horario: '10:50', comFolga: 368, diaAntes: false });
ok('arredonda para baixo em 5 min', saidaSugerida('12:00', 61, 0).horario, '10:55');
ok('cai no dia anterior', saidaSugerida('03:00', 300, 0), { horario: '22:00', comFolga: 300, diaAntes: true });
ok('sem horário, sem sugestão', saidaSugerida(null, 300, 20), null);
ok('sem tempo, sem sugestão', saidaSugerida('17:00', null, 20), null);

// --- links e chave ---
ok('Google Maps com origem e destino', linkGoogleMaps({ lat: -27.09, lng: -48.61 }, { lat: -29.05, lng: -50.14 }),
  'https://www.google.com/maps/dir/?api=1&origin=-27.09%2C-48.61&destination=-29.05%2C-50.14&travelmode=driving');
ok('chave com 4 casas', chaveDaRota({ lat: -27.09031, lng: -48.6114 }, { lat: -29.0475, lng: -50.14581 }),
  'osrm:-27.0903,-48.6114;-29.0475,-50.1458');

// --- polyline: o exemplo da documentação do formato ---
ok('polyline', decodificarPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
ok('polyline vazia', decodificarPolyline(''), []);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
