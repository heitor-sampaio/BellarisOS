# DEVLOG — BellarisOS

Registro do desenvolvimento: o que existe hoje, como chegamos aqui e o que está
em aberto. Documento único.

**Última atualização: 2026-09-18.**

> **Este arquivo se atualiza a cada entrega** — feature nova ou edição do que já
> existe (CLAUDE.md §16). Não é para acumular até o fim de uma frente: foi assim
> que ele ficou três meses parado. Mudou o que o sistema faz, uma decisão de
> produto ou o que está em aberto? O texto muda junto, no mesmo commit.
>
> O detalhe de cada mudança está nas mensagens de commit: `git log --oneline`.
> Aqui é o panorama, não o diário linha a linha.

---

## 1. O que é o produto

**BellarisOS é o ERP + CRM de clínicas de estética** — a ferramenta em que a
clínica opera o dia inteiro: agenda, prontuário, clientes, conversas, comercial,
estoque e financeiro. O financeiro é uma parte, não o centro.

**O cliente típico tem uma unidade.** Multiunidade existe no modelo (todo dado
carrega `tenantId` + `branchId`, e o portal da rede consolida), mas é exceção:
rede grande costuma ser franquia, e franquia já chega com sistema próprio. Na
dúvida de projeto, otimizar para a clínica única sem tornar a segunda unidade
impossível.

Três superfícies: **portal da rede** (`/admin`), **portal da unidade**
(`/[slug]`) e **app mobile** (Expo, com fluxo operacional e fluxo do cliente).
Há ainda uma **extensão de Chrome** para o time comercial agendar em qualquer
unidade.

---

## 2. Estado atual (2026-09-18)

### Operação

- **Agenda** — grade por unidade e consolidada na rede, com confirmar, check-in,
  no-show, cancelar com motivo e remarcar sem sair do portal em que se está.
  Agendar exige só **nome e telefone**; o cliente nasce no ato e é deduplicado
  por dígitos do telefone (`cliente_por_telefone`).
- **Atendimento** — sessão com anamnese, ficha de atendimento, fotos, consumo de
  estoque, comissão, fidelidade e recebimento no check-in.
- **Clientes** — ficha com histórico, oportunidades, planejamento, financeiro,
  documentos e dados; desativar/reativar; crédito interno. A aba aberta e o que
  está aberto dentro dela ficam na URL (`?aba=`, `?planejamento=`, `?aberto=`),
  então o voltar do aparelho anda um passo de cada vez.
- **Planejamento** — seção própria no menu, com **Tratamentos** (planos que viram
  venda no checkout) e **Injetáveis** (mapa facial com pontos, produto e dose).
  Os dois têm o mesmo desenho: **nome primeiro, cliente opcional** — dá para
  planejar avulso e ligar a uma pessoa depois. A aplicação do injetável é outra
  coisa: cópia congelada no prontuário, feita dentro do atendimento e só com
  cliente ligado. O mapa aceita quatro ilustrações (rosto/corpo ×
  feminino/masculino) e zoom por pinça no celular. **Nos dois, o que está aberto
  tem URL própria** (`…/planejamentos/<id>`, `…/injetaveis/<id>`): no aparelho
  ocupa a tela inteira, com "voltar" para a lista.
- **CRM** — Inbox omnichannel (WhatsApp por uazapi e API oficial da Meta,
  Instagram, Messenger), funil de oportunidades, templates HSM, atribuição de
  origem de lead.
- **Estoque** — produtos, lotes, movimentações, transferência entre unidades,
  mínimo por filial, histórico por produto.
- **Financeiro** — receitas e despesas, parcelas, estorno com crédito interno,
  comissões, DRE, indicadores por unidade e consolidados.
- **Relatórios (BI)** — oito abas: visão geral, financeiro, agenda, clientes,
  procedimentos, profissionais, estoque e comercial.
- **Configurações** — unidades, cargos, modelos de ficha (anamnese e
  atendimento), integrações, LGPD.

### Plataforma

- Next.js 16 (App Router, Server Actions) + Supabase (Postgres, Auth, Storage,
  RLS) + Turborepo/pnpm. Deploy na Railway (uma réplica, us-east4); banco em
  us-east-1.
- **Autorização dinâmica:** cargos por rede, 14 módulos com nível
  (NONE/VIEW/MANAGE), escopo (OWN/ALL) em cinco deles, abrangência pelo
  `users.branch_id`, e as abas de Relatórios liberadas uma a uma
  (`role_report_tabs`).
- **Indicadores:** fonte única em `lib/metrics/`, agregação no Postgres, fuso do
  negócio resolvido em `lib/datetime.ts`.
