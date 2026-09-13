/**
 * Runner sem dependência: node tests/run.mjs
 *
 * Não há framework de teste no projeto de propósito — estes arquivos cobrem
 * só a aritmética que quebra em silêncio (centavos de parcela, valor de CSV,
 * prazo de fatura), onde um erro vira dinheiro errado na tela sem ninguém
 * perceber. O resto é verificado rodando o app.
 */
import { readdir } from 'fs/promises';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const aqui = dirname(fileURLToPath(import.meta.url));
const arquivos = (await readdir(aqui)).filter(f => f.endsWith('.test.mjs')).sort();

let falhou = false;

for (const arquivo of arquivos) {
  console.log(`\n--- ${arquivo} ---`);
  const code = await new Promise(resolve => {
    const p = spawn(process.execPath, [join(aqui, arquivo)], { stdio: 'inherit' });
    p.on('close', resolve);
  });
  if (code !== 0) falhou = true;
}

console.log(falhou ? '\nHOUVE FALHA' : `\n${arquivos.length} arquivos, tudo passou`);
process.exit(falhou ? 1 : 0);
