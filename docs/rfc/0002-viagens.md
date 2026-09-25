# RFC 0002 — Viagens

**Status:** fases 1 e 2 implementadas; fase 3 em proposta
**Data:** 25/09/2026
**Escopo:** `Trip`, `TripMember`, `TripEntry`, `TripInvite` (modelos novos), rotas
`/api/trips/*`, páginas `/trips/*`, lançamento rápido, tela de login

---

## O problema

Uma viagem tem um orçamento próprio, um começo e um fim. Durante ela, a pergunta
que importa não é "como está o mês", e sim **"quanto ainda posso gastar hoje"**.
Nada no app responde isso: os baldes olham o mês inteiro, e a viagem se dilui
nos variáveis.

E a viagem é a dois. Metade dos gastos sai do cartão de outra pessoa, que também
usa o app, com a conta dela. Hoje não existe nenhum caminho para duas pessoas
verem o mesmo número — de propósito, porque o `db.js` existe para impedir isso.

---

## O que já existe, e por que não basta

### Um `tripId` no `Transaction` não cobre o cartão

A primeira ideia seria etiquetar lançamentos. Não fecha, por um motivo do modelo:

- **Compra no cartão não é um `Transaction`.** O cartão entra no app pelo valor
  da fatura (`CardBill.amount`), e os baldes a decompõem em parcelas e
  variáveis. Um jantar pago no cartão não tem linha própria para receber uma
  etiqueta — e se ganhasse uma, somaria com a fatura e contaria o dinheiro duas
  vezes.
- **Parcela não é um `Transaction`.** `installments.js` calcula na hora; a
  passagem em 10x não tem dez linhas gravadas.

Na viagem, os dois casos são justamente os mais comuns: passagem parcelada e
gastos no cartão.

### O escopo proíbe ler dados de outra pessoa

`userDb` injeta `userId` em toda consulta, sem interruptor. É o comportamento
certo e não deve mudar. A viagem compartilhada precisa de uma porta **estreita,
separada e testada**, e não de um afrouxamento do filtro.

---

## A proposta

### A viagem tem seus próprios lançamentos

Um `TripEntry` é o gasto **do ponto de vista da viagem**: data, valor,
descrição, categoria da viagem, quem pagou e **como** pagou. O "como" decide se
o gasto também é um movimento de caixa:

| Forma | O que acontece no resto do app |
| --- | --- |
| **Conta** (pix, débito, boleto) | Cria também um `Transaction` na conta de quem pagou, ligado pelo `transactionId` |
| **Cartão** | Nada. O dinheiro sai pela fatura, que já é contada |
| **Dinheiro vivo** | Nada. O saque já foi um lançamento |

Para quem lança, é um formulário só. O caso "Conta" continua aparecendo nos
baldes e no extrato como qualquer outro gasto; os outros dois ficam só na
viagem, que é onde eles faltavam.

### A outra pessoa nunca lê `transactions`

Esta é a regra de segurança do desenho inteiro:

> O compartilhamento vive **só** nas tabelas `trip_*`. Nenhuma consulta feita em
> nome de um participante toca `transactions`, `bank_accounts`, `credit_cards`
> ou qualquer modelo escopado de outro usuário.

Por isso o `TripEntry` guarda **cópia** de data, valor e descrição, mesmo quando
tem um `Transaction` ligado. A cópia custa um ponto de sincronia (ver abaixo);
em troca, a fronteira fica fácil de auditar. Basta verificar que nenhuma rota
`/api/trips/*` importa `userDb` para ler dados de outra pessoa.

A sincronia é de mão única e fica num lugar só: editar ou apagar o
`Transaction` pela tela de transações atualiza ou apaga o `TripEntry` dentro do
mesmo `$transaction`. O apagar vem de graça pela FK com `onDelete: Cascade`.

### Categorias próprias da viagem

As categorias do app são por carteira, então a sua "Alimentação" e a dela são
linhas diferentes, com ids diferentes. A viagem usa uma lista fixa, igual para
os dois:

`Transporte` · `Hospedagem` · `Alimentação` · `Passeios` · `Compras` · `Outros`

O `Transaction` criado no caso "Conta" continua recebendo a categoria normal do
app, pelas regras de sempre (`rules.js`).

### Antes, durante e depois

A data do gasto decide a fase, sem campo extra:

- **Preparação:** antes da ida. Passagem, hotel, seguro.
- **Destino:** entre a ida e a volta, inclusive.
- **Depois:** após a volta, como o Uber do aeroporto para casa. Soma no total,
  mas não mexe no limite diário, que já terminou.

### O limite diário

