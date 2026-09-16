# RFC 0001 — Lembretes e pendências

**Status:** fase 1 implementada; fases 2 a 4 em proposta
**Data:** 16/09/2026
**Escopo:** `Reminder` (modelo novo), projeção do calendário, dashboard, dia do calendário

---

## O problema

Duas coisas diferentes, que se resolvem com a mesma peça.

### 1. Existem tarefas que o app não tem como adivinhar

"Emitir nota todo último dia do mês." "Pagar o contador dia 10." "O cartão vence
dia 25, mandar dinheiro para a conta antes."

Nenhuma delas cabe no que existe hoje. Uma recorrente diz que *dinheiro vai se
mover*; não diz que *você precisa fazer alguma coisa*. E emitir nota não move
dinheiro nenhum — não há recorrente que a represente.

### 2. Uma previsão que vence sem ser paga desaparece

Hoje, `src/app/api/calendar/route.js` só projeta recorrentes de hoje em diante:

```js
const isFuture = (y, m, d) => y * 10000 + m * 100 + d >= todayKey;
// ...
if (!day || !isFuture(year, month, day)) continue;
```

A razão é boa: sem isso, um lançamento já registrado somaria com a recorrência
que o originou, e o aluguel apareceria duas vezes.

O efeito colateral não é bom. Cenário real, medido em 16/09/2026:

| | |
| --- | --- |
| Conta | R$ 5.000 |
| Internet, dia 10 (venceu, não foi paga) | R$ 150 |
| Aluguel, dia 25 (ainda vem) | R$ 3.000 |
| **O app diz que o mês fecha com** | **R$ 2.000** |
| **A realidade, se a internet não foi paga** | **R$ 1.850** |

A despesa evaporou e o saldo **melhorou sozinho** porque a data passou. Todo
dia 11, 16, 21 o mês fica mais bonito sem nada ter acontecido.

### Por que as duas coisas estão na mesma RFC

Porque para quem usa são a mesma coisa. "Pagar o contador dia 10" e "a
recorrente do contador venceu e não foi paga" são o mesmo item na tela, com o
mesmo botão. Resolver separado construiria dois sistemas sobrepostos que
brigam por espaço no dashboard.

---

## O que já existe, e por que não basta

O app tem **dicas** (`src/lib/insights.js`): observações derivadas dos números,
que ninguém cadastra. *"Em 20/09 o saldo fica em −R$ 1.191,70."*

Um lembrete tem três propriedades que nenhuma dica tem:

- **É declarado**, não deduzido.
- **Tem estado**: feito ou não feito.
- **Some quando resolvido.**

O terceiro é o que separa um lembrete útil de ruído. Um aviso que não se pode
encerrar repete até a pessoa parar de ler — e aí leva junto as dicas que valiam.

São camadas distintas: a dica observa, o lembrete cobra.

---

## Não-objetivos

- **Não** é um gerenciador de tarefas. Sem subtarefas, sem anexos, sem
  responsáveis, sem prioridade livre.
- **Não** gera lembrete automático para toda recorrente. Trinta avisos por mês
  é o mesmo que nenhum.
- **Não** duplica o que as dicas já dizem.
- **Não** assume que uma previsão vencida foi paga (ver *Alternativas*).

---

## Desenho

### Modelo

```prisma
model Reminder {
  id          String   @id @default(uuid())
  title       String
  notes       String   @default("")

  // De onde vem a data. Exatamente uma das três formas.
  kind        String   // FIXED_DAY | LAST_DAY | ANCHORED | ONCE
  dayOfMonth  Int?     // FIXED_DAY
  date        DateTime? // ONCE
  monthOfYear Int?     // anual

  // ANCORADO: a data não é guardada, é herdada
  anchorType  String?  // CARD_PAYMENT | CARD_OPENING | CARD_DUE | RECURRING
  anchorId    String?

  leadDays    Int      @default(0)  // avisar N dias antes
  autoSettle  Boolean  @default(true)
  // Para os autônomos: o app não emite a nota, mas abre o site onde se emite
  link        String   @default("")

  active      Boolean  @default(true)
  // ... userId, walletId
}

model ReminderEvent {
  id          String   @id @default(uuid())
  reminderId  String
  year        Int
  month       Int
  status      String   // PENDING | DONE | SKIPPED
  settledAt   DateTime?
  // ... userId, walletId
  @@unique([reminderId, year, month])
}
```

Duas tabelas porque um lembrete mensal é um molde, e cada mês é uma ocorrência
com estado próprio. Marcar setembro como feito não pode marcar outubro.