- **Testes:** 108 unitários (Vitest) + 26 E2E (Playwright) rodando contra o banco
  de desenvolvimento. `pnpm test` e `pnpm --filter web test:e2e`.
- **Cron:** serviço na Railway roda `scripts/cron.mjs` de hora em hora
  (campanhas de notificação e exportações de LGPD).

---

## 3. Linha do tempo

### 2026-06-20 — Fundação (Sprint 1)

Monorepo Turborepo + pnpm (`apps/web`, `apps/mobile`, `packages/{db,types,validators,utils}`),
Supabase provisionado, auth com custom JWT claims, RLS, layouts dos dois portais,
login e design system "Rosé Vivo" em `globals.css`.

Decisões que seguem valendo: pnpm 11 exige `allowBuilds` explícito; React 19 pede
`(prevState, formData)` em `useActionState`; os packages são resolvidos por
`paths` do tsconfig em dev.

> O projeto Supabase daquela época (`tljoelsndawvfvifepqo`, sa-east-1) foi
> **aposentado**. O ativo é `tagetlgivjbwhfscofjs` (us-east-1), criado em 08/07
> para casar com a região do Railway.

### 2026-07 — Núcleo operacional, CRM e cargos

Clientes, procedimentos, agenda, atendimento, estoque e financeiro. CRM
unificado: **card = lead + conversa**, com métricas de atendimento
(`awaiting_since`, `first_response_seconds`) mantidas por trigger. Cargos de
nível-rede e a extensão de Chrome agendando em qualquer unidade.

Decisão estrutural: **cliente e lead pertencem à REDE**; a unidade é dimensão de
métrica e tag, não fronteira.

### 2026-09-09 — Indicadores, LGPD e permissões dinâmicas

- **Indicadores revisados** (`864167f`): "as somas não batem" virou auditoria de
  ~100 problemas com quatro causas estruturais. Nasceu `lib/metrics/` com
  agregação no Postgres e o `lib/datetime.ts` com o fuso do negócio.
- **LGPD** (`8957d59`): exportação de dados do titular em PDF + JSON, com
  liberação da parte clínica por quem tem `medical_records: MANAGE`. Exclusão
  segue fora de escopo.
- **Permissões dinâmicas**: fim dos cargos fixos; cada rede monta a matriz.
- **Cron validado** — até então nunca havia rodado em produção.

### 2026-09-15/16 — Inbox omnichannel e troca de provedor

`lib/channels/` abstrai o canal; `lib/templates/` valida HSM; realtime nas
conversas. A **Z-API foi aposentada em favor da uazapi** (`71b7f46`): o problema
era IP compartilhado entre clínicas, que faz ban em cascata numa API não oficial.

### 2026-09-18 — O admin opera tudo pelo `/admin`

**Contexto:** dois defeitos do mesmo lugar (criar plano pelo `/admin` falhava por
falta de unidade; a agenda da rede era só leitura) expuseram o padrão — o portal
da rede mostrava o consolidado e não deixava agir, forçando o admin a entrar no
portal de uma unidade, o que o CLAUDE.md §6 proíbe. **Não era permissão nem RLS:
era interface.** No caminho apareceram três gravações mudas: estoque inicial
descartado quando `ctx.branchId` era nulo, crédito interno indo para a filial
alfabeticamente primeira, e erro de query virando tela vazia ou 404.

| Commit | O quê |
|---|---|
| `79c69cb` | Agendar só com nome e telefone — cliente nasce no ato |
| `9ee1263` `685a5f1` | Agendar e conduzir o atendimento pela agenda da rede |
| `8d88ba3` `3023a7b` | Dinheiro pela rede; gravações que iam para a unidade errada |
| `aeb6e39` | Permissões do admin no banco; abrangência valendo na hora |
| `439b4cc` | Ações que existiam no back-end sem porta em portal nenhum |
| `fa3348c` | `/[slug]/settings` de verdade; procedimento só pela rede |
| `6743eba` | Suíte automatizada: Vitest + Playwright |
| `963b77d` | Painel comercial vira aba de Relatórios |
| `3d9189f` | Cada aba de Relatórios vira permissão do cargo |
| `6f6a7d1` | Caixa de abrir/fechar removido |
| `ea1f556` `2a2adda` | Seção Planejamento: Tratamentos + Injetáveis |

**Migrations** (via MCP, com paridade em `supabase/migrations/`):
`20260918000001` `cliente_por_telefone`, `…02` `buscar_clientes`,
`…03` permissões do cargo Admin da rede, `…04` `role_report_tabs`,
`…05` planejamento de injetáveis.

