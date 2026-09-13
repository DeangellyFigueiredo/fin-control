import { parseAmount, parseDate, parseCSV, parseOFX, parseExtrato, chaveDuplicata }
  from '../src/lib/import.js';

let falhas = 0;
const ok = (n, real, esp) => {
  const a = JSON.stringify(real), b = JSON.stringify(esp);
  if (a !== b) { falhas++; console.log(`  FALHOU ${n}: ${a} != ${b}`); } else console.log(`  ok ${n}`);
};

ok('br milhar', parseAmount('1.234,56'), 1234.56);
ok('us milhar', parseAmount('1,234.56'), 1234.56);
ok('br simples', parseAmount('150,00'), 150);
ok('us simples', parseAmount('150.00'), 150);
ok('negativo', parseAmount('-1.234,56'), -1234.56);
ok('parenteses', parseAmount('(150,00)'), -150);
ok('com R$', parseAmount('R$ 1.234,56'), 1234.56);
ok('milhar sem decimal', parseAmount('1,500'), 1500);
ok('vazio', parseAmount(''), null);
ok('texto', parseAmount('Descricao'), null);

ok('dd/mm/aaaa', parseDate('05/09/2026'), '2026-09-05');
ok('aaaa-mm-dd', parseDate('2026-09-05'), '2026-09-05');
ok('dd-mm-aa', parseDate('05-09-26'), '2026-09-05');
ok('ofx compacto', parseDate('20260905120000[-3:GMT]'), '2026-09-05');
ok('mes invalido', parseDate('05/13/2026'), null);
ok('texto', parseDate('Uber'), null);

// Nubank: virgula, cabecalho, valor negativo para saida
const nubank = `date,category,title,amount
2026-09-05,transport,Uber* Trip,-32.90
2026-09-06,food,iFood,-89.50
2026-09-10,income,Transferencia recebida,1200.00`;
const a = parseCSV(nubank);
ok('nubank linhas', a.rows.length, 3);
ok('nubank primeira', a.rows[0], { date: '2026-09-05', description: 'Uber* Trip', amount: 32.9, type: 'EXPENSE' });
ok('nubank entrada', a.rows[2].type, 'INCOME');

// Itau: ponto-e-virgula, sem cabecalho, data br, valor br
const itau = `05/09/2026;PAG*NETFLIX;-39,90
06/09/2026;SALARIO EMPRESA LTDA;5.000,00`;
const b = parseCSV(itau);
ok('itau linhas', b.rows.length, 2);
ok('itau separador', b.colunas.separador, ';');
ok('itau sem cabecalho', b.colunas.cabecalho, false);
ok('itau valor br', b.rows[1].amount, 5000);

// campo com aspas e virgula dentro
const aspas = `Data,Descricao,Valor
05/09/2026,"MERCADO SAO JOSE, LTDA",-250,00`;
const c = parseCSV(aspas);
ok('aspas preservam a virgula', c.rows[0].description, 'MERCADO SAO JOSE, LTDA');

// vírgula como separador E decimal: os centavos orfaos voltam para o valor
const ambiguo = parseCSV(`Data,Descricao,Valor
05/09/2026,MERCADO,-250,00
06/09/2026,PADARIA,-30,50
10/09/2026,SALARIO,5000,00`);
ok('centavos nao se perdem', ambiguo.rows.map(r => r.amount), [250, 30.5, 5000]);
ok('tipo preservado', ambiguo.rows.map(r => r.type), ['EXPENSE', 'EXPENSE', 'INCOME']);
ok('descricao preservada', ambiguo.rows[1].description, 'PADARIA');

// coluna de dois digitos que NAO e centavo nao pode ser engolida
const naoMexe = parseCSV(`Data;Descricao;Parcela;Valor
05/09/2026;VIAGEM;03;-176,40`);
ok('parcela 03 continua coluna propria', naoMexe.rows[0].amount, 176.4);

const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905120000[-3:GMT]<TRNAMT>-32.90<FITID>001<MEMO>UBER *TRIP</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910<TRNAMT>1200.00<FITID>002<NAME>TED RECEBIDA<MEMO>DE FULANO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const d = parseOFX(ofx);
ok('ofx linhas', d.rows.length, 2);
ok('ofx saida', d.rows[0], { date: '2026-09-05', description: 'UBER *TRIP', amount: 32.9, type: 'EXPENSE', externalId: '001' });
ok('ofx junta name e memo', d.rows[1].description, 'TED RECEBIDA · DE FULANO');

ok('detecta ofx sozinho', parseExtrato(ofx).formato, 'ofx');
ok('detecta csv sozinho', parseExtrato(nubank).formato, 'csv');
ok('arquivo vazio', parseExtrato('').erro, 'Arquivo vazio');
ok('csv sem data', parseCSV('a,b\nx,y').erro, 'Nenhuma coluna com data reconhecível');

ok('duplicata igual', chaveDuplicata('2026-09-05', 32.9, 'Uber* Trip'), chaveDuplicata('2026-09-05T00:00:00Z', -32.90, 'UBER TRIP'));
ok('duplicata difere por valor', chaveDuplicata('2026-09-05', 32.9, 'Uber') === chaveDuplicata('2026-09-05', 33, 'Uber'), false);

console.log(falhas ? `\n${falhas} falha(s)` : '\ntodos passaram');
process.exit(falhas ? 1 : 0);