`ReminderEvent` só nasce quando alguém dá baixa ou pula — o estado normal
(pendente) é a ausência de linha. Um lembrete mensal não gera 120 linhas ao
ser criado.

### Ancoragem: a parte que importa

Dos três exemplos, dois se penduram em algo que **já existe no app**:

| Exemplo | Data vem de |
| --- | --- |
| "Emitir nota todo último dia" | própria (`LAST_DAY`) |
| "Pagar o contador dia 10" | `RECURRING` do contador |
| "Cartão vence 25, mandar dinheiro" | `CARD_PAYMENT` do cartão |

Se o lembrete guardasse "dia 25" digitado, viveriam **duas verdades**. Você
muda o vencimento do cartão no pré-cadastro, o lembrete continua falando em 25,
e seis meses depois ele mente sem avisar.

Lembrete ancorado não guarda data — guarda de onde ela vem. Mudou o cartão,
mudou o lembrete junto.

**É esta a razão de existir da feature.** Um lembrete no celular faz tudo o
que um lembrete faz, menos isto: o celular não sabe que a data mudou, e não
sabe se o dinheiro se mexeu.

### Antecedência

"Mandar dinheiro pro cartão" avisado no dia 25 não serve para nada — o dinheiro
precisa estar lá antes. Daí `leadDays`.

O lembrete aparece a partir de `data − leadDays` e continua aparecendo até ser
resolvido. Não some no dia seguinte: ficar atrasado é a informação mais útil
que ele carrega.

### Baixa automática

`autoSettle` deixa o app encerrar sozinho o que ele consegue verificar:

| Lembrete | Encerra quando |
| --- | --- |
| Ancorado numa recorrente | existe transação no mês que casa com ela (nome normalizado + valor) |
| Ancorado no pagamento do cartão | existe saída no valor da fatura naquele cartão |
| "Mandar dinheiro pra conta" | o saldo projetado da conta já cobre a fatura na data |
| Autônomo ("emitir nota") | nunca — só na mão |

A regra de casamento já existe: `pareceRecorrente()` em `src/lib/buckets.js`
faz exatamente isso para não contar o aluguel duas vezes. Reaproveitar, não
reescrever.

Isto é o que separa de uma lista de tarefas qualquer: o app tem os números para
saber se a coisa aconteceu, e usa.

### Pendências: a previsão que venceu

O `isFuture` deixa de descartar a previsão vencida e passa a **classificá-la**:

```
dia futuro              → prevista   (como hoje)
dia passado + casada    → some       (a transação real assumiu o lugar)
dia passado + não casada→ PENDENTE   (continua pesando no saldo, marcada em atraso)
```

O casamento é o mesmo `pareceRecorrente()`. Isso preserva a razão original do
`isFuture` — nada conta duas vezes — e elimina o efeito colateral.

Na célula do dia e no extrato, a pendência aparece com um marcador de atraso e
dois botões: **"foi pago"**, que abre o lançamento já preenchido com nome,
valor, dia e categoria da recorrente; e **"não vai acontecer"**, que pula o mês
sem apagar a recorrente.

Uma pendência é um `ReminderEvent` sem `Reminder` por trás — mesma lista, mesmo
botão, mesma cara. Quem usa não precisa saber que a origem é diferente.

### O modal de pendências do dia

Uma lista passiva de pendências não é resolvida, é acumulada. E como não há
push, **abrir o app é o único gancho que existe** — não usá-lo desperdiça o
único momento em que a resposta é barata: você sabe agora se pagou o contador.

Então: ao abrir, se houver pendência vencida ou de hoje, um modal pergunta.

#### O que ganha o direito de interromper

Três condições, todas obrigatórias:

1. **Só o que venceu ou vence hoje.** Antecedência é assunto do painel.
2. **Uma vez por dia**, não importa quantas vezes o app seja aberto.
3. **A baixa automática roda antes.** Perguntar sobre o que já foi feito é a
   forma mais rápida de perder a confiança.

Sem a regra 2, o modal treina o dedo a fechar sem ler — e o desfecho é pior do
que não ter a feature: a pessoa clica "sim, paguei" para se livrar, e o saldo
fica mais errado do que estava.

#### As respostas

| Resposta | O que faz |
| --- | --- |
| **Foi pago** | Cria o lançamento, com o **valor editável** |
| **Já lancei antes** | Vincula a um lançamento existente em vez de criar outro |
| **Não vai sair** (entrada: **não caiu**) | Pula só este mês, sem mexer na recorrente |
| **Lembrar depois** | Adia a pergunta |
| **Depois** | Fecha sem responder nada |

