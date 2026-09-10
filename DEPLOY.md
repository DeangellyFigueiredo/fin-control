# Subindo para a Vercel

## Antes de começar: dois avisos

**1. O app é de usuário único.** Nenhuma tabela tem `userId` — contas, transações,
cartões e recorrentes são globais. Qualquer conta que consiga logar enxerga
*todos* os seus dados financeiros. Por isso o cadastro público vem desligado
(`ALLOW_REGISTRATION`). Só ligue para criar a sua conta, e desligue em seguida.

**2. SQLite não funciona na Vercel.** O filesystem é efêmero e read-only, e cada
requisição pode cair numa instância diferente. O projeto foi convertido para
Postgres.

---

## 1. Criar o banco Postgres

Pelo painel da Vercel: **Storage → Create Database → Postgres** (é Neon por trás,
com plano gratuito). Ou direto no [neon.tech](https://neon.tech).

Você vai precisar de **duas** strings de conexão:

| Variável       | Qual usar                                    | Para quê                       |
| -------------- | -------------------------------------------- | ------------------------------ |
| `DATABASE_URL` | a **pooled** (host com `-pooler`)             | o app em runtime (serverless)  |
| `DIRECT_URL`   | a **direta** (mesmo host, **sem** `-pooler`)  | `prisma migrate` (DDL)         |

O pooler (pgbouncer) não executa DDL, por isso as migrations precisam da direta.

## 2. Gerar o `JWT_SECRET`

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Não reaproveite o segredo que está no `.env` local — ele já esteve em texto plano
numa conversa.

## 3. Configurar o ambiente local

Edite o `.env` (não vai para o Git):

```env
DATABASE_URL="postgresql://...-pooler.../planilha?sslmode=require"
DIRECT_URL="postgresql://.../planilha?sslmode=require"
JWT_SECRET="<o valor gerado acima>"
```

Aplique as migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

O seed agora é **opcional** — o passo a passo inicial (item 6) já cria as
categorias, as contas e o resto. Use o seed só se quiser criar o usuário por
linha de comando em vez de pela tela:

```bash
SEED_ADMIN_EMAIL="voce@email.com" SEED_ADMIN_PASSWORD="uma-senha-forte" npm run seed

# opcional: cartões e recorrentes de exemplo, para ver o app preenchido
SEED_DEMO=true npm run seed
```

No PowerShell, use `$env:SEED_ADMIN_EMAIL="..."` antes do comando. O seed é
idempotente: rodar duas vezes não duplica nada.

Rode `npm run dev` e confira que tudo carrega.

## 4. Publicar no GitHub

Ainda não existe remote. O repositório também nunca teve commit do código atual:

```bash
git add -A
git commit -m "Calendário dia a dia, pré-cadastro e migração para Postgres"
git remote add origin git@github.com:<seu-usuario>/planilha.git
git push -u origin master
```

Confirme que `.env` **não** foi junto: `git ls-files | grep "^.env$"` deve vir vazio
(só o `.env.example` é versionado).

## 5. Importar na Vercel

**Add New → Project → Import** o repositório. O Next.js é detectado sozinho;
não mexa em build command nem output directory.

Em **Environment Variables**, para *Production*, *Preview* e *Development*:

| Nome           | Valor                                  |
| -------------- | -------------------------------------- |
| `DATABASE_URL` | string pooled                          |
| `DIRECT_URL`   | string direta                          |
| `JWT_SECRET`   | o segredo gerado                       |

Se você criou o banco pelo Storage da Vercel, `DATABASE_URL` já vem preenchida —
só falta acrescentar `DIRECT_URL` e `JWT_SECRET`.

Clique em **Deploy**. O build roda `prisma generate && prisma migrate deploy && next build`,
então as migrations são aplicadas sozinhas.

## 6. Criar sua conta e fazer o cadastro inicial

Se você já rodou o seed com `SEED_ADMIN_*` apontando para o mesmo banco, a conta
já existe — é só logar e pular para o passo a passo abaixo.

Senão:

1. Adicione `ALLOW_REGISTRATION` = `true` nas variáveis e faça **Redeploy**.
2. Acesse a URL, clique em "Criar conta" e cadastre-se.
3. **Remova** `ALLOW_REGISTRATION` e faça **Redeploy** de novo.

O link "Criar conta" é renderizado no servidor: some da tela quando a variável sai.
Trocar variável de ambiente na Vercel exige redeploy para valer.

### O passo a passo inicial

No primeiro login o app leva direto para `/onboarding`, um wizard de 9 telas que
monta a base toda:

1. Como você quer ser chamado
2. Como está financeiramente
3. Contas bancárias e o saldo de cada uma
4. Quanto já tem guardado
5. Metas (com sugestões prontas)
6. Entradas do mês — uma linha por recebimento, com o dia (dia 5, dia 10, dia 20…)
7. Cartões — dia de pagamento e **melhor dia de compra**
8. Contas fixas — aluguel, luz, internet…
9. Resumo com a sobra projetada do mês

As categorias padrão são criadas junto, então não é preciso rodar o seed.
O que for digitado fica salvo como rascunho no navegador: dá para fechar e voltar
depois. Para revisar tudo mais tarde, use **Refazer cadastro** no menu lateral —
ele reabre o wizard já preenchido e atualiza os registros em vez de duplicar.

## 7. Usar no celular

Abra a URL no Chrome/Safari e use "Adicionar à tela de início". O app já tem
`theme-color`, `apple-web-app` e tratamento de safe-area, então abre em tela cheia
e sem cortes no notch.

---

## Manutenção

**Nova alteração no schema:**

```bash
npx prisma migrate dev --name descricao-da-mudanca
git add prisma/migrations prisma/schema.prisma
git commit -m "..." && git push
```

A Vercel aplica no próximo build.

**O `prisma/dev.db` (SQLite antigo) continua no disco**, fora do Git. Se tiver
algum lançamento lá que você queira preservar, tire antes de apagar — depois da
migração o app não lê mais esse arquivo.