```
reservaPreparação  = campo opcional da viagem (quanto separar para passagem/hotel)
orçamentoDestino   = orçamento − max(reservaPreparação, gastoPreparação)
limitePlanejado    = orçamentoDestino ÷ dias da viagem
limiteHoje         = (orçamentoDestino − gastoDestino FORA DE HOJE) ÷ dias que faltam, contando hoje
```

Dois detalhes que fazem diferença:

- **Tudo menos hoje.** Se o gasto de hoje entrasse na conta, o limite de hoje
  encolheria a cada café, e o número ficaria sem sentido. Hoje a tela mostra
  "limite R$ 240 · gasto hoje R$ 90 · resta R$ 150". Os dias seguintes entram:
  um passeio já pago para depois de amanhã é dinheiro comprometido.
- **`max(reserva, gasto)`.** Se a passagem ainda não foi comprada, o limite do
  destino não pode contar com o dinheiro dela. Se saiu mais cara que a reserva,
  o excesso sai do destino.

**Entradas** (reembolso, alguém pagando a parte dele) abatem da fase em que
caem.

### Participantes e o convite

Todo participante tem uma linha em `TripMember`, **inclusive quem criou**, com
`role = OWNER`. Assim toda checagem de acesso é a mesma pergunta: "existe
`TripMember` para este usuário nesta viagem?". Já na fase 1, com uma pessoa só,
o acesso passa por esse caminho. A fase 2 só acrescenta o convite.

O convite:

1. O dono clica em "Convidar". O servidor gera 32 bytes aleatórios
   (`base64url`), guarda **só o SHA-256** em `TripInvite` e devolve o link
   `/trips/invite/<token>` uma única vez.
2. O link vale **uma vez** e **expira em 7 dias**. O dono pode revogar antes.
3. Quem abre sem estar logado vai para `/login?next=/trips/invite/<token>` e
   volta para o convite depois de entrar.
4. A tela mostra "Fulano te convidou para *Nome da viagem*", com os botões
   aceitar e recusar. Aceitar cria o `TripMember` e marca o convite como usado.

Detalhes de segurança:

- **Uso único sem corrida:** o aceite é `updateMany where { tokenHash, usedAt: null,
  revokedAt: null, expiresAt > agora }`. Se `count` vier 0, o convite é
  inválido, e quem chega em segundo perde.
- **Uma mensagem só** para token inexistente, usado, revogado ou expirado:
  "Convite inválido ou expirado".
- **Participação antes da validade:** quem já está na viagem é só levado a
  ela. O dono testando o próprio link não gasta o convite, e quem aceitou e
  clica de novo no link usado não recebe um "inválido" sem sentido.
- **Recusar** revoga o convite: o link deixa de valer para qualquer pessoa.
- **A página do convite** responde com `Referrer-Policy: no-referrer`, para o
  token não vazar em links externos.
- **O `next` do login** só aceita caminho interno: precisa começar com `/` e não
  pode começar com `//` nem conter `\`. Qualquer outro valor vira `/`. Sem
  isso, o login vira um redirecionador aberto.

### Quem pode o quê

| | Dono | Participante |
| --- | --- | --- |
| Ver a viagem e todos os gastos dela | ✅ | ✅ |
| Lançar gasto | ✅ o seu | ✅ o seu |
| Editar ou apagar um gasto | só os seus | só os seus |
| Mudar nome, datas e orçamento | ✅ | ❌ |
| Ligar/desligar o acerto e ajustar as partes | ✅ | ✅ |
| Convidar, revogar convite, remover alguém | ✅ | ❌ |
| Sair da viagem | — | ✅ |
| Apagar a viagem | ✅ | ❌ |

"Os seus" é garantido na consulta, não na tela: `where: { id, tripId, userId: eu }`.

**Apagar um gasto pago pela Conta** apaga também o lançamento na conta. Os
dois nasceram juntos, e deixar o lançamento sozinho manteria no saldo um
pagamento que a pessoa acabou de dizer que não existe. A confirmação avisa.
Quando a importação de extrato puder ligar lançamentos já existentes (fase
3), entra também a opção "tirar da viagem", que só desfaz o vínculo.

**Sair ou ser removido** apaga os `TripEntry` daquela pessoa na viagem. Os
`Transaction` ligados continuam na conta dela: o dinheiro saiu de fato, só
deixa de fazer parte da viagem. A confirmação diz isso com todas as letras.

**Apagar a viagem** leva junto participantes, gastos e convites (cascata). Os
`Transaction` ligados ficam, como acima.

---

## Modelo de dados

```prisma
model Trip {
  id          String   @id @default(uuid())
  name        String
  startDate   DateTime @map("start_date")
  endDate     DateTime @map("end_date")
  budget      Float
  // Quanto do orçamento fica para passagem/hotel. Zero = não separar.
  prepBudget  Float    @default(0) @map("prep_budget")
  // Fase 3. Acerto entre participantes ligado ou não. Escolha de quem viaja:
  // tem casal que divide tudo, tem casal que não quer conta de quem pagou o quê.
  settleUp    Boolean  @default(false) @map("settle_up")
  ownerId     String   @map("owner_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  owner   User         @relation("TripOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members TripMember[]
  entries TripEntry[]
  invites TripInvite[]

  @@map("trips")
}

model TripMember {
  id       String   @id @default(uuid())
  tripId   String   @map("trip_id")
  userId   String   @map("user_id")
  role     String   @default("MEMBER") // OWNER ou MEMBER
  // Parte no acerto, em peso relativo. Nulo = partes iguais. Fase 3.
  share    Float?
  joinedAt DateTime @default(now()) @map("joined_at")

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tripId, userId])
  @@index([userId])
  @@map("trip_members")
}