O valor editável não é detalhe: o contador cobra R$ 450 e vem R$ 480. Se
"foi pago" só aceitasse o valor cadastrado, o saldo nasceria errado e exigiria
uma edição em seguida.

"Já lancei antes" existe porque o casamento automático vai falhar às vezes. Sem
essa saída, a pessoa clica "foi pago" e fica com o gasto em dobro — é a
mitigação do risco de duplicação, dentro do fluxo onde ele acontece.

#### Duas armadilhas no "lembrar depois"

**Adiar a pergunta não pode adiar o dinheiro.** Se "lembrar dia 20" empurrasse a
despesa para o dia 20, adiar viraria um jeito de deixar o mês bonito — o mesmo
bug que esta RFC conserta. O lembrete se cala; a pendência **continua pesando no
saldo na data original**.

**Mudar a data de quê?** Duas coisas muito diferentes: o contador passou a
cobrar dia 15 para sempre (muda a recorrente) ou atrasou só este mês (muda a
ocorrência). Confundir reescreve as despesas fixas em silêncio. O padrão é o
seguro — só este mês — com a outra opção explícita.

#### Entrada e saída usam palavras diferentes

"Cancelar o pagamento" é ambíguo já para saída: parece "vou deixar de pagar"
quando quer dizer "tira isso da frente". Para entrada fica pior — ninguém
cancela um recebimento.

Saída: **"não vai sair"**. Entrada: **"não caiu"**.

"Não caiu" é a resposta mais valiosa das duas, porque sinaliza que o cliente não
pagou. Vale considerar oferecer, ali mesmo, transformar em empréstimo a receber.

#### Quando a pessoa some por uma semana

Seis pendências em sequência viram tarefa, não lembrete. Um modal só, com a
lista, cada linha com seus botões, e uma saída clara: responde o que sabe, deixa
o resto.

O **primeiro dia do mês** é um momento natural para a versão completa —
"vamos fechar setembro?" — porque é quando o extrato do banco está do lado e a
resposta é barata.

#### Fechar sem querer

O `Modal` do app fecha ao clicar no véu. Para este, não deve: sai por "Depois"
ou Esc, e só. Metade dos fechamentos acidentais desaparece com isso.

Para a outra metade, uma porta de volta — que **não** é um botão flutuante novo:
já existe o FAB de lançar, e dois botões flutuantes disputam o mesmo canto e a
mesma atenção. A porta é o **próprio bloco de pendências do dashboard**:
"3 pendências de hoje · Resolver". Enquanto houver algo, ele está lá; quando
zera, some.

As duas portas abrem **o mesmo modal**. Uma tela alternativa seriam duas coisas
para construir e duas para manter em sincronia.

### Onde aparece

1. **Dashboard**, junto das dicas, com a mesma regra: sem nada pendente, nada
   na tela. Um bloco que aparece sempre vira moldura.
2. **Célula do dia** no calendário: um ponto discreto.
3. **Modal do dia**: a lista, com os botões de baixa.
4. **Contador** no título da aba (`(2) FinControl`) e no ícone do PWA.

Ordem: atrasado primeiro, depois hoje, depois os próximos. Teto de itens
visíveis, o resto atrás de "ver todos" — igual às dicas.

### Recorrência

`FIXED_DAY` (dia N), `LAST_DAY`, anual (`monthOfYear` + dia) e `ONCE`.

Nota: `clampDay(31)` já devolve o último dia de qualquer mês, então
mecanicamente `LAST_DAY` é dia 31 com clamp. Mesmo assim vale o tipo explícito
na interface — fazer a pessoa deduzir que "último dia" se escreve 31 é o tipo
de esperteza que confunde.

---

## Entrega: isto vai tocar o celular?

Ponto onde a expectativa costuma quebrar, então explícito:

**O app não tem service worker hoje** — escolha deliberada, é por isso que toda
atualização aparece na hora no celular sem reinstalar nada. Sem service worker
**não existe push**. Um lembrete só aparece quando o app é aberto.

| Caminho | Custo | Entrega |
| --- | --- | --- |
| Passivo (aparece ao abrir) | zero | resolve o grosso, exige abrir |
| Contador na aba e no ícone | baixo | vê que há pendência sem entrar |
| Telegram (bot + cron da Vercel) | baixo-médio | **toca de verdade**, grátis |
| E-mail (cron + Resend) | baixo-médio | chega com o app fechado |
| Push nativo (SW + VAPID + cron) | alto | o ideal, mais peças |

