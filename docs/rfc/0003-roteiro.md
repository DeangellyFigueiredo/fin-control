# RFC 0003 — Roteiro da viagem

**Status:** aprovada em 08/10/2026; em implementação
**Data:** 08/10/2026
**Escopo:** `TripStop`, `TripActivity` (modelos novos), `TripEntry.activityId`,
rotas `/api/trips/[id]/stops`, `/api/trips/[id]/activities`, abas em
`/trips/[id]`, `src/lib/roteiro.js`, `src/lib/lugares.js`, tokens de motion em
`globals.css`

---

## O problema

A viagem responde "quanto ainda posso gastar hoje" (RFC 0002). Não responde
**onde vamos estar, o que vamos fazer e se estamos no ritmo**.

Numa viagem de carro com várias paradas, o plano mora fora do app: numa
conversa, numa nota, num print. Aí a pergunta "gastamos demais em Gramado?"
não tem resposta, porque o app não sabe que 13 a 15/12 é Gramado. O gasto do
dia também fica sem a atividade que o gerou. E ninguém vê no app que o dia 12
é o dia dos cânions, em que o cachorro não pode ir.

O caso que motiva a RFC é real: de 11 a 18/12/2026, Itapema → Cambará do Sul →
Gramado → Bento Gonçalves → Itapema, de carro, a dois, com o cachorro.

---

## A proposta

O roteiro tem duas peças:

- **Paradas** (`TripStop`): as cidades onde a viagem dorme ou passa, em ordem,
  cada uma com o dia de chegada e o trecho de estrada até ela.
- **Atividades** (`TripActivity`): o que fazer em cada dia, com custo estimado
  e uma marca de pet.

Gastos já existem (`TripEntry`). Cada gasto pode apontar para uma atividade, e
assim cada atividade tem estimado e real.

### Paradas: só o dia de chegada

A parada guarda **só quando se chega**. A saída é a chegada da parada
seguinte:

```
estadia(i) = [chegada(i), chegada(i+1)]
noites(i)  = chegada(i+1) − chegada(i)
```

Com entrada e saída separadas, a saída de uma parada e a chegada da outra
podem discordar, e a tela teria que decidir qual vale. Com um campo só, não
existe roteiro inconsistente.

O tipo da parada também sai da posição, sem campo próprio:

| Posição | Leitura |
| --- | --- |
| primeira | **origem**; a "chegada" é o dia em que se sai dela |
| última | **fim**; normalmente a volta para casa |
| meio, com 0 noites | **passagem** (almoço no caminho, por exemplo) |
| meio, com noites | **pernoite** |

O **trecho** de estrada até a parada fica nela mesma: `legKm`, `legMinutes` e
`legNotes`. O trecho acontece no dia de chegada da parada. São números
digitados. O app não calcula rota (ver *Fora do escopo*).

### O dia de troca

No dia em que há trecho, a viagem está **nos dois lugares**: de manhã na
parada anterior, à noite na nova. `paradaDoDia` devolve as duas, e a tela
mostra "Cambará → Gramado" naquele cartão. Os testes cobrem esse dia nas
duas pontas.

### Atividades

Uma atividade tem dia, período ou hora, título, categoria (as mesmas
`TRIP_CATEGORIES`), custo estimado, marca de pet, status, link e notas.

- **O pet é um dado de primeira classe**, não uma nota: `SIM`, `NAO` ou
  `VERIFICAR`. Uma atividade `NAO` mostra "planejar quem fica com o
  cachorro", porque esse é o tipo de detalhe que estraga um dia (o Parque
  Nacional de Aparados da Serra não aceita cães).
- **Status:** `PLANEJADA`, `FEITA` ou `PULADA`. Um toque alterna. Atividade
  pulada não conta no ritmo do roteiro.
- **Lugar:** texto livre opcional (`place`). Canela é um bate-volta de Gramado,
  não uma parada. A atividade diz "Canela" e o mapa continua com as paradas.
- A atividade **não aponta para a parada**. A parada é deduzida pela data, como
  a fase do gasto na 0002. Um campo a mais seria mais um ponto para discordar.

### Gasto ligado à atividade

`TripEntry` ganha `activityId` opcional, com `onDelete: SetNull`. Apagar a
atividade não apaga o gasto: o dinheiro saiu.

- O "+ gasto" de um cartão de dia abre o `TripEntryForm` com data, categoria e
  atividade preenchidas. O seletor de atividade lista as daquele dia.
- Qualquer participante pode ligar o **próprio** gasto a qualquer atividade da
  viagem. A rota confere que a atividade é da mesma viagem.