### 2026-09-18 (continuação) — Injetáveis vira planejamento com nome

O mapa era **um por cliente** (`unique (client_id)`): obrigava a ter a pessoa
cadastrada antes de desenhar qualquer coisa, e dava um único mapa para a vida
inteira dela — sem comparar o que foi planejado em março com o de junho. Agora
segue o desenho do plano de tratamento: `name` próprio, `client_id` opcional,
vários por cliente. `tenant_id` passou a existir na tabela porque, sem cliente,
não havia por onde descobrir de qual rede o planejamento era.

Registrar aplicação continua exigindo cliente — aplicação é prontuário, e
prontuário é de alguém. `injectable_applications.map_id` guarda de qual
planejamento ela saiu.

**Quatro ilustrações**: rosto e corpo, feminino e masculino
(`public/mockup-*.png`), escolhidas por duas barras cruzadas. Cada ponto guarda
a vista em que foi marcado, então um planejamento cobre rosto e corpo ao mesmo
tempo: trocar de ilustração mostra os pontos dela e guarda os outros, e o total
por produto soma tudo — é a dose que sai do estoque, não a que está na tela. As
quatro imagens têm a proporção do viewBox (1122×1402 ≈ 0,80 / 200×250), então
trocar de vista não desloca ponto nenhum. Ponto sem vista é do rosto feminino,
que era o único desenho até aqui.

As artes novas chegaram mais escuras que a original — o rosto masculino com
luminância média de traço 64 contra 109 — e ao lado dela pareciam de outro
conjunto. Foram normalizadas para os mesmos 109, escalando a tinta
(255 − luminância) e preservando matiz e alfa. **Arte nova entra pelo mesmo
crivo**; o critério está em `injectable-outline.tsx`.

### 2026-09-18 (continuação) — Pinça no mapa de injetáveis

Ponto de toxina fica a milímetros do vizinho, e o zoom já existia — mas só pelos
botões de `+` e `−`, que ninguém procura no celular com o dedo já sobre o rosto.
Agora o gesto de pinça aproxima e afasta.

Como está feito (`injectable-map-field.tsx`): o Pointer Events unifica toque,
caneta e mouse, então basta guardar todo ponteiro encostado num `Map` por
`pointerId`. Com dois, `pincaRef` **congela** distância, zoom, meio dos dedos e
pan do início do gesto; cada `pointermove` recalcula o zoom pela razão das
distâncias e o pan pelo deslocamento do meio. Congelar o foco no início é o que
impede a imagem de escorregar: recalcular o ponto fixo a cada quadro realimenta
o próprio arrasto.

Três detalhes que custariam um bug cada:
- `touchAction: 'none'` no SVG — sem isso o navegador rouba o gesto para o zoom
  da página inteira.
- O `onPointerDown` **do ponto** também registra o ponteiro. Sem isso, um dedo
  que pousa em cima de um marcador não conta para a pinça.
- `moveu` marca que houve gesto, e o `click` que chega quando o último dedo sai
  é descartado. Senão toda pinça terminava marcando um ponto novo.

O E2E (`e2e/injetaveis-pinca.spec.ts`) emula os dois dedos por CDP
(`Input.dispatchTouchEvent`) — o Playwright não tem pinça pronta. **Rolar a
ilustração para dentro da viewport antes é obrigatório**: em 390×844 ela nasce
inteira abaixo da dobra, e toque fora da viewport não chega a elemento nenhum —
o teste falhava com zoom parado em 100% sem que o código estivesse errado.

### 2026-09-18 (continuação) — Injetáveis: uma tela por vez no celular

A lista e o planejamento aberto eram `.master-detail`, que no celular apenas
**empilha**: o mapa nascia abaixo da lista inteira, e com uma dúzia de
planejamentos cadastrados era rolagem demais até o desenho — tocar num nome
parecia não fazer nada. O mesmo problema que a ficha de clientes já tinha
resolvido.

Injetáveis passou a usar `ListaDetalhe`, o componente de lá: no desktop as duas
colunas continuam lado a lado; no celular só uma delas aparece. **Quem decide é
a rota**, não um `useState` — o planejamento aberto virou
`…/injetaveis/<mapId>`, nos dois portais. Isso traz de brinde o que estado local
não dá: o "voltar" do aparelho funciona, o link de um planejamento pode ser
mandado para alguém, e recarregar a página não perde o que estava aberto.

A tela virou layout + páginas finas (`app/_shared/lista-de-injetaveis.tsx` é o
layout com a lista; `detalhe-de-injetavel.tsx` é o corpo do aberto), e
`injetaveis-client.tsx` deixou de existir. Criar um planejamento agora navega
direto para ele — no celular já cai na tela do mapa.

