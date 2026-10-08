/**
 * Clima: a fonte de cada dia e a média de 10 anos. Ver
 * docs/rfc/0004-roteiro-inteligente.md.
 */
import {
  fonteDoDia, separarPorFonte, periodoDaMedia, mediaHistorica, diasDaPrevisao, resumoDoClima, tempoDoDia,
} from '../src/lib/clima.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- a borda dos 16 dias (o Open-Meteo aceita até hoje + 15) ---
const hoje = '2026-10-08';
ok('hoje é previsão', fonteDoDia('2026-10-08', hoje), 'previsao');
ok('hoje + 15 é previsão', fonteDoDia('2026-10-23', hoje), 'previsao');
ok('hoje + 16 é média', fonteDoDia('2026-10-24', hoje), 'media');
ok('ontem é observado', fonteDoDia('2026-10-07', hoje), 'observado');
ok('92 dias atrás é observado', fonteDoDia('2026-07-08', hoje), 'observado');
ok('93 dias atrás é média', fonteDoDia('2026-07-07', hoje), 'media');

// --- viagem de dezembro vista de outubro, e vista de perto ---
ok('de longe, tudo média', separarPorFonte('2026-12-11', '2026-12-18', hoje),
  { previsao: [], observado: [], media: ['2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'] });
const misto = separarPorFonte('2026-12-11', '2026-12-18', '2026-11-28');
ok('período misto: 13 dias à frente entra a previsão', [misto.previsao.length, misto.media.length], [3, 5]);
const durante = separarPorFonte('2026-12-11', '2026-12-18', '2026-12-14');
ok('durante a viagem: passado observado, resto previsão', [durante.observado.length, durante.previsao.length, durante.media.length], [3, 5, 0]);

// --- período da média ---
ok('10 anos completos', periodoDaMedia(['2026-12-11', '2026-12-18'], hoje), { de: '2016-12-11', ate: '2025-12-18' });
ok('cruzando o ano', periodoDaMedia(['2026-12-23', '2027-01-02'], hoje), { de: '2015-12-23', ate: '2025-01-02' });

// --- média histórica, com um ano faltando ---
{
  const daily = {
    time: ['2023-12-14', '2024-12-14', '2025-12-14', '2025-12-15'],
    temperature_2m_max: [24, 26, null, 20],
    temperature_2m_min: [12, 14, 13, 10],
    precipitation_sum: [0, 5.2, 3, 0.4],
  };
  ok('média ignora o ano sem máxima', mediaHistorica(daily, ['2026-12-14', '2026-12-15', '2026-12-16']), [
    { data: '2026-12-14', fonte: 'media', anos: 2, max: 25, min: 13, chuva: 50 },
    { data: '2026-12-15', fonte: 'media', anos: 1, max: 20, min: 10, chuva: 0 },
    { data: '2026-12-16', fonte: 'media', anos: 0, max: null, min: null, chuva: null },
  ]);
}

// --- previsão e observado ---
{
  const daily = {
    time: ['2026-12-14'], temperature_2m_max: [27.1], temperature_2m_min: [15.2],
    precipitation_probability_max: [70], precipitation_sum: [0.2], weather_code: [61],
  };
  ok('previsão usa a probabilidade', diasDaPrevisao(daily, 'previsao')[0].chuva, 70);
  ok('observado usa se choveu', diasDaPrevisao(daily, 'observado')[0].chuva, 0);
  ok('código 61 é chuva', tempoDoDia(diasDaPrevisao(daily, 'previsao')[0]).icone, 'chuva');
}

// --- resumo e ícone pela média ---
ok('resumo do período', resumoDoClima([
  { max: 25.4, min: 13.2, chuva: 60, fonte: 'media' },
  { max: 28.9, min: 15, chuva: 20, fonte: 'media' },
  { max: null, min: null, chuva: null, fonte: 'media' },
]), { min: 13, max: 29, chuvaMedia: 40, diasComChuva: 1, fontes: ['media'] });
ok('sem dado, sem resumo', resumoDoClima([]), null);
ok('média sem código: pela chance de chuva', tempoDoDia({ chuva: 35 }).icone, 'solNuvem');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