- O estimado contra o real fica por atividade, por dia e por parada (soma dos
  dias da estadia).

### Tracking: pela data, não pelo GPS

"Onde estamos" sai do calendário: hoje e o roteiro dizem a posição. Não há
localização do aparelho. Isso dispensa permissão, não grava por onde a pessoa
andou e funciona sem sinal na serra.

`progressoDaRota(stops, hoje)` devolve a posição em **trechos**, de `0`
até `n`, com `n` trechos:

- antes da ida: `0` (na origem);
- trechos de dias anteriores contam inteiros; os de hoje contam metade (o
  carro aparece no meio do caminho);
- dia sem trecho: parado na parada do dia;
- depois da volta: `n`.

O mapa converte essa posição em comprimento do traço SVG.

### Ritmo

Dois ritmos, lado a lado:

**Dinheiro.** O gasto acumulado do destino, dia a dia, contra o planejado
acumulado (`limitePlanejado × dias`). Os números vêm de `resumoViagem`, sem
regra nova: `ritmo()` só acumula `porDia` e compara.

- A diferença até hoje vira uma frase: "no ritmo", "R$ 180 acima do planejado
  até hoje" ou "sobrando R$ 90".
- "No ritmo" é diferença menor que 10% de um dia planejado.
- O `limiteHoje` da 0002 continua sendo o número do dia. O ritmo mostra a
  tendência.

**Roteiro.** Atividades feitas contra não puladas, até hoje, e km rodados
contra km totais.

**Carga do dia.** Horas de estrada mais atividades. Um dia com mais de 5h de
estrada e 3 atividades ou mais ganha o selo "dia pesado". É uma regra simples,
para ajudar a montar o plano, não para julgar.

### Quem pode o quê

Adições à tabela da 0002:

| | Dono | Participante |
| --- | --- | --- |
| Ver o roteiro | ✅ | ✅ |
| Criar, editar, reordenar e apagar paradas e atividades | ✅ | ✅ |
| Marcar atividade como feita/pulada | ✅ | ✅ |
| Ligar **o próprio** gasto a uma atividade | ✅ | ✅ |
| Importar roteiro (JSON) | ✅ | ❌ |

O roteiro é um plano a dois, então qualquer participante edita. Datas e
orçamento continuam com o dono (0002). A importação é só do dono porque cria
o roteiro inteiro de uma vez.

**Mudar as datas da viagem** com paradas ou atividades fora do novo intervalo
é **recusado**, com a contagem: "2 paradas e 5 atividades ficariam fora das
datas. Mova-as antes." Aumentar o intervalo nunca quebra nada. Encolher em
silêncio deixaria itens órfãos.

---

## Modelo de dados

```prisma
// Uma parada do roteiro. Guarda só a chegada: a saída é a chegada da parada
// seguinte, e o tipo (origem, pernoite, passagem, fim) sai da posição.
model TripStop {
  id         String   @id @default(uuid())
  tripId     String   @map("trip_id")
  // Desempate entre paradas do mesmo dia (passagem + pernoite)
  order      Int      @default(0)
  date       DateTime // chegada; na primeira parada, o dia em que se sai dela
  city       String
  uf         String   @default("")
  lat        Float
  lng        Float
  lodgingName String  @default("") @map("lodging_name")
  lodgingUrl  String  @default("") @map("lodging_url")
  petPolicy   String  @default("") @map("pet_policy")
  notes       String  @default("")
  // Trecho de estrada até esta parada, no dia da chegada. Digitado.
  legKm      Float?   @map("leg_km")
  legMinutes Int?     @map("leg_minutes")
  legNotes   String   @default("") @map("leg_notes")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@index([tripId, date])
  @@map("trip_stops")
}

model TripActivity {
  id            String   @id @default(uuid())
  tripId        String   @map("trip_id")
  date          DateTime
  time          String?  // "HH:MM"; sem hora, vale o período
  period        String   @default("MANHA") // MANHA, TARDE ou NOITE
  order         Int      @default(0)
  title         String
  place         String   @default("") // bate-volta: "Canela"
  category      String   // uma de TRIP_CATEGORIES
  estimatedCost Float    @default(0) @map("estimated_cost")
  pet           String   @default("VERIFICAR") // SIM, NAO ou VERIFICAR
  status        String   @default("PLANEJADA") // PLANEJADA, FEITA ou PULADA
  link          String   @default("")
  notes         String   @default("")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  trip    Trip        @relation(fields: [tripId], references: [id], onDelete: Cascade)
  entries TripEntry[]

  @@index([tripId, date])
  @@map("trip_activities")
}

model TripEntry {
  // ...campos atuais...
  activityId String? @map("activity_id")
  // Apagar a atividade não apaga o gasto: o dinheiro saiu.
  activity TripActivity? @relation(fields: [activityId], references: [id], onDelete: SetNull)

  @@index([activityId])
}
```