Detalhes que valem lembrar:
- O botão "voltar" só existe onde a lista saiu da tela (`.ld-voltar`, com o
  mesmo corte de 899px do `ListaDetalhe`). Usar `.show-mobile` seria errado por
  12px: ela corta em 1023px, onde as duas colunas ainda aparecem.
- O nome do cliente no cabeçalho do mapa virou link para a ficha — era o que o
  botão "Abrir a ficha" fazia na versão anterior. Dentro da própria ficha ele
  continua sendo só o nome.
- **Tratamentos não tinha o mesmo sintoma**, mas foi pelo mesmo caminho logo em
  seguida (abaixo).

### 2026-09-18 (continuação) — Tratamentos: o plano aberto vira tela

O plano era uma camada de 780px sobre a lista. No celular cobria tudo sem
oferecer volta; no computador espremia um editor que tem procedimentos,
sessões, preços, proposta e checkout. Virou rota — `…/planejamentos/<id>` nos
dois portais — com a tela inteira, "voltar" para a lista, e o nome editável no
topo (`renomearPlano` só tinha esse chamador).

Aqui **não** se usou `ListaDetalhe`: a lista de planos é larga (status, cliente,
sessões e valor em cada linha) e não caberia numa coluna de 300px ao lado. O
resultado no celular é o mesmo — uma tela por vez —, e no desktop o editor
ganhou a largura que a camada não dava.

`getCabecalhoDoPlano` nasceu aqui: a página precisa do nome e do dono antes do
editor, e `getPlanoParaEditar` traz sessões e preços, que é o outro assunto. A
lista deixou de carregar o catálogo de procedimentos — quem precisa dele é o
plano aberto, que agora o busca por conta própria.

**Armadilha:** `router.refresh()` logo depois de `router.push()` cancela a
navegação — entram na mesma transição e a URL não sai do lugar. Na lista de
planos o refresh nem era preciso: ela relê sozinha ao voltar.

### 2026-09-21 — A ficha do cliente guarda na URL o que está aberto

Mesma ideia, em três níveis. A aba da ficha, a sub-aba de Planejamento e o
plano/mapa aberto dentro dela eram todos `useState`: o voltar do aparelho saía
da ficha inteira em vez de devolver o passo anterior, recarregar jogava de volta
na Visão geral, e não havia como mandar a alguém "o financeiro deste cliente".

Agora: `?aba=<chave>`, `?planejamento=tratamento|injetaveis` e `?aberto=<id>`.
O voltar anda um passo de cada vez — plano → lista de planos → aba anterior →
lista de clientes. Aba que não existe (link velho, ou a de Fichas quando a rede
não tem formulário) cai na Visão geral em vez de deixar a tela vazia, e trocar
de aba limpa `planejamento`/`aberto`, senão o id de um plano sobreviveria numa
aba onde ele não significa nada.

`PlanejamentoTratamento` e `PlanejamentoInjetaveis` ganharam o par
`abertoId`/`onAbrir` e passaram a ser **controlados quando o pai quer**: a ficha
manda pela URL, o atendimento continua com estado local — ali a URL é a da
sessão, e empurrar histórico atrapalharia quem está no meio dela.

Duas coisas resolvidas de passagem:
- `rotaComParams` em `lib/query-params.ts`: `mesclarParams` devolve `'?'` quando
  não sobra parâmetro nenhum, e `/clients/123?` entra no histórico como se fosse
  outra URL.
- Na rota do plano (`/planejamentos/<id>`) havia dois "voltar": o da página e um
  "◀ Planos" interno que levava à lista de planos do cliente **dentro** da tela
  do plano dele. O interno agora só aparece onde existe lista por trás.

### 2026-09-21 — A escala de raios encolheu

Card a 18px, avatar a 22px e modal a 20px liam como curva demais em tela cheia.
A escala nova:

| Token | De | Para |
|---|---|---|
| `--radius-card-token` | 18px | **12px** |
| `--radius-card-sm` | 15px | **11px** |
| `--radius-field-token` | 12px | **10px** |
| `--radius-row` | 13px | **10px** |
| `--radius-squircle` | 22px | **14px** |
| `--radius-chip-token` | 20px | *inalterado* |
| `--radius-full` | 9999px | *inalterado* |

**Chip e avatar ficam fora da escala de propósito.** 20px numa altura de 22px é
pílula, e é a pílula que faz um badge não ser confundido com um botão à primeira
vista; reduzi-la deixaria os dois com a mesma silhueta. Decisão do Heitor.

