# Operação e deploy

O app **já está no ar** na Vercel, ligado a um Postgres no Neon. Este documento
descreve como ele está montado, o que fazer no dia a dia e como refazer o
ambiente do zero se precisar.

---

## Como funciona o acesso

**Cada usuário enxerga apenas os próprios dados.** Todas as tabelas têm dono
(`userId`), e o filtro é injetado num ponto só — `src/lib/db.js` devolve um
cliente Prisma escopado que aplica o dono em toda leitura e escrita, inclusive
dentro de transações. As rotas nem mencionam `userId`.

Além disso, `assertOwned` valida as chaves estrangeiras que chegam no corpo da
requisição. Sem isso seria possível criar um lançamento próprio apontando para a
conta ou o investimento de outra pessoa, e o `include` da relação devolveria
dados alheios.

**O cadastro é por convite.** Quem tiver o valor de `INVITE_CODE` cria conta.
Sem a variável configurada, o cadastro fica fechado e o link "Criar conta" nem
aparece na tela de login.

> **Atenção:** consultas cruas (`$queryRaw`) **não** passam pelo cliente
> escopado — extensões do Prisma não as interceptam. Hoje o projeto não usa
> nenhuma; se um dia precisar, o filtro de dono tem que ir na mão.

---

## Variáveis de ambiente

As mesmas no `.env` local e na Vercel, com valores diferentes.

| Variável       | Obrigatória | Para quê                                                   |
| -------------- | ----------- | ---------------------------------------------------------- |
| `DATABASE_URL` | sim         | Conexão **pooled** (host com `-pooler`), usada em runtime   |
| `DIRECT_URL`   | sim         | Conexão **direta**, usada pelo `prisma migrate`             |
| `JWT_SECRET`   | sim         | Assina o cookie de sessão                                   |
| `INVITE_CODE`  | não         | Libera o cadastro para quem tiver o código                  |

O pooler (pgbouncer) não executa DDL, por isso as migrations precisam da direta.
As duas strings são iguais fora o `-pooler` no host.

### Duas coisas fáceis de errar

**`JWT_SECRET` precisa estar nos três ambientes** — Production, Preview e
Development. Em produção o código **não** tem valor de reserva: como o
repositório é público, um fallback fixo deixaria qualquer pessoa forjar um
cookie de sessão caso a variável faltasse. Sem a variável, em produção ninguém
autentica — o comportamento seguro, mas que quebra o Preview se você configurar
só o Production. (Em desenvolvimento há um valor local, para o `npm run dev`
funcionar sem configuração.)

**Trocar variável na Vercel exige redeploy.** Elas são lidas no build.

---

## Rodando localmente

O `.env` não vai para o Git (só o `.env.example`). Preencha com as strings do
Neon e um `JWT_SECRET` próprio, e então:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

**Sempre rode `prisma generate` depois de `migrate deploy`.** O `migrate` aplica
o SQL mas não regenera o client, e o app quebra com "Unknown field" até você
gerar. No Windows, o `next dev` segura a DLL do engine: pare o servidor antes,
senão o `generate` falha com `EPERM`.

### Testes

```bash
npm test
```

Roda sem framework nenhum: `node tests/run.mjs` executa cada `*.test.mjs` e
devolve código 1 se algo falhar. A cobertura é deliberadamente estreita — só a
aritmética que erra em silêncio:

| Arquivo | O que protege |
| ------- | ------------- |
| `scope.test.mjs`        | Usuário e carteira nunca ficarem de fora de uma consulta |
| `pendencies.test.mjs`   | A previsão vencida não sumir do saldo, e o cadastro não inventar cobrança retroativa |
| `investments.test.mjs`  | Reconstruir a curva do saldo a partir do histórico, e derivar o rendimento do valor digitado |
| `installments.test.mjs` | Centavos que não dividem, dia 31 em mês de 30, cadastro de compra já em andamento |
| `import.test.mjs`       | Valor em pt-BR e en-US, separador do CSV, centavos órfãos, duplicatas |
| `insights.test.mjs`     | Prazo de fatura por cartão, e a parcela do cartão não somar duas vezes |
| `categorize.test.mjs`   | Normalização, extração do padrão, precedência entre regras |

Nenhum deles toca o banco nem sobe servidor, então rodam em menos de um segundo.
O resto se verifica usando o app.

### Sobre o banco de desenvolvimento

Hoje o `.env` local aponta para o **mesmo banco da produção**. É o mais simples
para um app pessoal, e funciona — mas significa que mexer localmente mexe no
dado real. Se quiser separar, o Neon tem branches de banco gratuitos: crie um
branch de dev e aponte o `.env` local para ele.

O `prisma/dev.db` (SQLite do começo do projeto) ainda está no disco, fora do
Git. Não é mais lido por nada; pode apagar quando quiser.

---

## Carteiras

Uma carteira é um conjunto de finanças olhado separado — a pessoa física e a
PJ, tipicamente. **Não é um segundo usuário:** é o mesmo login, com dois
conjuntos de dados que não se misturam. O seletor fica no topo do menu lateral.

Cada carteira tem as próprias contas, cartões, lançamentos, categorias,
recorrentes, parcelas, metas e investimentos. O que é preferência de quem usa
— tema, esconder valores, cores do calendário — fica no usuário e vale nas
duas.

### Como o escopo é garantido

`src/lib/db.js` injeta **dois** filtros em toda consulta:

- `userId` é segurança. Sempre ligado, sem exceção e sem interruptor.
- `walletId` é contexto. Separa a PF da PJ.

Eles são independentes de propósito. Se compartilhassem o mesmo interruptor, o
dia em que alguém abrir uma visão consolidada abriria também a porta entre
usuários. `userDb()` estoura se qualquer um dos dois faltar — é melhor a
requisição cair do que devolver um número que mistura as duas carteiras.

`Wallet` não passa por essa extensão; quem mexe em carteira usa `walletsOf()`,
que filtra o dono explicitamente.

### Onde a carteira ativa fica guardada

Dentro do token JWT, não num cookie separado. Cookie solto é editável pelo
cliente; dentro do token é lacrado. E evita uma consulta ao Neon (~350ms) em
toda requisição só para descobrir o contexto.

O preço é que trocar de carteira exige reassinar o token, o que
`POST /api/wallets/switch` faz depois de conferir o dono.

### Criando uma carteira de empresa

Menu lateral → **Carteiras** → Nova carteira → tipo **Empresa**. Ela nasce com
categorias de PJ (faturamento, DAS, INSS, contador, pró-labore, distribuição
de lucros) em vez das de pessoa física. O tipo não muda depois, porque as
categorias já terão sido criadas.

Para preencher a carteira nova com contas, cartões e recorrentes de uma vez,
troque para ela e use **Refazer cadastro** — o passo a passo escreve sempre na
carteira aberta.

### Apagar

Apagar uma carteira apaga em cascata tudo que está dentro dela. Por isso a tela
exige o nome digitado por extenso, e a última carteira não pode ser apagada.

## Convidando alguém

1. Gere um código:
   ```bash
   node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))"
   ```
2. Coloque em `INVITE_CODE` na Vercel e faça **Redeploy**.
3. Passe a URL e o código. A pessoa clica em "Criar conta", informa o código,
   nome, email e senha (mínimo 8 caracteres).

É **um código compartilhado**, sem validade e sem registro de quem usou. Serve
para quantas pessoas você quiser. Para "revogar", troque a variável e faça
redeploy: quem já tem conta continua entrando, só cadastros novos param.

### O passo a passo inicial

No primeiro login o app leva para `/onboarding`, um wizard de 9 telas:

1. Como a pessoa quer ser chamada
2. Como está financeiramente
3. Contas bancárias e o saldo de cada uma
4. Quanto já tem guardado
5. Metas (com sugestões prontas)
6. Entradas do mês — uma linha por recebimento, com o dia
7. Cartões — dia de pagamento e **melhor dia de compra**
8. Contas fixas — aluguel, luz, internet…
9. Resumo com a sobra projetada do mês

As 21 categorias padrão são criadas junto, por usuário. O que for digitado fica
salvo como rascunho no navegador: dá para fechar e voltar depois. Para revisar
mais tarde, **Refazer cadastro** no menu reabre o wizard preenchido e atualiza os
registros em vez de duplicar.

---

## No celular

Abra a URL e use "Adicionar à tela de início". O app tem manifest, ícones
próprios (inclusive *maskable*, que o Android recorta em círculo), `theme-color`
e tratamento de safe-area, então abre em tela cheia e sem cortes no notch.

**Instalar exige HTTPS** — pela rede local (`http://192.168.x.x:3000`) o manifest
é ignorado. Para testar de verdade, use a URL da Vercel.

Não há service worker, e isso tem um lado bom: **toda atualização aparece
sozinha** na próxima vez que o app abrir, sem cache teimando numa versão antiga.
O que **não** atualiza é o ícone e o manifest — o sistema os copia no momento da
instalação, então mudá-los exige remover e adicionar de novo.

---

## Manutenção

### Alteração de schema

```bash
npx prisma migrate dev --name descricao-da-mudanca
npx prisma generate
git add prisma/ && git commit -m "..." && git push
```

A Vercel roda `prisma generate && prisma migrate deploy && next build`, então a
migration é aplicada no próximo deploy. São 9 até agora.

### Seed

Opcional — o passo a passo inicial cria tudo. Serve para criar um usuário por
linha de comando ou popular exemplos:

```bash
SEED_ADMIN_EMAIL="voce@email.com" SEED_ADMIN_PASSWORD="uma-senha-forte" npm run seed
SEED_DEMO=true npm run seed   # cartões e recorrentes de exemplo
```

No PowerShell, use `$env:SEED_ADMIN_EMAIL="..."` antes do comando. É idempotente:
rodar duas vezes não duplica nada.

### Região

O `vercel.json` fixa as funções em `gru1` (São Paulo), mesma região do Neon.
Isso não é detalhe: cada consulta ao banco custa um round-trip, e com as funções
nos EUA cada uma atravessaria o continente duas vezes. Da rede doméstica esse
round-trip mede ~350 ms; na mesma região, poucos milissegundos.

### Trocar segredos

Vale rodar periodicamente, e obrigatoriamente se algum vazar:

- **Senha do Neon:** painel → Roles → reset. Atualize `DATABASE_URL` e
  `DIRECT_URL` nos dois lugares (`.env` e Vercel).
- **`JWT_SECRET`:** gere um novo. Todas as sessões caem e as pessoas logam de
  novo — nenhum dado se perde.
- **`INVITE_CODE`:** troque quando quiser fechar a porta.

### Apagar um usuário

As relações são `onDelete: Cascade`, então apagar o usuário leva junto contas,
lançamentos, cartões, dívidas e metas dele. Não há tela para isso; é pelo banco.
