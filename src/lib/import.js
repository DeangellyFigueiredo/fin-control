/**
 * Leitura de extrato e fatura: CSV e OFX.
 *
 * Não existe um formato de CSV de banco brasileiro — existe um por banco.
 * Muda o separador, a ordem das colunas, o sinal do valor, o formato da data
 * e se há cabeçalho. Em vez de pedir "exporte no formato X", o parser olha o
 * arquivo e deduz: a coluna que parseia como data é a data, a que parseia
 * como número é o valor, a maior coluna de texto é a descrição.
 *
 * OFX é padronizado, mas é SGML dos anos 90: tag sem fechamento, valor solto
 * até o fim da linha.
 */

/** Valor monetário em pt-BR ("1.234,56") ou en-US ("1234.56"). */
export function parseAmount(raw) {
  const texto = String(raw ?? '').trim().replace(/\s|R\$| /g, '');
  if (!texto) return null;

  const negativo = /^-/.test(texto) || /^\(.*\)$/.test(texto);
  let limpo = texto.replace(/[()]/g, '').replace(/^-/, '');

  const temVirgula = limpo.includes(',');
  const temPonto = limpo.includes('.');

  if (temVirgula && temPonto) {
    // O último separador é o decimal: "1.234,56" e "1,234.56"
    limpo = limpo.lastIndexOf(',') > limpo.lastIndexOf('.')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo.replace(/,/g, '');
  } else if (temVirgula) {
    // "1,50" é decimal; "1,500" com três casas é milhar
    const depois = limpo.split(',')[1] || '';
    limpo = depois.length === 3 ? limpo.replace(/,/g, '') : limpo.replace(',', '.');
  }

  if (!/^\d*\.?\d+$/.test(limpo)) return null;

  const valor = parseFloat(limpo);
  return Number.isFinite(valor) ? (negativo ? -valor : valor) : null;
}

/** Data em dd/mm/aaaa, aaaa-mm-dd, dd-mm-aaaa ou aaaammdd. Devolve "aaaa-mm-dd". */
export function parseDate(raw) {
  const texto = String(raw ?? '').trim();
  if (!texto) return null;

  const iso = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return montaData(iso[1], iso[2], iso[3]);

  const br = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return montaData(ano, br[2], br[1]);
  }

  // OFX: 20260905 ou 20260905120000[-3:GMT]
  const ofx = texto.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) return montaData(ofx[1], ofx[2], ofx[3]);

  return null;
}