O degrau entre card (12) e campo (10) também é de propósito: **o elemento de
dentro nunca mais redondo que o de fora**, senão o canto do botão estoura o do
card que o contém.

Não foi só trocar token: havia ~70 lugares com o número cru em `style={{
borderRadius: N }}` e 3 no próprio `globals.css` (modal, dialog, bottom sheet).
Todos passaram a apontar para o token — a próxima mudança de escala é uma linha.
Valores ≤ 10px ficaram como estavam: elemento aninhado deve mesmo ter canto
menor que o pai.

Achado no caminho, com a conferência automática: o seletor segmentado
(`seg-select.tsx`) tinha invólucro de 8px com botões de 10 dentro — os cantos dos
botões vazavam. Agora segue a conta concêntrica (raio do filho + respiro até
ele), que é como isso se resolve em geral.

A escala também vale em `.claude/skills/lumiere-design/tokens/radius.css` (a
fonte declarada pelo CLAUDE.md §13, senão a próxima tela nasce com a escala
velha) e no `.card` da extensão, que tem bundle próprio e não importa os tokens.

### 2026-09-21 — Varredura de layout no celular

Espaço morto, controles minúsculos ocupando linhas inteiras e coisas saindo da
tela. A varredura foi feita medindo o DOM a 390×844 em 21 rotas (estouro
horizontal, grade com item órfão, linha inteira para um controle pequeno) e
conferindo na captura o que a medição apontava.

O que estava errado e o que mudou:

| Onde | Defeito | Correção |
|---|---|---|
| Ficha do cliente | "+ Agendar" saía **69px para fora da tela** | cabeçalho quebra linha, identidade com `minWidth: 0`, e-mail com reticências |
| Ficha do cliente | 4 KPIs empilhados, um por linha | 2×2 — a regra que forçava 1 coluna abaixo de 479px caiu |
| Dashboard, Estoque | 5º KPI sozinho com meia linha vazia | ímpar ocupa a linha inteira (`:last-child:nth-child(odd)`) |
| Dashboard | seletor de 76px numa linha de 358 | os controles do cabeçalho esticam para preencher |
| Estoque | 224px só de filtros antes do 1º produto | `.filtros-bar`: duas colunas no celular → 191px |
| Estoque | `R$ 54.150,00` **cortado** dentro do card | ícone 40→32px e rótulo que quebra (`.kpi-icone`, `.kpi-rotulo`) |
| Estoque | subtítulo espremido em 4 linhas de 1 palavra | cabeçalho com `flexWrap` |
| Procedimentos | 5 linhas por procedimento, uma por atributo | `data-par` põe duas por linha → 2313px → 1873px |
| Procedimentos | nome quebrando no meio ("Avaliaç/ão") | célula sem rótulo empilha em vez de pôr nome e descrição lado a lado |
| Planejamentos | 5 chips de filtro em 3 linhas | `.chips-bar` rola na horizontal, como a barra de abas |
| Relatórios | legenda do gráfico estourava 11px | quebra em duas linhas |
| Agenda da rede | coluna de filial de 180px: cabia 1,5 na tela | `--agenda-col: 138px` no celular — 2,5 colunas, e a cortada avisa que rola |

**Duas regras diferentes, de propósito:** filtro vira **grade de 2 colunas**
(nada sai de vista — filtro escondido não é usado), fila de chips vira
**rolagem horizontal** (são opções de uma pergunta só, lidas da esquerda para a
direita, e o que some é o fim da fila). A barra de abas já seguia a segunda.

Resultado: **zero estouro horizontal nas 21 rotas**, dashboard de 7087px para
6369px, procedimentos de 2313px para 1873px.

**Armadilha que reapareceu:** regra nova em `globals.css` parou de chegar ao
navegador no meio da sessão — o dev server serve o CSS compilado antigo, com o
mesmo hash no nome. As medições passaram a mentir. Conferir sempre buscando o
seletor dentro do texto do `link[rel=stylesheet]` antes de concluir que a regra
não funciona; o conserto é matar o dev, `rm -rf apps/web/.next/dev` e subir.

### 2026-09-21 — Nada de rolagem horizontal dentro de card

A varredura anterior tinha um ponto cego: ela só olhava `overflow-x: visible`,
então **ignorava justamente quem rolava por conta própria** — o card com uma
tabela larga dentro. Dois cards por linha no dashboard davam 171px cada, e a
tabela de dentro ganhava rolagem própria. Rolar dentro de um card de 171px é
pior do que rolar a página: o gesto não é óbvio e o conteúdo fica espiado por
uma fresta.

Duas frentes:

**1. Card com conteúdo de largura própria vai UM por linha no celular.**
Modificador `.cards-1-col` (abaixo de 767px), aplicado às duas grades de
ranking do dashboard da rede. `.kpi-grid`/`.kpi-grid-auto` continuam **dois por
linha** para KPI de verdade (rótulo + número), que não tem conteúdo largo e
ficaria uma faixa quase vazia sozinho.

**2. Toda tabela larga virou `cards-mobile`.** Ranking de filiais, resumo por
filial e movimentações do financeiro, as duas vistas do estoque e a lista da
equipe. Na de equipe isso também **devolveu informação**: filial e cargo eram
simplesmente escondidos (`hide-mobile`) e agora aparecem como linhas do bloco.

Detalhes que apareceram no caminho:
- `data-par` (duas células por linha) só serve a valor curto. "Gerente de
  Unidade" e "12 UN · 1 abaixo do mín." não cabem em 165px — saíram do par. E
  a célula pareada ganhou `flex-wrap` como rede de segurança: o valor desce
  para baixo do rótulo em vez de esticar a tabela de volta.
- `td.so-desktop` esconde no card a coluna que só faz sentido na tabela (o
  número da posição no ranking — a ordem da lista já diz isso).
- O KPI do estoque cortava o próprio `R$ 54.150,00`: ícone de 40px → 28px e
  respiro menor, porque faltavam quatro pixels.

Resultado: **zero rolagem horizontal indevida em 17 telas.** A que sobra é
deliberada e continua: grade da agenda por unidade, quadro do CRM, barra de
abas e fila de chips.

**O preço:** o dashboard da rede foi de 6369px para 7626px. Um card por linha
custa altura — foi a troca escolhida, porque ler o conteúdo vale mais do que
rolar menos.

### 2026-09-21 — O inbox diz quando a mensagem veio de anúncio

Faltava saber que uma conversa nasceu de um clique em anúncio, e de qual.
Metade estava pronta: `deriveLeadSource` já marcava o lead como "Meta Ads" e
`conversations.attribution` já guardava `ad_id` e `ctwa_clid`. O que faltava era
o resto do caminho.

**Quatro buracos, fechados:**

1. **A uazapi não lia anúncio nenhum.** Só a Cloud API tinha parser. Na uazapi
   não existe um campo `referral`: ela repassa o `contextInfo` do próprio
   protocolo, e o anúncio vem em `externalAdReply` (informação do Heitor). São
   olhados três caminhos — `contextInfo` da mensagem, o aninhado em
   `extendedTextMessage` e o da raiz — porque o aviso do anúncio chega **uma
   vez só**, na primeira mensagem: errar o caminho não dá segunda chance, e a
   falha é silenciosa (a mensagem entra normal, só sem a origem).
2. **A procedência era da conversa, não da mensagem.** `attribution` só é
   escrita quando a conversa nasce; quem já era conhecido e voltava por outro
   anúncio não deixava rastro. Agora `messages.ad_referral` guarda por
   mensagem, e a conversa passa a apontar para o anúncio mais recente.
3. **Nada aparecia na tela.** Selo dentro da bolha, colado na mensagem que
   trouxe, e um ícone na lista de conversas — porque isso muda a fila:
   lead de campanha paga esfria em minutos.
4. **Não havia nome de campanha.** O aviso do WhatsApp traz o id do anúncio e o
   texto do criativo, **nunca a campanha**. `lib/ads/ad-lookup.ts` pergunta à
   Graph API (`/<ad_id>?fields=name,adset{},campaign{}`) e guarda em
   `meta_ad_cache`. O vínculo anúncio→campanha não muda, então a entrada não
   expira; a busca que falha grava `erro` e não é repetida, senão cada mensagem
   de uma campanha ativa viraria uma chamada.

**Degrada sozinha, de propósito.** Sem a integração Meta Ads conectada (o caso
de hoje), o selo mostra o título do criativo, a plataforma e o id. Saber que a
pessoa veio de anúncio já muda a resposta, mesmo sem o nome da campanha —
atribuição pela metade é melhor que erro de webhook, então `nomesDoAnuncio`
nunca lança.

Os dois parsers têm teste (`tests/anuncio-inbound.test.ts`), inclusive a
asserção de que entregam o **mesmo id de anúncio** a partir de formatos
diferentes — é esse id que liga à campanha.