Duas observações. Push **não** precisa custar a atualização instantânea: um
service worker que só recebe push, sem interceptar `fetch`, não cria cache.
E o Telegram entrega quase tudo que o push entrega por uma fração do trabalho —
um bot, um `chat_id`, uma chamada HTTP.

**Recomendação:** começar passivo + contador. Subir para Telegram se na prática
faltar.

---

## Alternativas consideradas

**Assumir que a previsão vencida foi paga.** Troca um erro por outro: o saldo
fecha, mas não existe transação, então o extrato fica com um buraco e não há
como saber o que de fato saiu. E se não foi paga, o número está errado na
direção que dói — o mês parece melhor do que é.

**Gerar `ReminderEvent` para todo mês na criação.** Simplifica a consulta e
polui o banco com centenas de linhas de estado vazio. A ausência de linha é um
estado perfeitamente bom.

**Usar o app de lembretes do celular.** Sério candidato, e para lembretes
autônomos ("emitir nota") faz o mesmo trabalho. Perde nos ancorados: não segue
a mudança da data e não sabe se o dinheiro se mexeu.

**Transformar toda recorrente em lembrete automaticamente.** Trinta avisos por
mês. A pendência já cobre o caso "não foi paga", que é o que interessa.

---

## Riscos

**Virar ruído.** O maior. Mitigação: teto de itens visíveis, baixa automática
sempre que possível, silenciar o mês sem apagar, e nada na tela quando não há
nada pendente.

**O modal treinar o dedo a fechar.** Se aparecer toda vez que o app abre, em duas
semanas ele é fechado sem leitura — e o risco seguinte é a pessoa responder "foi
pago" por reflexo, o que corrompe o saldo em vez de corrigi-lo. Mitigação: uma
vez por dia, só o que venceu ou vence hoje, baixa automática antes de perguntar,
e "Depois" sempre disponível sem custo.

**Pendência mal casada.** Se `pareceRecorrente()` não reconhece o pagamento, a
pendência fica eterna e o saldo mostra uma dívida que não existe. Mitigação:
o botão "não vai acontecer" resolve em um clique, e o casamento é o mesmo
código já em produção nos baldes.

**Duplicar ao dar baixa.** "Foi pago" cria a transação; se a pessoa já tinha
lançado à mão, viram duas. Mitigação: antes de abrir o formulário, procurar um
lançamento parecido no mês e oferecer vincular em vez de criar.

**Fuso.** Toda comparação de data em UTC, como no resto do app. `dateKey()` e
`utcParts()` já existem para isso.

---

## Fases

1. ~~**Pendências.**~~ **Feito.** Recorrente vencida vira pendência em vez de
   sumir, com "paguei" (valor editável), "não vai sair" e desfazer. Inclui o
   modal do dia, a barra no dashboard e a marca de atraso no extrato e no
   detalhe do dia.

   Duas coisas apareceram na construção e não estavam previstas aqui:

   - **Cadastro não gera cobrança retroativa.** Registrar "Internet dia 10"
     hoje fazia nascerem pendências de junho, julho e agosto — meses que o app
     nunca acompanhou. Uma ocorrência anterior ao `createdAt` da recorrente
     (quando não há `startDate`) não vira pendência.
   - **Os baldes passaram a casar por nome, não por valor.** Era o mesmo
     critério, escrito duas vezes; agora é um só. De quebra, o mês em que o
     contador cobrou R$ 480 em vez de R$ 450 parou de contar o valor duas
     vezes, uma como fixo e outra como variável.
2. **Lembretes autônomos e ancorados**, com antecedência, baixa manual e o
   modal de pendências do dia.
3. **Baixa automática** e o contador na aba e no ícone.
4. **Telegram**, se necessário.

A fase 1 vale sozinha, e é a que eu faria primeiro mesmo que o resto nunca
aconteça.

---

## Questões em aberto

1. **Lembretes fiscais sugeridos na carteira PJ** — emitir nota no último dia,
   DAS até o 20, DEFIS em junho. Nascem sugeridos, aceita ou descarta? Só faz
   sentido porque carteira tem tipo (`kind`).
2. **Pendência de mês fechado.** Uma recorrente de março que nunca foi paga
   continua pendente para sempre, ou expira depois de N meses?
3. **Pendência mexe no saldo de abertura do mês seguinte?** Hoje o `carryOver`
   soma só transações reais. Se a pendência pesa em setembro mas não atravessa
   para outubro, os dois meses discordam.