model TripEntry {
  id          String   @id @default(uuid())
  tripId      String   @map("trip_id")
  userId      String   @map("user_id")   // quem pagou
  date        DateTime
  amount      Float
  type        String                     // EXPENSE ou INCOME
  description String   @default("")
  category    String                     // uma das categorias fixas da viagem
  method      String                     // CONTA, CARTAO ou DINHEIRO
  // Só no método CONTA. Unique: um lançamento pertence a no máximo uma viagem.
  transactionId String? @unique @map("transaction_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  trip        Trip         @relation(fields: [tripId], references: [id], onDelete: Cascade)
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  transaction Transaction? @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  @@index([tripId, date])
  @@map("trip_entries")
}

model TripInvite {
  id          String    @id @default(uuid())
  tripId      String    @map("trip_id")
  tokenHash   String    @unique @map("token_hash")
  createdById String    @map("created_by_id")
  expiresAt   DateTime  @map("expires_at")
  usedAt      DateTime? @map("used_at")
  usedById    String?   @map("used_by_id")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@map("trip_invites")
}
```

Nenhum dos quatro entra em `SCOPED_MODELS`. Eles não têm `walletId`, porque a
viagem é da pessoa e não da carteira. Também não pertencem a um único
`userId`, porque são compartilhados. O acesso é feito por `src/lib/trips.js`.

**Passagem parcelada:** entra como **um** `TripEntry` pelo valor total, método
Cartão, na data da compra. A viagem quer saber quanto custou; em quantos meses
a fatura vai cobrar é assunto de `Installment`, que continua sendo cadastrado à
parte, como hoje.

---

## Código

### A porta entre usuários: `src/lib/tripAccess.js` e `src/lib/trips.js`

São dois arquivos porque o cálculo também roda no navegador: a tela calcula
o resumo com o "hoje" do aparelho de quem olha, e um arquivo que importa o
Prisma não pode ir para o cliente.

- **Acesso (`tripAccess.js`, só no servidor):**
  - `tripAccess(userId, tripId)` devolve `{ trip, role }` ou `null`. Toda rota
    `/api/trips/[id]/*` começa por ele, e `null` vira **404**, nunca 403, para
    não confirmar que a viagem existe.
  - `assertTripRole(access, 'OWNER')` protege as ações do dono.
  - `activeTripsFor(userId, hoje)` devolve as viagens em andamento, usadas pelo
    lançamento rápido.
  - `entryView` e `memberView` escolhem campo por campo o que um
    participante vê. Nada de `include`, e nenhum email.
- **Cálculo puro (`trips.js`), sem banco e testável:**
  - `faseDe(trip, data)`
  - `resumoViagem(trip, entries, hoje)`, que devolve gastos por fase, limite
    planejado, limite de hoje, gasto de hoje, dias que faltam, gasto por dia,
    por categoria e por pessoa.
  - `acerto(entries, members, proporcoes)` (fase 3).

As datas seguem as funções UTC de `calendar.js`, como o resto do app.

### Rotas

| Rota | Método | Quem |
| --- | --- | --- |
| `/api/trips` | GET (minhas viagens, via `TripMember`), POST (criar; cria o `TripMember` OWNER junto) | logado |
| `/api/trips/[id]` | GET (viagem, gastos, participantes, resumo) | participante |
| `/api/trips/[id]` | PUT, DELETE | dono |
| `/api/trips/[id]/entries` | POST, PUT, DELETE (só os próprios) | participante |
| `/api/trips/[id]/invites` | POST (gera link), DELETE (revoga) | dono |
| `/api/trips/[id]/members` | DELETE (dono remove alguém; participante remove a si mesmo) | participante |
| `/api/trips/invites/accept` | POST `{ token }` | logado |

No POST de `entries` com método Conta, o `bankAccountId` é validado com
`assertOwned(userDb(eu, minhaCarteira), …)`, e o `Transaction` é criado pelo
cliente escopado **de quem lança**. Os dois registros são gravados no mesmo
`$transaction`.

Nesta versão do Next, `params` de rota dinâmica é uma Promise. Antes de
escrever as rotas `[id]`, conferir em `node_modules/next/dist/docs/`.

### Mudanças fora da viagem

- **`/api/transactions`:** o PUT sincroniza o `TripEntry` ligado (data, valor e
  descrição). O DELETE já leva o gasto junto pela cascata. O GET devolve
  `tripEntry: { tripId }` para a lista mostrar um selo da viagem.
- **`QuickAdd`:** se houver viagem em andamento, aparece o seletor "Da viagem
  *X*", ligado por padrão. Ligado, o lançamento vai para
  `/api/trips/[id]/entries` e ganha os campos de forma de pagamento e
  categoria da viagem.
- **Menu:** "Viagens" (`/trips`) no `Sidebar`.
- **Login** (fase 2): `LoginForm` recebe `next` e redireciona para ele depois
  de entrar, com a validação descrita acima.

### Páginas

- **`/trips`:** a viagem em andamento em destaque, depois as próximas e as
  passadas. Botão "Nova viagem".
- **`/trips/[id]`:** mostra no topo o limite de hoje, o gasto de hoje e quanto
  resta. Abaixo vêm a barra do orçamento dividida por fase, os gastos agrupados
  por dia, as categorias, os participantes e, na fase 3, o acerto.
- **`/trips/invite/[token]`:** fica fora do grupo `(dashboard)`, porque o layout
  de lá redireciona para `/login` sem `next`. A própria página chama
  `getScope()` e redireciona com `next`.

---

## Fases

### Fase 1: viagem de uma pessoa (PR 1)

- Migration com `Trip`, `TripMember` e `TripEntry`.
- `src/lib/trips.js` (acesso e cálculo).
- Rotas `/api/trips`, `/api/trips/[id]` e `/api/trips/[id]/entries`.
- Páginas `/trips` e `/trips/[id]`, e o item no menu.
- `QuickAdd` com a viagem em andamento.
- Sincronia com o PUT de `/api/transactions`.
- `tests/trips.test.mjs`, cobrindo:
  - fases nas bordas: meia-noite do dia da ida e da volta;
  - limite de hoje ignorando o gasto de hoje, mas contando os dias seguintes;
  - `max(reserva, gasto)` com a passagem mais cara que a reserva;
  - entrada abatendo da fase certa;
  - viagem de um dia;
  - hoje antes da ida e depois da volta;
  - centavos, que precisam fechar.

Já é útil sozinha.

### Fase 2: compartilhar (PR 2, revisado à parte)

- Migration com `TripInvite`.
- Rotas `invites`, `members` e `invites/accept`.
- Página `/trips/invite/[token]` e o `next` no login.
- Participantes e gasto por pessoa em `/trips/[id]`.
- Testes:
  - validação do `next` (`//evil.com`, `/\evil.com`, `https://…`, `javascript:`);
  - hash do token;
  - regras de expiração, uso e revogação, como funções puras.
- Verificação manual com duas contas:
  - quem não participa recebe 404 em todas as rotas `[id]`;
  - o participante não consegue editar nem apagar gasto do outro;
  - o convite usado não vale de novo.

### Fase 3: acerto e integrações

- Acerto, **opcional por viagem** (`settleUp`): quem viaja escolhe se quer.
  Desligado, a tela mostra só quanto cada um gastou, sem "quem deve a quem".
  Ligado, calcula quanto um deve ao outro, em partes iguais por padrão, com
  peso ajustável por participante (`share`). Qualquer participante pode ligar,
  porque o acerto não muda nenhum valor, só a leitura deles.
- Importação de extrato: linhas dentro das datas de uma viagem vêm com "marcar
  na viagem", que cria `TripEntry` com método Conta ligado ao `Transaction`
  importado.
- Baldes: o de variáveis mostra "dos quais R$ X da viagem", somando os gastos
  Conta e os gastos Cartão do mês.
- Resumo de viagem encerrada: total, média por dia e comparação com o planejado
  por categoria.

---

## Fora do escopo

- **Moeda estrangeira.** Dá para acrescentar depois um `currency` e uma
  `rate` digitada à mão no `TripEntry`, sem mexer no resto.
- **Convite para quem não tem conta.** O cadastro continua exigindo
  `INVITE_CODE`. O link da viagem só serve para quem já usa o app.
- **Notificações** quando o outro lança um gasto.

---

## Decisões

Respondidas em 25/09/2026:

1. **Categorias da viagem:** a lista fixa acima, sem mudanças.
2. **Acerto:** não é padrão. Cada viagem escolhe se vai ter (`settleUp`).
3. **Validade do convite:** 7 dias.