**Demonstração:** `supabase/seed_demo_inbox.sql` monta uma campanha inventada
(`[SET/26] Toxina Botulínica | Conversas`, dois criativos) e três conversas —
contato novo por anúncio, conhecida que voltou por OUTRO anúncio, e uma
orgânica para o selo não parecer onipresente. Separado de `seed_demo.sql` de
propósito: aquele existe para conferir números na mão, este para ver uma tela.
Os nomes são longos de propósito, que é como agência nomeia e é onde o corte
por reticências é posto à prova. `meta_ad_cache` é semeado à mão, senão sem a
integração Meta Ads o selo mostraria só o título do criativo.

Ao olhar a tela apareceu um defeito antigo do cabeçalho da conversa: no celular
o telefone da cliente saía **cortado no meio do número**, porque o seletor de
status e os botões não encolhiam. Corrigido com `flexWrap` no cabeçalho e corte
por reticências no nome. A varredura de layout anterior tinha mascarado isso,
por tratar o inbox inteiro como "rolagem deliberada".

### 2026-09-22 — API de Conversões da Meta

Fechar o ciclo: o `ctwa_clid` que passamos a guardar volta para a Meta dizendo
"este clique virou agendamento / virou venda".

**O que estava errado antes.** Existia um `sendCAPIEvent` com um chamador só
(`CompleteRegistration` quando o lead vira cliente), e ele mandava
`action_source: 'website'` com apenas o `fbclid`. Para click-to-WhatsApp a Meta
**aceita esse evento com 200 e não o atribui a anúncio nenhum** — a pior das
falhas, porque parece ter funcionado. O correto é `business_messaging` +
`messaging_channel: 'whatsapp'` + `ctwa_clid` dentro de `user_data`.

**Os eventos e o papel de cada um:**

| Evento | Gatilho | Papel |
|---|---|---|
| `Schedule` | agendamento criado | **otimização** — é o primeiro compromisso real e tem volume |
| `Purchase` | receita de cliente **paga** | ROI e valor |
| `CompleteRegistration` | lead vira cliente | corrigido para CTWA |

`Schedule` como alvo é a aposta: venda fechada não tem volume para a Meta sair
do aprendizado numa clínica só. `Purchase` sai no **recebimento**, não no
fechamento — plano vendido e não pago é ROI fantasma, e é o mesmo critério de
simetria do §13.1.

**Por que não é tudo imediato, nem tudo por cron.** A primeira ideia era uma
fila drenada pelo cron; o Heitor questionou, com razão. A Meta penaliza evento
que chega tarde, e no Railway (container longo, uma réplica) o `after()` é
confiável — o argumento de durabilidade que eu tinha era mais fraco do que
supus. Ficou assim:

- **`Schedule` e `CompleteRegistration`: imediatos**, em `after()`. São eles que
  a campanha usa para aprender, e freschor importa.
- **`Purchase`: por GATILHO no banco** (`on_transaction_paid`) + cron. Um
  pagamento vira real em **seis lugares** do código (concluir atendimento,
  receber plano, marcar pago, lançamento avulso, entrada de estoque…);
  instrumentar um a um é garantir esquecer o sétimo, e o que se perde é dinheiro
  não atribuído, que ninguém percebe faltando. A troca é consciente: até uma
  hora de atraso não custa nada num evento que serve a ROI, não a otimização.

**A tabela `meta_capi_events` não é a fila — é o registro.** Ela existe porque
o `event_id` precisa existir ANTES do envio: a Meta deduplica por ele, e sem um
id estável guardado qualquer retentativa conta a mesma venda duas vezes. De
quebra, quando o número da Meta divergir do nosso, é o único jeito de saber de
que lado se perdeu.

O `ctwa_clid` desce de `conversations.attribution` → `leads` → `clients`, para
cada evento não precisar percorrer conversa e mensagens.

**Verificado:** 8 testes do payload (`tests/capi-payload.test.ts` — é ali que
mora a falha silenciosa) e 7 casos do gatilho rodados no banco de verdade:
receita não paga não gera, virar paga gera uma, update repetido **não duplica**,
despesa não gera, estorno não gera, cliente sem clique não gera.

**Pré-requisito que não é código:** nada disso sai sem a integração **Meta Ads**
conectada com permissão de escrita de eventos. Sem ela os eventos ficam
`pendente` e saem assim que houver para onde mandar — por isso vale registrar
mesmo sem poder enviar.

**A conferir na doc da Meta antes de prometer ROI de ciclo longo:** a janela em
que o `ctwa_clid` ainda é atribuível é curta (dias). Cliente que clica em
setembro e fecha o plano em novembro provavelmente **não** será atribuído; o
código já descarta o que passa de 7 dias.

---

## 4. Decisões de produto

O PRD e as primeiras versões do CLAUDE.md descrevem coisas que **não** são mais
verdade. O que vale:

| Decisão | Quando | Por quê |
|---|---|---|
| **ERP + CRM de clínica, cliente típico com uma unidade** | 2026-09-18 | Rede grande é franquia e já tem sistema. O financeiro é parte, não centro. |
| **Caixa de abrir/fechar removido** | 2026-09-18 | Menos de 1% dos recebimentos é em dinheiro; o fechamento existe para contar a gaveta, e não há gaveta. A auditoria do dia é a tela do financeiro. `cash_registers` fica com o histórico; `cashier` passa a significar RECEBER na recepção. |
| **Procedimento e configuração são dados da REDE** | 2026-09-18 | A unidade vê o catálogo; alterar exige abrangência de rede. |
| **Relatórios liberados aba a aba** | 2026-09-18 | `reports` num nível só entregava o faturamento junto com o funil. Cargos existentes começaram sem nenhuma aba. |
| **Agendamento público sem login: descartado** | 2026-09-09 | Só equipe autenticada ou o próprio cliente pelo portal/app, e apenas para procedimentos `visible_on_client_app`. |
| **LGPD: só exportação** | 2026-09-09 | Exclusão conflita com guarda legal de prontuário e registros fiscais. |
| **Cliente não se auto-cadastra** | 2026-07-21 | A conta nasce quando a equipe cadastra. |
| **Cliente e lead pertencem à rede** | 2026-07-21 | A unidade é métrica e tag, não fronteira. |

---

## 5. Em aberto

### Depende do Heitor (fora do código)

- **App da Meta não existe.** Instagram e Messenger foram verificados só com
  payload simulado e HMAC válido: falta OAuth real, seleção de página e
  `subscribed_apps`.
- **`META_VERIFY_TOKEN` não está no Railway** — sem ele o handshake do webhook
  não fecha em produção.
- **`wabaId` não preenchido** nas integrações: o botão "enviar para aprovação"
  da tela de Templates fica desabilitado.
- **Nenhum número de WhatsApp real foi pareado.** A uazapi foi provada por sonda
  (instância, webhook, proxy, QR, exclusão), mas enviar e receber de verdade só
  com celular na mão.
- **App Review da Meta** (`pages_messaging`, `instagram_manage_messages`).
- Perguntas abertas com o suporte da uazapi: o proxy `internal` é dedicado por
  instância ou compartilhado? `DELETE /instance` para a cobrança na hora?

### Dívida técnica conhecida

- **`estetica-os-prd.md` desatualizado**: descreve "SaaS para redes de 2–5
  filiais" e caixa com abertura/fechamento diário.
- **Prisma está morto**: `apps/web/lib/prisma.ts` re-exporta o client e ninguém
  importa; o `postinstall` roda `prisma generate` para nada, e o CLAUDE.md §2/§8
  ainda o descreve como ORM. Ou sai do repo, ou o doc para de descrevê-lo.
- **RLS de `integration_configs` decide por nome de cargo**
  (`jwt_claim('role') = 'NETWORK_ADMIN'`), o que o CLAUDE.md §11 proíbe. É a
  última regra por nome de cargo no banco; não é exposição hoje porque o app lê
  pelo cliente de serviço.
- `metrics_core.new_clients` ignora o filtro de filial.
- `product_batches` nunca é decrementado.
- Apagar um lead leva junto o histórico dele (`lead_events` em cascata).

### Próxima frente candidata

**Fidelidade.** Hoje só existe saldo read-only no portal do cliente. Falta
configurar regras (`loyalty_configs`), creditar e debitar pontos, extrato e
resgate como desconto no pagamento. O módulo foi removido do catálogo de
permissões em `4511b5c` por não ter gate nenhum — volta quando existir.

---

## 6. Rodar o projeto

```bash
pnpm install                 # uma vez, na raiz: cobre os 8 workspaces
pnpm dev --filter=web        # http://localhost:3000
pnpm typecheck               # tsc --noEmit em todos os pacotes
pnpm test                    # Vitest
pnpm --filter web test:e2e   # Playwright (sobe o dev sozinho)
pnpm build --filter=web
```

O `.env.local` de `apps/web` precisa das chaves do Supabase, uazapi, Meta, VAPID
e `CRON_SECRET` — ver CLAUDE.md §12. O E2E não pede nenhuma chave nova.

**Mudança de schema** é aplicada por SQL direto (MCP do Supabase), com arquivo de
paridade em `supabase/migrations/`. O banco é a fonte de verdade: inspecionar o
schema real antes de qualquer DDL, e rodar `NOTIFY pgrst, 'reload schema'` **uma
vez no fim do lote**.
