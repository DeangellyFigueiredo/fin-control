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

/**
 * Acha o separador E onde a tabela começa, de uma vez só.
 *
 * Extrato de banco quase nunca começa na linha 1. O do Inter abre com quatro
 * linhas de cabeçalho do documento:
 *
 *   Extrato Conta Corrente
 *   Conta ;72385499
 *   Período ;19/08/2026 a 17/09/2026
 *   Saldo ;1.992,51
 *   (vazia)
 *   Data Lançamento;Histórico;Descrição;Valor;Saldo   <- a tabela começa aqui
 *
 * A versão anterior exigia que TODAS as linhas tivessem o mesmo número de
 * colunas, então esse preâmbulo a fazia desistir do ";" e cair no ",", que
 * não separa nada — e o arquivo inteiro virava lixo.
 *
 * Agora a tabela é o maior trecho CONTÍNUO de linhas com a mesma quantidade
 * de colunas. O preâmbulo fica de fora por não ter a forma da tabela, e o
 * mesmo vale para um rodapé de totais.
 */
function acharTabela(linhas) {
  const candidatos = [';', ',', '\t', '|'];
  let melhor = { sep: ',', inicio: 0, fim: linhas.length, colunas: 0, tamanho: 0 };

  for (const sep of candidatos) {
    const contagens = linhas.map(l => splitCSV(l, sep).length);

    let i = 0;
    while (i < contagens.length) {
      const colunas = contagens[i];
      let j = i;
      while (j < contagens.length && contagens[j] === colunas) j++;

      const tamanho = j - i;
      // Mais linhas ganha; empatado, mais colunas — um separador que quebra o
      // arquivo em cinco colunas explica mais do que um que quebra em duas.
      const vence = colunas >= 2 && (
        tamanho > melhor.tamanho
        || (tamanho === melhor.tamanho && colunas > melhor.colunas)
      );

      if (vence) melhor = { sep, inicio: i, fim: j, colunas, tamanho };
      i = j;
    }
  }

  return melhor;
}

/**
 * Coluna de saldo acumulado, que não é o valor do lançamento.
 *
 * Um extrato traz as duas: "Valor" é quanto entrou ou saiu, "Saldo" é quanto
 * ficou na conta. As duas parecem dinheiro, e escolher a errada faz todo
 * lançamento entrar com o saldo do dia em vez do próprio valor.
 *
 * O que distingue não é a aparência, é uma relação aritmética: num extrato, a
 * diferença entre dois saldos seguidos É o valor de um deles. Quando isso se
 * confirma na maioria das linhas, não sobra dúvida sobre qual é qual.
 */
