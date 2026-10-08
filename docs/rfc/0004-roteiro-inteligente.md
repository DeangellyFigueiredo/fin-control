# RFC 0004 — Roteiro inteligente

**Status:** implementada em 08/10/2026 (fases 1 a 7)
**Data:** 08/10/2026
**Escopo:** preview da importação, blocos por cidade, fotos por URL, clima, rota
pelas ruas, sugestões e planejamento com o Claude. Tabelas `ExternalCache`,
`TripProposal`, `AiConversation`, `AiMessage` e `AiUsage`, campos de foto e de
chegada em `TripStop`/`TripActivity`, rotas `/api/trips/[id]/ia/*` e
`/api/externo/*`.

---

## O problema

O roteiro da 0003 funciona, mas tudo nele é digitado: a distância, o tempo de
estrada, o que visitar e as coordenadas. E quando vem de fora, chega errado.
Três casos reais da viagem da Serra Gaúcha:

- **A distância muda conforme a fonte.** Itapema → Cambará do Sul aparece como
  330 km no primeiro roteiro e 470 km no JSON de outra IA. Pelas ruas, o OSRM
  diz **370 km e 5h07**.
- **O JSON gerado fora quebra na importação, um erro por vez.** Categoria
  "Natureza", `"period": "DIA"`, `hour` no lugar de `time` e um dia depois da
  volta. A tela mostrava só o primeiro erro, e a importação gravava sem mostrar
  o que ia entrar.
- **Planejar exige sair do app.** Pergunta-se a uma IA, copia-se o JSON e
  importa-se. Para mudar uma coisa, repete-se tudo.

Falta ainda o que se consulta antes de decidir: como estará o tempo, como é o
lugar (foto e resumo) e o que mais existe para fazer em cada cidade.

---

## Restrição: uma chave só

A única chave é a da Anthropic (`ANTHROPIC_API_KEY`). Todo outro serviço
funciona **sem chave e sem cadastro**. O que só existe com chave fica de fora, a
começar pelo **trânsito em tempo real**.