Assim como os outros modelos `Trip*`, nenhum dos dois entra em
`SCOPED_MODELS`. O acesso passa por `tripAccess`.

O `period` também é preenchido quando há `time`, derivado da hora (antes das
12h é manhã, antes das 18h é tarde, depois disso é noite). Assim a timeline
agrupa sem caso especial.

---

## Código

### Cálculo puro: `src/lib/roteiro.js`

É um arquivo separado de `trips.js`, que já tem 220 linhas. Mesmas regras:
sem banco, roda nos dois lados, datas por `diaDe` e dinheiro em centavos.

- `ordenarParadas(stops)`: por `date` e depois por `order`.
- `estadias(stops)`: para cada parada, chegada, saída, noites e tipo
  deduzido.
- `paradaDoDia(stops, dia)`: devolve `{ manha, noite, trecho }`. Em dia sem
  trecho, `manha === noite`.
- `diasDoRoteiro(trip, stops, activities, entries)`: um item por dia da
  viagem com parada(s), trecho, atividades agrupadas por período, estimado,
  gasto e carga.
- `progressoDaRota(stops, hoje)`: `{ posicao, total, emTrecho }`.
- `ritmo(trip, entries, activities, stops, hoje)`: séries acumuladas de
  planejado e real, frase de status, atividades feitas/total e km
  rodados/total.
- `validarParada`, `validarAtividade` e `validarRoteiroImportado`: mesmo
  formato `{ data } | { error }` de `validarViagem`.
- `enquadrar(pontos, largura, altura, margem)`: devolve a função lat/lng →
  x/y no viewBox, com correção `cos(lat médio)` na longitude. Com um ponto
  só, centraliza, sem dividir por zero.
- `trechosSuaves(pontos)`: um path SVG por trecho, em curvas Catmull-Rom.
- `foraDasDatas(stops, activities, ida, volta)`: o que ficaria fora de novas
  datas, para o PUT da viagem recusar.

### Lugares: `src/lib/lugares.js`

Não há geocoding nem chave de API. O arquivo tem uma lista curta (~60 cidades)
de destinos de SC, RS e PR, com `{ nome, uf, lat, lng }`, e um `buscarLugar(texto)`
que ignora acento e caixa. O campo de cidade sugere a partir da lista. Fora
dela, aceita colar `-29.38, -50.87` do Google Maps (`lerCoordenadas`).

O contorno de PR, SC e RS fica em `src/lib/contornos.js`: a malha do IBGE
(API de malhas v3, qualidade mínima), simplificada por Douglas-Peucker com
tolerância de 0,03° e arredondada a 2 casas, em ~5 KB.

### Rotas

| Rota | Método | Quem |
| --- | --- | --- |
| `/api/trips/[id]` | GET passa a devolver também `stops` e `activities` | participante |
| `/api/trips/[id]` | PUT recusa datas que deixariam itens do roteiro fora | dono |
| `/api/trips/[id]/stops` | POST, PUT, DELETE | participante |
| `/api/trips/[id]/activities` | POST, PUT (inclui status, ordem e troca de dia), DELETE | participante |
| `/api/trips/[id]/entries` | POST/PUT aceitam `activityId`, conferido na mesma viagem | participante |
| `/api/trips/[id]/itinerary` | POST importa `{ stops, activities }`; só com roteiro vazio | dono |

Todas começam por `tripAccess`, e `null` vira 404. Paradas e atividades são
consultadas sempre com `where: { id, tripId }`: um id de outra viagem dá 404,
nunca altera a outra. `entryView` passa a incluir `activityId`.

A importação só aceita roteiro vazio. Mesclar com o que existe exigiria regra
de conflito, e o caso real é cadastrar uma vez.

### Tela: `/trips/[id]` com abas

**Resumo · Roteiro · Gastos.** O Resumo é o topo atual (destaque, barra,
categorias, participantes). Gastos é a lista atual. A aba fica em
`?aba=roteiro`, e a troca usa `startTransition`, para o `<ViewTransition>`
animar.

Componentes novos em `src/components/roteiro/`:

- **`MapaDaRota`**: SVG inline. Curva suave (Catmull-Rom → Bézier) pelas
  paradas projetadas; marcadores com cidade e noites; carro na posição de
  hoje; trecho percorrido na cor de destaque e o que falta tracejado e
  apagado. O botão ▶ "Rever o percurso" leva o carro do início ao fim, com
  o rótulo do dia e do km acumulado ao passar por cada cidade.
