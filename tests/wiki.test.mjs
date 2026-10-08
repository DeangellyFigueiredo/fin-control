/**
 * Fotos da Wikipedia (RFC 0004), sem rede: as respostas são as que a
 * Wikipedia e o Commons devolveram em 08/10/2026, resumidas.
 */
import { arquivoDaImagem, creditoDaImagem, paginaWiki, buscarWiki } from '../src/lib/externo/wiki.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

// --- nome do arquivo a partir da URL ---
ok('original no Commons',
  arquivoDaImagem('https://upload.wikimedia.org/wikipedia/commons/9/9f/Canyon_Itaimbezinho_XI.jpg?utm_source=x'),
  { nome: 'Canyon_Itaimbezinho_XI.jpg', api: 'https://commons.wikimedia.org' });
ok('miniatura no Commons, com acento codificado',
  arquivoDaImagem('https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Igreja_S%C3%A3o_Pedro.jpg/800px-Igreja_S%C3%A3o_Pedro.jpg'),
  { nome: 'Igreja_São_Pedro.jpg', api: 'https://commons.wikimedia.org' });
ok('arquivo local da pt.wikipedia',
  arquivoDaImagem('https://upload.wikimedia.org/wikipedia/pt/1/1a/Logo.png'),
  { nome: 'Logo.png', api: 'https://pt.wikipedia.org' });
ok('outro site não é Wikimedia', arquivoDaImagem('https://exemplo.com/wikipedia/commons/a/ab/x.jpg'), null);
ok('lixo', arquivoDaImagem('não é url'), null);

// --- crédito ---
ok('autor e licença, sem HTML', creditoDaImagem({
  Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">Vinicios de Moura</a>' },
  LicenseShortName: { value: 'CC BY-SA 3.0' },
}), 'Vinicios de Moura · CC BY-SA 3.0');
ok('sem metadados', creditoDaImagem({}), 'Wikimedia Commons');

// --- página e busca, com respostas simuladas ---
const IMG = 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Canyon_Itaimbezinho_XI.jpg';
const respostas = {
  'summary/C%C3%A2nion_Itaimbezinho': {
    type: 'standard', title: 'Cânion Itaimbezinho', extract: 'O Cânion Itaimbezinho é um cânion...',
    originalimage: { source: IMG },
    content_urls: { desktop: { page: 'https://pt.wikipedia.org/wiki/C%C3%A2nion_Itaimbezinho' } },
  },
  'summary/Lago_Negro_(Gramado)': null,
  'summary/Lago_Negro': {
    type: 'standard', title: 'Lago Negro', extract: 'O Lago Negro é um lago artificial em Gramado.',
    content_urls: { desktop: { page: 'https://pt.wikipedia.org/wiki/Lago_Negro' } },
  },
  'summary/Gramado_(desambigua%C3%A7%C3%A3o)': { type: 'disambiguation', title: 'Gramado (desambiguação)' },
  'generator=search': { query: { pages: [
    { index: 2, title: 'Gramado (desambiguação)', extract: '...' },
    { index: 1, title: 'Lago Negro', extract: 'O Lago Negro é um lago artificial em Gramado.',
      fullurl: 'https://pt.wikipedia.org/wiki/Lago_Negro',
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Lago.jpg/800px-Lago.jpg' } },
  ] } },
  'titles=File%3ACanyon_Itaimbezinho_XI.jpg': {
    query: { pages: { 1: { imageinfo: [{
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Canyon_Itaimbezinho_XI.jpg/800px-Canyon_Itaimbezinho_XI.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Canyon_Itaimbezinho_XI.jpg',
      extmetadata: { Artist: { value: 'Vinicios de Moura' }, LicenseShortName: { value: 'CC BY-SA 3.0' } },
    }] } } },
  },
};
const chamadas = [];
const buscar = async (url) => {
  chamadas.push(url);
  const chave = Object.keys(respostas).find(k => url.includes(k));
  if (chave === undefined) throw new Error(`sem resposta simulada para ${url}`);
  return respostas[chave];
};

{
  const p = await paginaWiki('Cânion Itaimbezinho', buscar);
  ok('página com foto', [p.encontrado, p.titulo, p.foto.credito], [true, 'Cânion Itaimbezinho', 'Vinicios de Moura · CC BY-SA 3.0']);
  ok('foto é a miniatura de 800px', p.foto.url.includes('/800px-'), true);
  ok('fonte é a página do arquivo', p.foto.fonte, 'https://commons.wikimedia.org/wiki/File:Canyon_Itaimbezinho_XI.jpg');
  ok('pede 800px ao Commons', chamadas.some(u => u.includes('iiurlwidth=800')), true);

  ok('página que não existe', await paginaWiki('Lago Negro (Gramado)', buscar), { encontrado: false, titulo: 'Lago Negro (Gramado)' });
  const semFoto = await paginaWiki('Lago Negro', buscar);
  ok('página sem foto', [semFoto.encontrado, semFoto.foto], [true, null]);
  ok('desambiguação não conta', (await paginaWiki('Gramado (desambiguação)', buscar)).encontrado, false);

  const antes = chamadas.length;
  const achados = await buscarWiki('Lago Negro Gramado', buscar);
  ok('busca sem desambiguação', achados.map(p => p.titulo), ['Lago Negro']);
  ok('busca traz a miniatura', achados[0].miniatura.includes('/800px-'), true);
  ok('busca é um pedido só', chamadas.length - antes, 1);
}

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