function ehSaldoAcumulado(coluna, colunaValor, corpo) {
  if (coluna === colunaValor || corpo.length < 4) return false;

  let confere = 0;
  let testadas = 0;

  for (let i = 0; i < corpo.length - 1; i++) {
    const a = parseAmount(corpo[i][coluna]);
    const b = parseAmount(corpo[i + 1][coluna]);
    const valor = parseAmount(corpo[i][colunaValor]);
    const valorSeguinte = parseAmount(corpo[i + 1][colunaValor]);

    if (a === null || b === null || valor === null) continue;
    testadas++;

    // O arquivo pode vir do mais novo para o mais velho ou o contrário; nos
    // dois casos a diferença bate com o valor de uma das duas linhas.
    const diferenca = a - b;
    if (Math.abs(diferenca - valor) < 0.011
      || (valorSeguinte !== null && Math.abs(diferenca + valorSeguinte) < 0.011)) {
      confere++;
    }
  }

  return testadas >= 3 && confere / testadas >= 0.7;
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
  const todas = String(texto)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (!todas.length) return { rows: [], erro: 'Arquivo vazio' };

  // Onde a tabela começa, e com que separador. O preâmbulo do extrato — nome
  // do banco, número da conta, período — fica de fora.
  const tabela = acharTabela(todas);
  const linhas = todas.slice(tabela.inicio, tabela.fim);
  const sep = tabela.sep;

  const grade = juntaCentavosOrfaos(linhas.map(l => splitCSV(l, sep)), sep);
  const colunas = Math.max(...grade.map(g => g.length));

  // A primeira linha é cabeçalho se nenhuma célula dela parecer data
  const temCabecalho = !grade[0].some(c => parseDate(c));
  const corpo = temCabecalho ? grade.slice(1) : grade;
  if (!corpo.length) return { rows: [], erro: 'Nenhuma linha de dados' };

  // Qual coluna é data: a que acerta mais vezes
  const datas = Array.from({ length: colunas }, (_, i) =>
    corpo.filter(linha => parseDate(linha[i])).length);

  const colData = datas.indexOf(Math.max(...datas));
  if (datas[colData] === 0) return { rows: [], erro: 'Nenhuma coluna com data reconhecível' };

  // "Parseia como número" não basta para achar a coluna de valor: uma coluna
  // "Parcela 03" também parseia, e ganharia no empate. O que distingue
  // dinheiro é ter centavos, ter sinal, ou estar sob um cabeçalho que diz.
  const cabecalho = temCabecalho ? grade[0] : [];
  const DIZ_VALOR = /VALOR|AMOUNT|MONTANTE|QUANTIA|CREDITO|DEBITO|D[EÉ]BITO|CR[EÉ]DITO|ENTRADA|SAIDA|SA[IÍ]DA/i;
  const DIZ_SALDO = /SALDO|BALANCE|ACUMULADO/i;

  const pontuar = (i) => {
    if (i === colData) return -Infinity;

    const celulas = corpo.map(l => String(l[i] ?? '').trim()).filter(Boolean);
    const numericas = celulas.filter(c => parseAmount(c) !== null);
    if (!numericas.length) return -Infinity;

    let score = numericas.length;
    if (DIZ_VALOR.test(String(cabecalho[i] ?? ''))) score += corpo.length * 3;
    // "Saldo" no cabeçalho é a dica mais barata de que aquela coluna é o
    // acumulado, e não o lançamento
    if (DIZ_SALDO.test(String(cabecalho[i] ?? ''))) score -= corpo.length * 3;
    // Centavos e sinal são marca de dinheiro, não de contador
    score += numericas.filter(c => /[.,]\d{1,2}$/.test(c)).length;
    score += numericas.filter(c => /^[-(]/.test(c)).length;
    // Inteiro de um ou dois dígitos em toda a coluna é índice, não valor
    if (numericas.every(c => /^\d{1,2}$/.test(c))) score -= corpo.length * 3;

    return score;
  };

  const pontos = Array.from({ length: colunas }, (_, i) => pontuar(i));
  const melhorValor = Math.max(...pontos);
  if (melhorValor === -Infinity) return { rows: [], erro: 'Nenhuma coluna com valor reconhecível' };

  let colValor = pontos.indexOf(melhorValor);

  // Se a escolhida for o saldo acumulado — o que a aritmética prova, não o
  // cabeçalho — a segunda colocada assume.
  const numericas = pontos
    .map((p, i) => ({ p, i }))
    .filter(x => x.p > -Infinity)
    .sort((a, b) => b.p - a.p);

  for (const alternativa of numericas) {
    if (alternativa.i === colValor) continue;
    if (ehSaldoAcumulado(colValor, alternativa.i, corpo)) {
      colValor = alternativa.i;
      break;
    }
  }

  // As colunas de saldo saem da disputa pela descrição junto com as demais
  // numéricas: o que sobra é texto.
  const colunasDeTexto = Array.from({ length: colunas }, (_, i) => i)
    .filter(i => i !== colData && i !== colValor)
    .map(i => ({
      i,
      // Quanto texto não-numérico a coluna carrega, somado no arquivo todo
      peso: corpo.reduce((s, l) => s + (parseAmount(l[i]) === null ? String(l[i] ?? '').length : 0), 0),
    }))
    .filter(x => x.peso > 0)
    .sort((a, b) => b.peso - a.peso)
    // Duas no máximo, e na ordem em que aparecem no arquivo: um extrato traz
    // o tipo numa ("Pix enviado") e a contraparte na outra ("Fulano"), e as
    // duas juntas é que descrevem o lançamento. Mais do que duas começaria a
    // arrastar número de documento e código de agência para dentro.
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
    .map(x => x.i);

  const rows = [];
  for (const linha of corpo) {
    const date = parseDate(linha[colData]);
    const valor = parseAmount(linha[colValor]);
    if (!date || valor === null || valor === 0) continue;

    rows.push(montaLinha(date, descricaoDe(linha, colunasDeTexto), valor));
  }

  return {
    rows,
    formato: 'csv',
    colunas: {
      data: colData,
      valor: colValor,
      descricao: colunasDeTexto,
      separador: sep,
      cabecalho: temCabecalho,
      // Quantas linhas NÃO VAZIAS do topo eram preâmbulo — as em branco já
      // foram descartadas antes. Serve para a tela poder dizer o que pulou.
      preambulo: tabela.inicio,
    },
  };
}

/** Junta as colunas de texto numa descrição só, sem repetir o que é igual. */
function descricaoDe(linha, colunas) {
  const partes = colunas
    .map(i => String(linha[i] ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((v, i, todas) => todas.findIndex(o => o.toUpperCase() === v.toUpperCase()) === i);

  return partes.join(' · ');
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