function montaData(ano, mes, dia) {
  const y = parseInt(ano, 10);
  const m = parseInt(mes, 10);
  const d = parseInt(dia, 10);
  if (!(y >= 1900 && y <= 2200) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Quebra uma linha de CSV respeitando aspas. */
function splitCSV(linha, sep) {
  const campos = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      // Aspas dobradas dentro do campo são uma aspa literal
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentroDeAspas = !dentroDeAspas;
    } else if (c === sep && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual.trim());
  return campos;
}

/** O separador mais provável: o que produz mais colunas de forma consistente. */
function detectaSeparador(linhas) {
  const candidatos = [';', ',', '\t', '|'];
  let melhor = { sep: ',', colunas: 0 };

  for (const sep of candidatos) {
    const contagens = linhas.slice(0, 10).map(l => splitCSV(l, sep).length);
    const min = Math.min(...contagens);
    // Só vale se todas as linhas tiverem o mesmo número de colunas
    if (min >= 2 && min === Math.max(...contagens) && min > melhor.colunas) {
      melhor = { sep, colunas: min };
    }
  }

  return melhor.colunas ? melhor.sep : ',';
}

/**
 * Conserta o arquivo em que a vírgula é separador E decimal ao mesmo tempo.
 *
 * "05/09/2026,PADARIA,-30,50" quebra em quatro campos, e o "50" fica órfão
 * numa coluna própria. Sem isto o valor entra como 30 — perde os centavos
 * em silêncio, que é o pior jeito de errar dinheiro.
 *
 * O sinal é uma coluna inteira de exatamente dois dígitos logo depois de uma
 * coluna numérica. Duas colunas legítimas dificilmente se parecem com isso.
 */
function juntaCentavosOrfaos(grade, sep) {
  if (sep !== ',') return grade;

  const colunas = Math.max(...grade.map(g => g.length));
  const corpo = grade.length > 1 ? grade.slice(1) : grade;

  for (let i = colunas - 1; i >= 1; i--) {
    const centavos = corpo.filter(l => /^\d{2}$/.test(String(l[i] ?? '').trim())).length;
    const numerico = corpo.filter(l => /^-?\(?\d[\d.]*\)?$/.test(String(l[i - 1] ?? '').trim())).length;

    if (centavos === corpo.length && numerico === corpo.length) {
      return grade.map(linha => {
        const copia = [...linha];
        // Reconstrói "-30" + "50" como "-30,50" e descarta a coluna órfã
        if (copia[i] !== undefined && copia[i - 1] !== undefined) {
          copia[i - 1] = `${copia[i - 1]},${copia[i]}`;
          copia.splice(i, 1);
        }
        return copia;
      });
    }
  }

  return grade;
}

export function parseCSV(texto) {
  const linhas = String(texto)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (!linhas.length) return { rows: [], erro: 'Arquivo vazio' };

  const sep = detectaSeparador(linhas);
  const grade = juntaCentavosOrfaos(linhas.map(l => splitCSV(l, sep)), sep);
  const colunas = Math.max(...grade.map(g => g.length));

  // A primeira linha é cabeçalho se nenhuma célula dela parecer data
  const temCabecalho = !grade[0].some(c => parseDate(c));
  const corpo = temCabecalho ? grade.slice(1) : grade;
  if (!corpo.length) return { rows: [], erro: 'Nenhuma linha de dados' };

  // Qual coluna é data, qual é valor: a que acerta mais vezes
  const acertos = (teste) => Array.from({ length: colunas }, (_, i) =>
    corpo.filter(linha => teste(linha[i])).length);

  const datas = acertos(c => parseDate(c));
  const colData = datas.indexOf(Math.max(...datas));
  if (datas[colData] === 0) return { rows: [], erro: 'Nenhuma coluna com data reconhecível' };

  // "Parseia como número" não basta para achar a coluna de valor: uma coluna
  // "Parcela 03" também parseia, e ganharia no empate. O que distingue
  // dinheiro é ter centavos, ter sinal, ou estar sob um cabeçalho que diz.
  const cabecalho = temCabecalho ? grade[0] : [];
  const DIZ_VALOR = /VALOR|AMOUNT|MONTANTE|QUANTIA|CREDITO|DEBITO|D[EÉ]BITO|CR[EÉ]DITO|ENTRADA|SAIDA|SA[IÍ]DA/i;

  const pontos = Array.from({ length: colunas }, (_, i) => {
    if (i === colData) return -Infinity;

    const celulas = corpo.map(l => String(l[i] ?? '').trim()).filter(Boolean);
    const numericas = celulas.filter(c => parseAmount(c) !== null);
    if (!numericas.length) return -Infinity;

    let score = numericas.length;
    if (DIZ_VALOR.test(String(cabecalho[i] ?? ''))) score += corpo.length * 3;
    // Centavos e sinal são marca de dinheiro, não de contador
    score += numericas.filter(c => /[.,]\d{1,2}$/.test(c)).length;
    score += numericas.filter(c => /^[-(]/.test(c)).length;
    // Inteiro de um ou dois dígitos em toda a coluna é índice, não valor
    if (numericas.every(c => /^\d{1,2}$/.test(c))) score -= corpo.length * 3;

    return score;
  });

  const melhorValor = Math.max(...pontos);
  if (melhorValor === -Infinity) return { rows: [], erro: 'Nenhuma coluna com valor reconhecível' };
  const colValor = { i: pontos.indexOf(melhorValor) };

  // Descrição: a coluna de texto mais longa, em média
  const tamanhos = Array.from({ length: colunas }, (_, i) =>
    (i === colData || i === colValor.i)
      ? -1
      : corpo.reduce((s, l) => s + (parseAmount(l[i]) === null ? String(l[i] ?? '').length : 0), 0));
  const colDesc = tamanhos.indexOf(Math.max(...tamanhos));

  const rows = [];
  for (const linha of corpo) {
    const date = parseDate(linha[colData]);
    const valor = parseAmount(linha[colValor.i]);
    if (!date || valor === null || valor === 0) continue;

    rows.push(montaLinha(date, linha[colDesc], valor));
  }

  return {
    rows,
    formato: 'csv',
    colunas: { data: colData, valor: colValor.i, descricao: colDesc, separador: sep, cabecalho: temCabecalho },
  };
}

export function parseOFX(texto) {
  const bruto = String(texto);
  const blocos = bruto.split(/<STMTTRN>/i).slice(1);

  if (!blocos.length) return { rows: [], erro: 'Nenhuma transação encontrada no OFX' };

  // Tag sem fechamento obrigatório: o valor vai até o fim da linha ou a
  // próxima tag, o que vier primeiro.
  const tag = (bloco, nome) => {
    const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };

  const rows = [];
  for (const bloco of blocos) {
    const date = parseDate(tag(bloco, 'DTPOSTED'));
    const valor = parseAmount(tag(bloco, 'TRNAMT'));
    if (!date || valor === null || valor === 0) continue;

    // MEMO costuma ser mais descritivo que NAME; quando há os dois, junta.
    const name = tag(bloco, 'NAME');
    const memo = tag(bloco, 'MEMO');
    const descricao = [name, memo].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');

    rows.push({ ...montaLinha(date, descricao, valor), externalId: tag(bloco, 'FITID') || null });
  }

  return { rows, formato: 'ofx' };
}

function montaLinha(date, descricao, valor) {
  return {
    date,
    description: String(descricao ?? '').replace(/\s+/g, ' ').trim() || 'Sem descrição',
    amount: Math.abs(valor),
    // Sinal negativo é saída. Extrato de fatura de cartão às vezes vem com
    // tudo positivo; nesse caso a tela deixa inverter tudo de uma vez.
    type: valor < 0 ? 'EXPENSE' : 'INCOME',
  };
}

/** Escolhe o parser pelo conteúdo, não pela extensão — que mente com frequência. */
export function parseExtrato(texto) {
  return /<OFX|<STMTTRN/i.test(String(texto).slice(0, 4000))
    ? parseOFX(texto)
    : parseCSV(texto);
}

/**
 * Chave de duplicata: mesma data, mesmo valor, mesma descrição.
 *
 * Importar o mesmo arquivo duas vezes é o erro mais fácil de cometer, e o
 * mais chato de desfazer à mão.
 */
export function chaveDuplicata(date, amount, description) {
  const dia = String(date).slice(0, 10);
  const centavos = Math.round(Math.abs(Number(amount) || 0) * 100);
  const desc = String(description || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
  return `${dia}|${centavos}|${desc}`;
}