- **`TimelineDoRoteiro`**: um cartão por dia (D1…Dn). Mostra data, dia da
  semana, parada (ou "A → B" com o selo do trecho), atividades por período
  com selo de pet, estimado × gasto com barrinha e o botão "+ gasto". O
  cartão de hoje fica em destaque e a tela rola até ele ao abrir.
  Para reordenar ou mudar de dia, usa botões ↑ ↓ e "mover para…". Arrastar
  fica de fora (ver *Fora do escopo*).
- **`CalendarioDeEstadias`**: grade do(s) mês(es) com cada estadia como
  faixa contínua por cidade, marcando check-in e check-out. As outras
  viagens do usuário no mesmo período aparecem apagadas (vêm de
  `GET /api/trips`). Clicar num dia rola a timeline até ele.
- **`PainelDoRitmo`**: gráfico de linha (chart.js, que já está no projeto)
  com o planejado e o real acumulados, a frase de status e os contadores de
  atividades e km.
- **`ParadaForm`** e **`AtividadeForm`**: no padrão de `TripForm` e
  `TripEntryForm`, em `Modal`.

Passar o mouse ou tocar num cartão da timeline destaca a parada e o trecho no
mapa, e o contrário também vale. O estado do destaque mora na página e desce
por props.

### Motion design

O motion mostra o fluxo da viagem. Não é enfeite.

**Sem dependência nova.** Tudo é feito com CSS, animação de SVG e Web
Animations API. Para trocar de aba e abrir um dia, o `<ViewTransition>` vem do
React do App Router (`import { ViewTransition } from 'react'`; ver
`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`). Ele só
anima dentro de `startTransition`. Em navegador sem suporte, a tela funciona,
só que sem animação.

**Tokens em `:root`:**

```css
--motion-fast: 150ms;
--motion-base: 250ms;
--motion-slow: 600ms;
--ease-out: cubic-bezier(.2, .8, .2, 1);
--ease-spring: cubic-bezier(.34, 1.56, .64, 1);
```

Anima só `transform` e `opacity`. A exceção é o `stroke-dashoffset` do traço.

**Entrada da aba Roteiro:**

1. a rota se desenha da origem ao fim (`stroke-dashoffset`, ~1,2s, `--ease-out`);
2. cada parada aparece (escala 0.6 → 1 com fade) no instante em que o traço
   chega nela, a partir do comprimento acumulado do path;
3. o carro desliza até a posição de hoje (`getPointAtLength` +
   `requestAnimationFrame`);
4. os cartões da timeline entram em cascata ao aparecer na rolagem
   (`IntersectionObserver`, 50ms entre cada um, só na primeira vez).

**Microinterações:**

- Ao salvar um gasto, o total do dia e o ponto de hoje no ritmo animam do
  valor antigo até o novo (o `countUp` que já existe, generalizado).
- Ao marcar uma atividade como feita, o texto é riscado com `scaleX` e o check
  entra com `--ease-spring`.
- O cartão de hoje tem um pulso lento na borda (`box-shadow` num
  pseudo-elemento, animando só a `opacity` dele).

**`prefers-reduced-motion: reduce`.** O app ainda não trata isso, e a regra
entra global em `globals.css`. Nesse modo, as durações vão para ~0, a rota
aparece já desenhada, o carro já está no lugar, não há cascata nem pulso, e
hoje fica com a borda acesa e parada. O ▶ "Rever o percurso" pula direto para o fim.

**Celular primeiro**, porque é onde a viagem vai ser usada: mapa no topo,
timeline embaixo e calendário com rolagem horizontal própria, sem rolar a
página de lado. Tema claro e escuro só com as variáveis de cor existentes.

---

## Fases

Cada fase termina com `npm test` passando.

### Fase 1: modelo e regras

- Migration com `TripStop`, `TripActivity` e `TripEntry.activityId`.
- `src/lib/roteiro.js`, `src/lib/lugares.js` e `tests/roteiro.test.mjs`,
  cobrindo:
  - `paradaDoDia` no dia de chegada e de saída (nas duas paradas) e com
    passagem de 0 noites;
  - `progressoDaRota` antes da ida, no dia de trecho, no meio da estadia, no
    último dia e depois da volta;
  - estimado × real por dia e por atividade, em centavos, com reembolso
    abatendo;
  - `ritmo` acumulado batendo com `resumoViagem`;
  - `projetar` com tudo dentro do viewBox e com uma parada só;
  - validações: data fora da viagem, coordenada inválida, pet/status/período
    fora da lista.