| Uso | Serviço | Chave | Regras que valem aqui |
| --- | --- | --- | --- |
| Rota pelas ruas | OSRM, servidor de demonstração | não | 1 req/s, uso razoável e **não comercial**, sem garantia de ficar no ar ([política](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server)) |
| Mapa com ruas | tiles do OpenStreetMap | não | só HTTPS; crédito visível no mapa; `Referer` enviado; respeitar cache; **proibido** baixar em massa, pré-carregar e uso offline ([política](https://operations.osmfoundation.org/policies/tiles/)) |
| Coordenadas de cidade fora da lista | Nominatim (OpenStreetMap) | não | **máximo 1 req/s** somando todos os usuários; User-Agent do app; cache obrigatório; **proibido autocompletar**; dá para desligar sem mudar código ([política](https://operations.osmfoundation.org/policies/nominatim/)) |
| Clima | Open-Meteo | não | **não comercial**, menos de 10 mil chamadas/dia; dados CC-BY 4.0, com crédito ([termos](https://open-meteo.com/en/terms)) |
| Fotos e resumos | Wikipedia + Wikimedia Commons | não | User-Agent do app; crédito e licença de cada foto (o Commons informa se é obrigatório) |
| Planejar, sugerir, editar | API da Anthropic | **sim** | cobrança por uso; ver *Custo* |

O app é de uso pessoal, sem assinatura nem anúncio. Se um dia virar comercial,
OSRM e Open-Meteo precisam ser trocados (OSRM próprio, plano pago do Open-Meteo).
Por isso cada serviço fica atrás de uma variável de ambiente com a URL base, e
nenhum endereço fica fixo no código.

Testado em 08/10/2026, sem chave:

- **OSRM**, Itapema → Cambará do Sul: `Ok`, 370 km, 307 min, polyline de 215
  caracteres.
- **Open-Meteo**: o arquivo histórico devolve máxima, mínima e chuva de Gramado
  em 13–16/12/2025. A previsão aceita no máximo **16 dias**.
- **Wikipedia**:
  - "Catedral de Pedra", "Cânion Itaimbezinho", "Mini Mundo" e "Gramado"
    devolvem foto e resumo;
  - "Lago Negro (Gramado)" não existe, mas a busca acha "Lago Negro";
  - o Commons devolve licença (CC BY-SA 3.0), autor e se o crédito é
    obrigatório.

---

## A proposta

São sete peças, em ordem de dependência. As três primeiras não dependem de
nenhum serviço externo pago.

### 1. Preview da importação

Hoje `validarRoteiroImportado` para no primeiro erro, e a rota grava direto.

- Uma função nova, `analisarRoteiro(json, trip)`, junta **todos** os problemas
  de uma vez e devolve `{ data, erros: [], avisos: [] }`.
  - Cada erro diz o item e o que fazer: "Atividade 3 (Cânion Fortaleza):
    categoria 'Natureza' não existe. Use uma de: Transporte, Hospedagem,
    Alimentação, Passeios, Compras, Outros".
  - Os erros mais comuns ganham sugestão de troca: `hour` → `time`, `DIA` →
    `MANHA`, `Natureza`/`Natal` → `Passeios`, `Gastronomia` → `Alimentação`,
    `Deslocamento` → `Transporte`.
- **Avisos não bloqueiam**:
  - falta a parada de saída (a primeira parada tem trecho);
  - duas paradas no mesmo dia sem `order`;
  - distância muito diferente da que o OSRM calcula (depois da fase de rota);
  - atividade em dia sem parada.
- `validarRoteiroImportado` continua existindo, por cima de `analisarRoteiro`,
  e a rota de importação continua usando ela. **O servidor valida de novo ao
  confirmar**; o preview roda no navegador e nunca é confiável.
- A tela tem duas etapas:
  1. **Colar:** os erros aparecem ao lado do JSON, com o item destacado.
  2. **Conferir:** o mapa esquemático com a rota, os blocos, a lista de dias e
     os avisos, com os botões **Confirmar** e **Voltar e editar**.

  O mesmo componente de preview serve à IA (peça 7).

### 2. Blocos por cidade

O bloco é a estadia, derivado de `estadias()`, sem tabela nova. Na viagem da
Serra:

**Saída de Itapema → Cambará do Sul → Gramado → Bento Gonçalves → Volta para Itapema**

- O bloco de saída e o de volta representam o **trecho de estrada**. O de cada
  cidade representa a **estadia**.
- O cartão do bloco mostra:
  - foto da cidade;
  - nome e datas ("13 a 16/12 · 3 noites");
  - hospedagem;
  - clima resumido (peça 4);
  - quantidade de atividades;
  - estimado e gasto do bloco (soma dos dias da estadia).
- A fila de blocos fica no topo da aba Roteiro, abaixo do mapa, no lugar das
  pílulas de parada da 0003, que somem.
- Clicar no bloco abre o **detalhe**:
  - painel lateral no desktop e tela cheia no celular;
  - URL própria (`?aba=roteiro&bloco=<stopId>`), para o voltar do navegador
    fechar o painel;
  - o cartão do bloco morfa no painel com `<ViewTransition name>`;
  - `prefers-reduced-motion` troca a animação por um corte.
- O detalhe tem:
  1. **Chegada:** o trajeto real até a cidade (peça 5), com km, tempo típico,
     horário de saída sugerido e o link do Google Maps.
  2. **Os dias:** a mesma `TimelineDoRoteiro`, filtrada aos dias do bloco.
  3. **Clima** dia a dia.
  4. **Lugares**, com foto e resumo das atividades.
  5. **Sugestões** (peça 6).

### 3. Fotos por URL

O app guarda **URLs, nunca arquivos**. Não baixa, não redimensiona e não
hospeda imagens.

Campos novos, iguais em `TripStop` e `TripActivity`:

| Campo | Para quê |
| --- | --- |
| `wikiTitle` | título da página na Wikipedia em português |
| `photoUrl` | URL `https` da imagem |
| `photoCredit` | autor e licença, já formatados ("Vinicios de Moura · CC BY-SA 3.0") |
| `photoSourceUrl` | página de onde a foto veio, para o link "fonte" |

Origem da foto, em ordem de preferência:

1. **Wikipedia/Wikimedia.**
   - Com `wikiTitle`, o servidor chama `page/summary` e pega
     `originalimage`/`thumbnail` e o resumo.
   - Sem título, busca (`list=search`) pelo nome da atividade com a cidade, e
     só preenche se o primeiro resultado tiver foto. O usuário confirma no
     formulário.
   - A licença e o autor vêm do Commons (`imageinfo` com `extmetadata`).
   - A miniatura sai do Commons com 800 px de largura (`iiurlwidth=800`), em
     vez do original, que pode ter vários MB.
2. **URL colada pelo usuário.** Campo "Foto (link)" no `ParadaForm` e no
   `AtividadeForm`, só `https`, com prévia ao colar.
   - O crédito é livre e opcional.
   - `photoSourceUrl` fica igual à própria URL.
3. **`og:image` da página oficial**, só para lugares sugeridos pela IA (peça 6).
   - A ferramenta de ler páginas do Claude devolve o texto, não as meta tags. Por
     isso quem lê a imagem de capa é o **nosso servidor**, a partir da URL que o
     Claude citou como fonte.
   - É um fetch de servidor para uma URL vinda de fora, e por isso tem proteção
     contra SSRF:
     - só `https` e porta padrão;
     - resolve o DNS e recusa IP privado, loopback, link-local e metadados de
       nuvem;
     - no máximo 3 redirecionamentos, cada um checado de novo;
     - timeout de 5 s;
     - lê só os primeiros 256 KB e só o `<head>`.
   - Grava `photoUrl` e `photoSourceUrl` (a página), com o crédito "foto:
     <domínio>".

Na tela:

- `<img loading="lazy" decoding="async">` com `aspect-ratio` fixo, para o layout
  não pular.
- `onError` volta ao visual sem foto, um bloco com a cor da cidade e o ícone.
- O crédito aparece sobre a foto, pequeno, com link.
- **Sem `next/image`.** Ele exigiria liberar domínios remotos arbitrários
  (`remotePatterns`) para a URL colada.
- Os resultados da Wikipedia e do Commons ficam em `ExternalCache` por 30 dias.

### 4. Clima

O Open-Meteo é chamado pelo servidor, com cache. Sem coordenada, não há clima.

- **Faltando mais de 15 dias, vale a média histórica.**
  - Uma chamada ao arquivo histórico (`archive-api`) pega os mesmos dias do
    ano nos **últimos 10 anos** de uma vez.
  - A conta é feita em `src/lib/clima.js`, pura e testável: média da máxima e
    da mínima e percentual de dias com chuva acima de 1 mm.
  - O selo diz "média de 10 anos".
  - Cache de 30 dias por cidade e período, porque o passado não muda.
- **Dentro da janela da previsão (16 dias), vale a previsão.**
  - Endpoint `forecast` diário: máxima, mínima, probabilidade de chuva e código
    do tempo.
  - O selo diz "previsão · atualizada às 14h".
  - Cache de 3 horas.
- **Período misto:** quando parte dos dias está dentro da janela e parte fora,
  cada dia mostra a sua fonte.
- **Onde aparece:** o cartão do bloco mostra o resumo ("12–24 °C, chuva em 30%
  dos dias"), e o cartão do dia mostra ícone, máxima, mínima e chance de chuva.
- O crédito "Dados: Open-Meteo (CC-BY 4.0)" fica no rodapé do clima.
- **Em pane**, o espaço do clima some com "clima indisponível agora". Nada mais
  depende dele.

### 5. Rota pelas ruas

O OSRM é chamado pelo servidor (`OSRM_URL`, padrão
`https://router.project-osrm.org`), com perfil `driving` e
`overview=simplified`.

- **Cache por par de coordenadas, em `ExternalCache`.**
  - A chave é `osrm:<lat,lng>;<lat,lng>`, com 4 casas (~11 m).
  - O cache vale até as coordenadas mudarem; como a chave é a coordenada, mudar
    a parada é mudar a chave.
  - O botão **"Atualizar rota"** força uma nova chamada, no máximo uma por
    trecho a cada 10 minutos.
  - Uma fila no servidor garante **no máximo 1 chamada por segundo**.
- O resultado alimenta:
  - o km e o tempo do selo do trecho, marcados "pelas ruas";
  - o carro do mapa esquemático, que passa a seguir a polyline real;
  - o mapa com ruas do detalhe do bloco.
- **Os números digitados continuam.** `legKm` e `legMinutes` passam a ser
  sobrescrita manual: se preenchidos, valem eles, com o selo "informado". Se
  vazios, vale o OSRM. Se o OSRM falhar, vale o digitado. Se nada existir, o
  selo some.
- **Sem trânsito em tempo real.** O OSRM não tem, e a tela não finge que tem: o
  tempo aparece como **"tempo típico, sem trânsito"**. No lugar do recálculo
  com trânsito, entram três coisas:
  - **Horário de saída sugerido.** A parada ganha `arriveBy` ("17:00",
    opcional), e a saída sugerida é `arriveBy − tempo × (1 + folga)`. A folga é
    `Trip.roadBufferPct` (padrão 20%), sobrescrita por trecho em
    `TripStop.legBufferPct`.
  - **Aviso de trecho de serra.** O OSRM público não informa a subida
    acumulada, então o aviso usa uma regra simples: o trecho que chega a uma
    parada acima de 700 m de altitude ganha a sugestão de +10% de folga, que o
    usuário aceita ou não. A altitude vem de graça na resposta do Open-Meteo
    (Gramado: 849 m).
  - **"Ver trânsito agora"**, um link para o Google Maps com origem e destino
    preenchidos
    (`https://www.google.com/maps/dir/?api=1&origin=lat,lng&destination=lat,lng&travelmode=driving`).
    É URL pública, sem API e sem chave. Aparece com destaque na semana da
    viagem e no dia do trecho.
- **Mapa com ruas, só no detalhe do bloco.** Esta parte revê a decisão da 0003
  de não ter tiles.
  - Usa **Leaflet** (raster, leve, sem WebGL) com os tiles do OpenStreetMap,
    carregado com `import()` só quando o detalhe abre.
  - Mostra o crédito "© OpenStreetMap" fixo no canto do mapa.
  - Não pré-carrega áreas e não tem modo offline.
  - O mapa esquemático em SVG continua na visão geral, com a animação da 0003.
  - **A página da viagem não pode ter `Referrer-Policy: no-referrer`.** Hoje só
    o convite e o login têm, e assim fica.
- **Em pane**, o detalhe do bloco mostra o mapa esquemático ampliado no lugar
  do mapa com ruas.

### 6. Sugestões de passeios

No detalhe do bloco, o botão **"Sugerir passeios em Gramado"** chama
`POST /api/trips/[id]/ia/sugestoes` com o `stopId`.

- **O que o Claude recebe:**
  - cidade, datas da estadia e quem viaja (o texto livre de
    `Trip.travelerNotes`, campo novo: "casal com cachorro pequeno, de carro");
  - o que já está no roteiro daqueles dias;
  - o clima do período.

  Tudo isso vai num bloco de dados separado das instruções.
- **Ferramentas:** a busca na web e a leitura de páginas
  (`web_search_20250305` e `web_fetch_20250910`; as versões `_20260209` não
  valem para o Haiku 5.5), com no máximo 5 buscas por chamada (`max_uses`), e
  uma ferramenta nossa, `entregar_sugestoes`, com `strict: true`.
- **A data de hoje vai no prompt**, com a instrução de procurar o que muda
  (datas de eventos como o Natal Luz, horários, preços e regras para pets). Sem
  isso, o Haiku tende a responder de memória.
- **Formato da entrega.** A saída estruturada (`output_config.format`) não
  combina com citações, e a busca na web gera citações. Por isso a entrega é a
  ferramenta `entregar_sugestoes`, cujo schema é a resposta. Cada sugestão traz:
  - `title`, `summary` (até 300 caracteres) e `category` (enum de
    `TRIP_CATEGORIES`);
  - `period` (`MANHA`, `TARDE` ou `NOITE`) e `pet` (`SIM`, `NAO` ou
    `VERIFICAR`);
  - `estimatedCost` (número ou nulo);
  - `wikiTitle` (ou nulo);
  - `sources` (uma ou mais URLs, obrigatório);
  - `officialUrl` (ou nulo).
  - O `tool_choice` fica em `auto`, porque forçar a ferramenta faria o Haiku
    pular o raciocínio e as buscas. O prompt pede a ferramenta no fim, e o
    servidor confere se ela foi chamada. Se não foi, faz uma segunda chamada
    sem ferramentas, com saída estruturada e o texto da primeira.
- **Depois da resposta, o servidor:**
  - valida cada item com as mesmas regras de `validarAtividade`, menos a data,
    e descarta o inválido;
  - busca a foto: Wikipedia primeiro, `og:image` de `officialUrl` se não
    houver;
  - guarda tudo em `AiSuggestion`, por viagem e parada.
- **Na tela:**
  - cartões com foto, resumo, selo de pet e a lista de fontes como links;
  - **"Adicionar ao dia…"** abre o `AtividadeForm` preenchido, com a foto;
  - **nada entra no roteiro sem passar pelo formulário**;
  - "Atualizar sugestões" gera de novo, contando no limite diário.

### 7. Planejar e editar por conversa

Uma aba nova, **"Planejar com IA"**, com um chat por viagem.

- **Roteiro vazio:** o Claude devolve o roteiro inteiro no formato da
  importação, e o resultado cai no **mesmo preview** da peça 1.
- **Roteiro existente:** o Claude recebe o roteiro atual (paradas e atividades,
  com ids) e devolve **operações**:

  | Operação | Campos |
  | --- | --- |
  | `addStop` | os de `validarParada`, sem `lat`/`lng` |
  | `updateStop` | `stopId` + campos que mudam |
  | `removeStop` | `stopId` |
  | `addActivity` | os de `validarAtividade` |
  | `updateActivity` | `activityId` + campos que mudam |
  | `removeActivity` | `activityId` |
  | `moveActivity` | `activityId`, `date`, `period`, `order` |

- **A IA não inventa coordenada nem distância.** `addStop` traz `city` e `uf`,
  e o servidor resolve a coordenada nesta ordem:
  1. `lugares.js`;
  2. `ExternalCache`;
  3. Nominatim (uma busca por cidade, na fila de 1 req/s, só ao gerar a
     proposta).

  Sem resultado, a operação vai para o preview marcada "cidade não encontrada",
  e o usuário cola a coordenada. A distância sai do OSRM depois de confirmar.
- **Proposta guardada no servidor.**
  - Cada resposta com operações vira uma `TripProposal`, com as operações já
    resolvidas e a **versão do roteiro** em que se baseiam: um hash das paradas
    e atividades, por `id` e `updatedAt`.
  - O preview de diferenças mostra a proposta: entra em verde, sai em
    vermelho, muda com antes → depois.
  - **Confirmar** manda só o id da proposta, e o servidor aplica **exatamente**
    o que guardou. A tela não reenvia as operações, então não dá para aplicar
    algo diferente do que se viu.
  - Se o roteiro mudou desde a proposta (o outro participante editou), a
    confirmação é recusada com "o roteiro mudou; peça uma nova proposta".
  - A aplicação é um único `$transaction`, validando cada operação. Uma falha
    derruba todas.
  - A proposta expira em 24 h e só pode ser aplicada uma vez (`appliedAt`), com
    a mesma técnica do `updateMany` do convite da 0002.
- **O que fica salvo.** O histórico da conversa fica em `AiMessage`, com o
  conteúdo **exatamente** como a API devolveu, inclusive blocos de raciocínio.
  - O histórico é só de acréscimo: nada é editado nem reordenado, porque os
    modelos atuais invalidam o raciocínio de um histórico alterado.
  - Uma conversa por viagem e por pessoa.
  - Qualquer participante usa a sua; a proposta é aplicada por quem a viu.

### Modelo, custo e limites

- **Modelo:** `claude-haiku-5-5` em tudo (decisão de 08/10/2026), com
  raciocínio adaptativo e `effort` explícito:
  - `medium` nas sugestões;
  - `high` no planejamento, que exige seguir regras à risca.
- **Particularidades do Haiku 5.5:**
  - sem `temperature`, `top_p`, `top_k` nem prefill;
  - a resposta pode começar com blocos de raciocínio, então o conteúdo é lido
    por `type`, nunca por posição.
- **Recusas:** o Haiku 5.5 **não tem fallback no servidor** (o parâmetro
  `fallbacks` não vale para ele). Uma recusa (`stop_reason: "refusal"`) vira
  mensagem na tela, com a sugestão de reformular o pedido.
- **Custo:** o Haiku 5.5 cobra US$ 0,10 por milhão de tokens de entrada e
  US$ 0,50 de saída, enquanto o prompt tiver até 100 mil tokens (acima disso,
  US$ 0,50 e US$ 2,50). A busca na web é cobrada à parte, por pesquisa, e nas
  sugestões tende a custar mais que os tokens. Os números reais vêm de `usage`,
  gravados em `AiUsage`.
- **Limites, configuráveis por variável de ambiente:**
  - `IA_LIMITE_DIARIO` (padrão 30 chamadas por pessoa por dia);
  - `IA_LIMITE_MENSAL_USD` (padrão 10): passou do teto, as funções de IA
    pausam até o mês virar, com a mensagem dizendo isso.
- **Visibilidade:** a aba "Planejar com IA" mostra quanto aquela viagem já
  custou ("US$ 0,42 em 18 chamadas").
- **Prompt caching** na parte estável (instruções, schema e roteiro atual), para
  as rodadas seguintes da conversa ficarem mais baratas.
- **Sem chave:** sem `ANTHROPIC_API_KEY`, as peças 6 e 7 somem da tela com
  "IA não configurada". As peças 1 a 5 funcionam igual.

### Segurança

- **A chave só no servidor.** `ANTHROPIC_API_KEY` nunca leva `NEXT_PUBLIC_` e
  nunca aparece em resposta de rota nem em log.
- **Acesso:** toda rota `/api/trips/[id]/ia/*` começa por `tripAccess`, e quem
  não participa recebe 404.
- **Texto da web é dado, não instrução.** O conteúdo de páginas e buscas pode
  tentar mandar no modelo. Duas barreiras:
  1. as instruções dizem que o conteúdo buscado é material de consulta;
  2. o que importa: **nenhuma resposta da IA grava nada.** Sugestão vira
     formulário, e proposta vira preview que a pessoa confirma.
- **Dados de outras pessoas não vão para a IA.** O roteiro e os gastos
  enviados são só os da viagem, pela mesma porta estreita da 0002. Em viagem
  compartilhada, as notas e os valores do outro participante não vão. Vai só o
  total por dia, que ele já vê.
- **SSRF** no `og:image`, como descrito na peça 3.
- **Links e fotos** só `https` (hoje `validarParada` aceita `http`; passa a
  recusar nos campos novos e mantém os antigos como estão).
- **Rotas `/api/externo/*`** (clima, rota, wiki e geocodificação) exigem login.
  Elas não são um proxy aberto: só aceitam os parâmetros que o app usa.

---

## Modelo de dados

```prisma
// Cache de serviços externos (OSRM, Open-Meteo, Wikipedia, Commons,
// Nominatim). Não é dado de usuário: a chave é coordenada ou título.
model ExternalCache {
  key       String   @id
  value     Json
  fetchedAt DateTime @default(now()) @map("fetched_at")
  expiresAt DateTime @map("expires_at")

  @@index([expiresAt])
  @@map("external_cache")
}

model Trip {
  // ...
  roadBufferPct  Int    @default(20) @map("road_buffer_pct")
  travelerNotes  String @default("") @map("traveler_notes")
}

model TripStop {
  // ...
  arriveBy       String? @map("arrive_by")       // "HH:MM"
  legBufferPct   Int?    @map("leg_buffer_pct")
  wikiTitle      String? @map("wiki_title")
  photoUrl       String? @map("photo_url")
  photoCredit    String? @map("photo_credit")
  photoSourceUrl String? @map("photo_source_url")
}

model TripActivity {
  // ...
  wikiTitle      String? @map("wiki_title")
  photoUrl       String? @map("photo_url")
  photoCredit    String? @map("photo_credit")
  photoSourceUrl String? @map("photo_source_url")
}

model AiConversation {
  id        String   @id @default(uuid())
  tripId    String   @map("trip_id")
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  trip     Trip        @relation(fields: [tripId], references: [id], onDelete: Cascade)
  user     User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages AiMessage[]

  @@unique([tripId, userId])
  @@map("ai_conversations")
}

// Só acréscimo. `content` é o que a API devolveu, sem tirar nada.
model AiMessage {
  id             String   @id @default(uuid())
  conversationId String   @map("conversation_id")
  role           String   // user ou assistant
  content        Json
  createdAt      DateTime @default(now()) @map("created_at")

  conversation AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("ai_messages")
}

model TripProposal {
  id          String    @id @default(uuid())
  tripId      String    @map("trip_id")
  userId      String    @map("user_id")
  kind        String    // ROTEIRO (importação completa) ou OPERACOES
  payload     Json      // operações já resolvidas (com coordenadas)
  baseVersion String    @map("base_version")
  expiresAt   DateTime  @map("expires_at")
  appliedAt   DateTime? @map("applied_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@index([tripId])
  @@map("trip_proposals")
}

model AiSuggestion {
  id        String   @id @default(uuid())
  tripId    String   @map("trip_id")
  stopId    String   @map("stop_id")
  items     Json
  createdAt DateTime @default(now()) @map("created_at")

  trip Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  stop TripStop @relation(fields: [stopId], references: [id], onDelete: Cascade)

  @@index([tripId, stopId])
  @@map("ai_suggestions")
}

model AiUsage {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  tripId       String?  @map("trip_id")
  kind         String   // SUGESTOES ou PLANEJAR
  model        String
  inputTokens  Int      @map("input_tokens")
  outputTokens Int      @map("output_tokens")
  cacheRead    Int      @default(0) @map("cache_read")
  webSearches  Int      @default(0) @map("web_searches")
  costUsd      Float    @map("cost_usd")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt])
  @@map("ai_usage")
}
```

`AiUsage.tripId` não tem FK de propósito: apagar a viagem não pode apagar o
registro do que já foi gasto, que conta no teto do mês.

Nenhum modelo novo entra em `SCOPED_MODELS`. `ExternalCache` não é de ninguém,
e os outros passam por `tripAccess`.

---

## Código

### Arquivos novos

| Arquivo | O que faz | Testável sem rede |
| --- | --- | --- |
| `src/lib/importacao.js` | `analisarRoteiro`: todos os erros, avisos e sugestões de troca | sim |
| `src/lib/blocos.js` | blocos a partir de `estadias()` e dos dias | sim |
| `src/lib/clima.js` | escolha média × previsão por dia; média de 10 anos; resumo do bloco | sim |
| `src/lib/estrada.js` | km/tempo efetivos (informado × OSRM), saída sugerida, folga, link do Google Maps | sim |
| `src/lib/operacoes.js` | valida e aplica operações sobre um roteiro em memória; versão do roteiro | sim |
| `src/lib/externo/*.js` | clientes de OSRM, Open-Meteo, Wikipedia, Commons e Nominatim; cache e fila | com `fetch` simulado |
| `src/lib/externo/ogImage.js` | leitura de `og:image` com a proteção contra SSRF | com DNS e `fetch` simulados |
| `src/lib/ia/*.js` | cliente da Anthropic, prompts, schemas, registro de uso, limites | com cliente simulado |

`operacoes.js` aplica as operações primeiro **em memória**, sobre o roteiro
atual, e valida o resultado inteiro com as regras da 0003. Só então a rota grava
num `$transaction`. Assim o preview de diferenças e a gravação usam o mesmo
código.

### Rotas

| Rota | Método | Quem |
| --- | --- | --- |
| `/api/trips/[id]/itinerary/preview` | POST: analisa sem gravar | participante |
| `/api/trips/[id]/itinerary` | POST: importa (já existe; passa a usar `analisarRoteiro`) | dono |
| `/api/externo/rota` | GET `?de=lat,lng&para=lat,lng` | logado |
| `/api/externo/clima` | GET `?lat&lng&de&ate` | logado |
| `/api/externo/wiki` | GET `?titulo=` ou `?busca=` | logado |
| `/api/externo/cidade` | GET `?nome=&uf=`: Nominatim, só ao clicar em "Buscar" | logado |
| `/api/trips/[id]/ia/sugestoes` | POST `{ stopId }`, GET (do cache) | participante |
| `/api/trips/[id]/ia/conversa` | GET (histórico), POST `{ texto }` | participante |
| `/api/trips/[id]/ia/propostas/[pid]` | GET (preview), POST (aplica) | quem gerou |

### Dependências novas

- `@anthropic-ai/sdk`: o SDK oficial da Anthropic.
- `leaflet`, numa versão exata, carregado com `import()` só no detalhe do bloco.

---

## Fases

Cada fase termina com `npm test` passando, e nenhum teste usa rede nem gasta
dinheiro.

### Fase 1: preview da importação
- `importacao.js` e os testes:
  - o JSON real com "Natureza", `"DIA"`, `hour` e o dia 19 dá **quatro erros de
    uma vez**, com a sugestão de troca;
  - avisos de saída faltando e de `order` faltando;
  - um roteiro válido passa sem erro.
- Rota de preview e a tela em duas etapas.

### Fase 2: blocos e detalhe
- `blocos.js`, a fila de blocos e o painel de detalhe com o que já existe:
  dias, hospedagem, estimado e gasto.
- `?bloco=` na URL e `<ViewTransition>`.

### Fase 3: fotos
- Campos de foto nas paradas e atividades (migration).
- `externo/wiki` com cache; campo de link com prévia; crédito na tela.
- Testes:
  - `http:` e `javascript:` recusados;
  - página sem foto;
  - título resolvido pela busca.

### Fase 4: clima
- `clima.js` e `externo/clima`.
- Testes: a borda dos 16 dias, o período misto e a média de 10 anos com um
  ano faltando.

### Fase 5: rota pelas ruas
- `estrada.js`, `externo/rota` com fila e cache, `arriveBy` e folga
  (migration).
- O carro passa a seguir a polyline real.
- Leaflet no detalhe.
- Testes:
  - o informado vence o OSRM;
  - o OSRM fora do ar cai no informado;
  - a saída sugerida com folga;
  - a chave de cache muda quando a coordenada muda;
  - a fila respeita 1 por segundo.

### Fase 6: sugestões com IA
- `@anthropic-ai/sdk`, `ia/*`, `AiUsage` e `AiSuggestion` (migration).
- `og:image` com SSRF.
- Testes, com o cliente simulado:
  - a ferramenta não chamada cai na segunda chamada;
  - item inválido é descartado;
  - recusa vira mensagem;
  - limite diário e teto mensal;
  - sem chave, a função some.
- Testes de SSRF: IP privado, redirecionamento para IP privado, `http:` e
  resposta grande.

### Fase 7: planejar por conversa
- `operacoes.js`, `TripProposal`, `AiConversation` e `AiMessage` (migration);
  a aba "Planejar com IA" e o preview de diferenças.
- Testes:
  - cada operação;
  - aplicação atômica (uma inválida derruba todas);
  - id de outra viagem;
  - proposta aplicada duas vezes;
  - proposta expirada;
  - roteiro que mudou depois da proposta;
  - cidade não encontrada.

---

## Notas da implementação

O que mudou em relação ao texto aprovado, e por quê:

- **Preview no navegador, sem rota própria.** `analisarRoteiro` roda na tela
  enquanto se cola, e a rota de importação roda a mesma análise antes de
  gravar. A rota `/itinerary/preview` da tabela não foi necessária.
- **Planejar: um caminho só.** Roteiro vazio não volta no formato de
  importação: a IA propõe operações, que no roteiro vazio são só adições.
  Assim o preview de diferenças e a aplicação são os mesmos nos dois casos.
- **Sem a ferramenta de ler páginas.** Nas sugestões, a busca na web basta, e
  quem lê a imagem de capa (`og:image`) é o servidor do app, com a proteção
  contra SSRF. Uma ferramenta a menos, uma conta a menos.
- **Rajada na Wikimedia.** A primeira versão fazia 11 pedidos por busca e
  levou 429. A busca agora é um pedido só (`generator=search` com
  `pageimages` e `extracts`); o crédito da foto só é pedido para a foto que
  aparece. O User-Agent leva a página pública do projeto como contato.
- **Filas por serviço.** No máximo 2 pedidos simultâneos por host; OSRM e
  Nominatim, um por vez com 1,1 s entre eles, somando todos os usuários.
- **Foto da cidade.** Busca a página cujo título começa com o nome da cidade:
  o primeiro resultado com foto, para "Cambará do Sul Rio Grande do Sul", era
  a página do estado.
- **Modelos novos.** `AiConversation` sem FK para o usuário (sai junto com a
  viagem); `AiMessage` com `texto` (o que a tela mostra) e `proposalId`;
  `TripProposal` com `resumo`, `discardedAt` e o `payload` guardando
  `{ toolUseId, ops, diff, erros }`.
- **Rotas extras.** `/api/externo/cidade` (busca de cidade ao clicar) e
  `/api/trips/[id]/ia/uso` (situação dos limites para a tela).
- **Versão do roteiro conferida duas vezes** ao aplicar uma proposta: antes e
  dentro da transação, para uma edição no meio-tempo não passar.
- **Não testado com a API de verdade.** Sem chave válida no ambiente de
  desenvolvimento, as chamadas ao Claude foram testadas com cliente simulado
  e, de ponta a ponta, só até a recusa de uma chave falsa. A primeira chamada
  real pode revelar ajuste no schema da ferramenta ou na busca na web.

## Fora do escopo

- **Trânsito em tempo real.** Exige chave (Google Routes, Mapbox, TomTom). O
  link "ver trânsito agora" cobre o caso.
- **Guardar imagens**, redimensionar ou usar o Google Places.
- **Mapa offline** (proibido pelos tiles do OpenStreetMap) e app offline.
- **Autocompletar cidades pelo Nominatim** (proibido). A lista de `lugares.js`
  continua autocompletando, e o Nominatim só roda ao clicar em "Buscar".
- **Reservas** de hotel ou ingresso.
- **A IA lendo gastos** além do total por dia.
- **Voz.**

---

## Decisões

Respondidas em 08/10/2026:

1. **Modelo:** Claude Haiku 5.5 nas duas funções.
2. **Limites:** 30 chamadas por pessoa por dia e teto de US$ 10 por mês no app
   inteiro.
3. **`og:image` da página oficial:** entra na fase 6, com a proteção contra
   SSRF.
4. **Mapa com ruas:** só no detalhe do bloco; o esquemático fica na visão
   geral.
5. **Quem viaja:** texto livre na viagem (`travelerNotes`).