- Rotas `stops`, `activities`, GET estendido, `activityId` em `entries` e
  PUT da viagem recusando datas que deixam itens fora.

### Fase 2: aba Roteiro sem animação

Abas, timeline, formulários de parada e de atividade, status em um toque e o
"+ gasto" do dia com a atividade preenchida.

### Fase 3: mapa e calendário

`MapaDaRota` estático com o tracking pela data, `CalendarioDeEstadias` e o
destaque cruzado entre timeline e mapa.

### Fase 4: motion

Tokens, coreografia de entrada, "Rever o percurso", microinterações,
`<ViewTransition>` nas abas e `prefers-reduced-motion`.

### Fase 5: ritmo

`PainelDoRitmo` e o selo "dia pesado".

### Fase 6: importar roteiro

Rota `itinerary` e um botão "Importar roteiro", visível só para o dono e só
com o roteiro vazio. O usuário cola um JSON no formato do fixture abaixo.

---

## Fixture: Serra Gaúcha, 11 a 18/12/2026

O mesmo dado serve de teste e de verificação manual. Distâncias, tempos e
coordenadas são aproximados.

| # | Cidade | lat, lng | Chegada | Noites | Trecho até aqui |
| --- | --- | --- | --- | --- | --- |
| 0 | Itapema/SC (origem) | -27.09, -48.61 | 11/12 | — | — |
| 1 | Cambará do Sul/RS | -29.05, -50.14 | 11/12 | 2 | ~330 km · ~5h |
| 2 | Gramado/RS | -29.38, -50.87 | 13/12 | 3 | ~110 km · ~2h |
| 3 | Bento Gonçalves/RS | -29.17, -51.52 | 16/12 | 2 | ~105 km · ~2h |
| 4 | Itapema/SC (fim) | -27.09, -48.61 | 18/12 | — | ~530 km · ~7h |

Atividades:

- **11/12, Cambará:** check-in; centro ✅; jantar ❓
- **12/12, Cambará:** Cânion Fortaleza 🚫; Cânion Itaimbezinho 🚫. O cachorro
  fica na pousada.
- **13/12, Gramado:** Rua Coberta ✅; Igreja São Pedro ✅; Av. Borges de
  Medeiros ✅; Praça das Etnias ✅; Show de Acendimento do Natal Luz, 20:00 ❓
- **14/12, Gramado:** Lago Negro, manhã ✅; Mini Mundo, tarde ❓; Rua Torta ✅;
  fondue, noite ❓
- **15/12, Canela (bate-volta):** Catedral de Pedra ✅; Praça João Corrêa ✅;
  Parque do Caracol ❓; Sonho de Natal, noite ❓
- **16/12, Bento:** check-in; passeio leve ✅
- **17/12, Bento:** Vale dos Vinhedos com degustação e almoço em vinícola ❓
  (Casa Valduga aceita pet na área externa; quem degustar não dirige);
  Caminhos de Pedra ❓; jantar ❓
- **18/12:** volta para Itapema

Neste fixture, o dia 11 tem trecho de ~5h e o 18 de ~7h. O dia 18 precisa
sair com o selo "dia pesado" só se tiver 3 atividades ou mais. Esse é um caso
de teste.

---

## Fora do escopo

- **Rota real pelas estradas e km calculado.** A curva do mapa é ilustrativa e
  o km é digitado. Um serviço de rotas traria chave, custo e dependência de
  rede, e o ganho seria pequeno para quem já planejou o trecho.
- **Localização do aparelho.** O tracking é pela data (ver acima).
- **Mapa com ruas e tiles.** Não entra Leaflet nem Mapbox.
- **Bate-volta no mapa.** Canela aparece na atividade, não como pino. Dá para
  acrescentar `lat`/`lng` opcionais na atividade depois.
- **Arrastar para reordenar.** Os botões ↑ ↓ e "mover para…" resolvem, e
  arrastar no celular dentro de uma página que rola exige muito cuidado.
- **Uso offline.**

---

## Decisões

Respondidas em 08/10/2026:

1. **Quem edita o roteiro:** qualquer participante.
2. **Encolher as datas com roteiro fora:** recusar, dizendo quantos itens
   ficariam fora.
3. **Datas desta viagem:** 11 a 18/12. O dia 19 é folga, fora da viagem.
4. **Contorno de SC e do RS:** gerado uma vez a partir da malha do IBGE,
   simplificado e versionado em `src/lib/contornos.js` (com o PR junto).
5. **Planejado no ritmo:** o limite fixo por dia. O estimado das atividades
   fica nos cartões de dia.
