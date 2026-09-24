# DEVLOG — BellarisOS

Registro do desenvolvimento: o que existe hoje, como chegamos aqui e o que está
em aberto. Documento único.

**Última atualização: 2026-09-23.**

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
  atendimento), integrações, LGPD e **Eventos** (a corrente de fatos do
  sistema, com o catálogo cruzado com o que já ocorreu na rede).
- **Eventos de domínio** — 42 fatos nomeados pela intenção
  (`agendamento.nao_compareceu`, `pagamento.recebido`, `estoque.abaixo_do_minimo`)
  gravados em `domain_events` com ator, origem e retrato. Retenção de 30 dias.
- **Automações** (`/admin/automacoes`) — quadro infinito de nodes que reage a
  esses fatos: gatilho por evento ou por horário, condições (SE e ESCOLHER),
  esperas, e ações que mandam mensagem, avisam a equipe e mexem no CRM. Com
  silêncio noturno, teto de contatos por cliente e anti-loop por profundidade.
  Cada execução guarda o passo a passo, e o **ensaio** percorre o fluxo com um
  fato real sem executar nada.

### Plataforma

- Next.js 16 (App Router, Server Actions) + Supabase (Postgres, Auth, Storage,
  RLS) + Turborepo/pnpm. Deploy na Railway (uma réplica, us-east4); banco em
  us-east-1.
- **Autorização dinâmica:** cargos por rede, 15 módulos com nível
  (NONE/VIEW/MANAGE), escopo (OWN/ALL) em cinco deles, abrangência pelo
  `users.branch_id`, e as abas de Relatórios liberadas uma a uma
  (`role_report_tabs`).
- **Indicadores:** fonte única em `lib/metrics/`, agregação no Postgres, fuso do
  negócio resolvido em `lib/datetime.ts`.
- **Testes:** 256 unitários (Vitest) + 50 E2E (Playwright) rodando contra o banco
  de desenvolvimento. `pnpm test` e `pnpm --filter web test:e2e`.
- **Cron:** dois serviços na Railway rodam `scripts/cron.mjs` — de hora em hora
  (campanhas e LGPD) e a cada 5 minutos (fila das automações).

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
   protocolo, e o anúncio vem em `externalAdReply` (informação do Heitor). O
   aviso do anúncio chega **uma vez só**, na primeira mensagem: errar o caminho
   não dá segunda chance, e a falha é silenciosa (a mensagem entra normal, só
   sem a origem). **Os caminhos escolhidos aqui estavam todos errados — ver a
   correção de 24/09, feita contra o tráfego real.**
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
mesmo sem poder enviar. Em 2026-09-22 a conexão está parada esperando a
verificação de empresa pelo CNPJ, que é o que libera criar o app na Meta.

**O `pixelId` nunca foi fixo no código** — seria impossível, o sistema é
multi-tenant. Ele já vem do OAuth: a conexão lista as contas de anúncios e os
pixels do perfil, a tela pede para escolher, e a escolha fica em
`integration_configs.config` por tenant.

O que **estava** frágil era de onde a lista vinha: só `/me/adspixels`, que
devolve o que está pendurado no USUÁRIO. Pixel que pertence ao Business
Manager — o caso normal de quem tem agência — não aparece ali, e a clínica
terminava conectada **sem pixel**, com a API de Conversões calada e nenhuma
mensagem dizendo por quê. Agora a busca pergunta também a cada conta de
anúncios (`/act_<id>/adspixels`) e junta as duas listas; a tela deixou de
chamar o pixel de "opcional" e avisa quando não há nenhum; e o erro gravado
distingue "não conectada" de "conectada sem pixel", que pedem ações diferentes
de quem for resolver.

**A janela de atribuição é de 7 dias** (confirmado pelo Heitor). Isso é um
limite de PRODUTO, não de código: venda de ciclo longo — clica em setembro,
fecha o plano em novembro — **não é atribuível**, e o `Purchase` cobre o que
fecha dentro da semana do clique. O código já descarta o que passa disso.

**`Atendimento` (comparecimento) foi descartado.** Chegou a ser proposto como
evento de leitura, já que no-show em estética é alto. Decisão do Heitor de não
implementar: evento personalizado antes de os três principais produzirem dado
real só cria uma série vazia a mais.

### 2026-09-23 — Eventos de domínio (Fase 1 de 6)

Preparação para as automações: elas precisam de gatilhos, e não havia onde
perguntar "o que aconteceu no sistema". Existiam três tabelas de histórico com
propósitos próprios e incompatíveis — `lead_events` (linha do tempo do card),
`appointment_history` (auditoria) e `meta_capi_events` (fila da Meta) — e nada
que cobrisse o resto. Agora toda ação relevante vira uma linha em
`domain_events`, e o motor de automações vai assinar essa corrente sem conhecer
tabela de negócio nenhuma.

**Duas decisões do Heitor** que moldaram o desenho:

- **Catálogo curado, não espelho de CRUD.** Eventos nomeados pela INTENÇÃO
  (`agendamento.nao_compareceu`), não pela operação (`appointments.atualizado`).
  São ~290 pontos de escrita no sistema; uma lista desse tamanho, toda
  "atualizado", não cabe numa tela de automação e obrigaria o motor a
  inspecionar campos para descobrir o que houve.
- **Gatilhos de TEMPO ficam para a fase do motor.** "Sem retorno há 60 dias",
  "aniversário", "lembrete 24h antes" não nascem de ação: são varredura
  agendada, mecanismo diferente de emissão.

**Três restrições que a varredura revelou e que decidiram a arquitetura:**

1. **40 escritas acontecem fora de `actions/`** (webhook do WhatsApp, crons,
   libs) — e é de lá que vêm fatos centrais como "conversa iniciada".
   Instrumentar só `actions/` deixaria isso de fora.
2. **O banco não sabe quem fez.** As 67 origens de escrita usam
   `createAdminClient()` (service role, sem JWT), então `auth.uid()` é nulo e
   gatilho no Postgres não teria como carimbar ator. **Foi o que decidiu a
   favor de emitir no app, e não no banco.**
3. **O emissor não pode morar em `actions/`** — todo export de arquivo
   `'use server'` vira endpoint público, e um gravador exposto assim deixaria
   qualquer cliente forjar a corrente que dispara as automações. Mesma razão já
   documentada em `lib/lead-events.ts`.

**O que ficou pronto:** a tabela (append-only, publicada na `supabase_realtime`
— o motor escuta pelo mesmo caminho que `RealtimeRefresher` já usa), o catálogo
tipado em `packages/types/src/eventos.ts`, o emissor em `lib/events/emitir.ts`
(síncrono, nunca lança) e **a agenda inteira**: criado, confirmado, check-in,
iniciado, concluído, cancelado, não compareceu, remarcado.

`dados` leva **retrato + `alterou`**. O retrato (nome e telefone do cliente)
poupa o motor de ir ao banco justamente quando precisa ser rápido; `alterou` é
o que permitirá "se o telefone mudou, revalidar o WhatsApp". Mesmo desenho de
`lead_events.changes`.

`agendamento.criado` sai de `createAppointmentCore`, não das actions: são
**quatro caminhos de criação** (agenda, inbox, checkout de plano, portal do
cliente) e o fato é o mesmo — emitir em cada um seria esquecer o quinto. Mesma
lição do `Purchase` da CAPI.

**Guarda contra o drift mais cruel:** `tests/eventos-catalogo.test.ts` falha se
um nome do catálogo não tiver emissor no código. Sem ela, a automação seria
montada na tela, salva sem erro, e **nunca dispararia** — sem mensagem, sem log,
sem onde procurar. O E2E da agenda passou a conferir os quatro eventos junto com
os quatro status.

**Faltam as fases 2 a 6:** clientes/CRM/inbox (inclui os webhooks), dinheiro,
clínico e estoque, cadastro e configuração, e o painel de conferência.

### 2026-09-23 — Eventos: retenção de 30 dias e Fase 2 (clientes, CRM, inbox)

**Retenção: 30 dias** (decisão do Heitor). Um cron novo
(`/api/cron/eventos-expirados`) apaga o que passar disso. A consequência é de
produto e vale lembrar ao montar automação: **a corrente é uma janela, não um
arquivo**. Automação que precise olhar além de 30 dias — "cliente que não volta
há 90" — tem de consultar o dado de negócio direto, não `domain_events`. O
histórico duradouro segue onde sempre esteve: `lead_events` e
`appointment_history` têm retenção própria e não são tocados.

**Fase 2 — doze eventos**, em três domínios:

- **Cliente:** `criado`, `dados_alterados` (com `alterou`), `desativado`,
  `reativado`.
- **CRM:** `lead.criado`, `etapa_mudou`, `ganho`, `perdido`.
- **Inbox:** `conversa.iniciada`, `mensagem_recebida`, `mensagem_enviada`,
  `veio_de_anuncio`.

**`ganho` e `perdido` são eventos próprios**, e não `etapa_mudou` com um campo.
Mover para uma etapa de desfecho emite os DOIS: quem automatiza "avisar o dono
quando o card sai da coluna X" quer o movimento; quem automatiza "pedir
avaliação ao fechar" quer o desfecho. Obrigar o motor a ler o `outcome` da
etapa seria devolver a ele o trabalho que o catálogo existe para poupar. Mesma
razão para `conversa.veio_de_anuncio` ser separado de `conversa.iniciada`.

**O webhook foi o caso que mais importava.** Metade destes eventos nasce
quando o WhatsApp entrega a mensagem, sem ninguém logado — por isso saem com
`ator_tipo='sistema'` e `origem='webhook'`. Uma automação de primeiro
atendimento precisa dessa distinção para **não responder à própria clínica**.
`e2e/eventos-webhook.spec.ts` dispara um webhook real de anúncio e confere os
três eventos, o ator, a origem, o texto e o id do anúncio.

Dois cuidados que evitam disparo à toa:
- `cliente.dados_alterados` só sai quando algo mudou de verdade
  (`camposAlterados`). Abrir a aba e clicar em salvar é comum, e emitir aí faria
  toda automação do tipo disparar sem motivo.
- Criação emite do CORE, não das actions: cliente nasce por três caminhos e
  lead por dois. A chave determinística barra o segundo evento quando dois
  caminhos passam pelo mesmo fato.

### 2026-09-23 — Eventos, Fase 3 (dinheiro)

Sete eventos: `pagamento.recebido`, `pagamento.estornado`, `plano.criado`,
`plano.proposto`, `plano.aceito`, `pacote.sessao_usada`, `comissao.gerada`.
O catálogo chega a **27**.

**Os dois de pagamento saem de GATILHO no banco** — exceção deliberada, e a
razão é a mesma que decidiu o `Purchase` da API de Conversões: um pagamento
vira real em **seis lugares** do código, e instrumentar um a um é garantir
esquecer o sétimo. O que se perde ali é uma venda que a automação não vê,
falta que ninguém percebe acontecendo. O preço é que o banco não sabe quem
registrou (service role, `auth.uid()` nulo) — para dinheiro, completude vale
mais que ator. Daí a **origem nova, `'banco'`**: dizer `'app'` seria mentir
sobre a procedência, e é por ela que o motor saberá que não adianta procurar
ator.

Um gatilho só alimenta a corrente E a fila da Meta, porque reagem ao **mesmo
fato**; duplicar a regra criaria duas verdades sobre o que é um pagamento.

**Dois defeitos achados ao escrever, que teriam falhado calados:**

1. **`pagamento.estornado` nunca dispararia.** A contrapartida do estorno é
   gravada como `EXPENSE` e **sem `client_id`** — meu corte por `INCOME` a
   descartava, e mesmo sem ele não haveria de quem foi o dinheiro. O estorno
   passou a ser detectado na transação **original**, que ganha
   `notes='Estornada'` e tem cliente, valor e plano.
2. **`42P10` dentro do gatilho.** `on conflict (tenant_id, chave)` sem repetir
   o predicado do índice PARCIAL faz o Postgres recusar — e ali dentro isso
   **quebraria o próprio pagamento**, não só o evento. É a mesma armadilha já
   documentada em `resolve-conversation.ts`; agora está nos dois lugares.

Oito casos rodados no banco de verdade cobrem os dois: receita paga emite,
valor e origem corretos, estorno emite o oposto, repetir não duplica, despesa
não emite, a receber não emite e virar paga emite.

**A guarda do catálogo precisou aprender a exceção:** ela varria só TypeScript
e acusou os dois de pagamento como "sem emissor". Passou a olhar também as
migrações, exigindo o nome literal perto de um `insert into domain_events` —
menção em comentário não conta.

`pacote.sessao_usada` carrega `restantes`, e é ele que justifica o evento:
**zero é o gatilho de "acabou, hora de renovar"**. Emitido DEPOIS do
incremento, senão daria sempre um a mais.

### 2026-09-23 — Eventos, Fase 4 (clínico e estoque)

Sete eventos: `prontuario.entrada_criada`, `anamnese.respondida`,
`termo.assinado`, `foto.enviada`, `injetavel.aplicado`;
`estoque.movimentado`, `estoque.abaixo_do_minimo`. O catálogo chega a **34**.

**O payload clínico é deliberadamente magro.** `lib/events/clinico.ts` carrega
cliente, agendamento, uma referência (nome da ficha, do termo, do
planejamento) e os ids — **nada de conteúdo clínico**: nenhuma resposta de
anamnese, nenhuma foto, nenhuma evolução. A corrente vai ser lida pelo motor
de automações e, um dia, por integrações; dado de saúde não atravessa essa
fronteira por conveniência de gatilho. Quem precisar do conteúdo abre o
prontuário, com a permissão que ele exige.

`anamnese.respondida` é o único da fase **sem chave de idempotência**: a ficha
é preenchida aos poucos e cada salvamento é um fato novo. A automação "a
anamnese chegou" quer saber do último, não só do primeiro.

`foto.enviada` sai do UPLOAD, não do salvamento da ficha — a foto vive dentro
da resposta e pode acabar descartada. O fato é o envio, e é dele que nasce "a
foto do antes chegou". Não serve de inventário do que existe.

**Os dois de estoque saem de GATILHO no banco**, pela mesma razão da Fase 3:
cinco caminhos do código gravam movimentação. Origem `'banco'`, sem ator.

**`abaixo_do_minimo` dispara na TRAVESSIA do mínimo, não enquanto o saldo está
baixo.** Sem isso, cada consumo de um produto já em falta repetiria o alerta e
a automação mandaria a mesma mensagem cinco vezes no dia. O gatilho sai cedo
quando o saldo anterior já estava abaixo; e a chave fica **nula** de propósito
— repor e cair de novo é um alerta novo, não o mesmo.

Seis casos rodados no banco de verdade: saldo saudável não alerta, movimentação
emite, a travessia alerta uma vez, continuar abaixo **não** repete, repor e
cruzar outra vez alerta de novo, e o nome do produto chega no retrato.

**`estoque.lote_vencendo` ficou de fora, de propósito.** Não nasce de ação
nenhuma: é varredura de calendário, o mesmo mecanismo de "aniversário" e "sem
retorno há 60 dias" que já tinha sido adiado para a fase das automações, que é
quem vai agendá-los.

**Faltam as fases 5 e 6.**

### 2026-09-23 — Eventos, Fase 5 (cadastro e configuração)

Oito eventos: `procedimento.criado`, `procedimento.preco_alterado`;
`membro.criado`, `.desativado`, `.reativado`; `cargo.permissoes_alteradas`;
`integracao.conectada`, `.desconectada`. O catálogo chega a **42**.

São os de menor volume do sistema e os que mais interessam a quem **audita**:
quem mexeu no preço, quem deu acesso a quê, quem desligou a integração.

**Três eventos saem só na TRAVESSIA**, e é o que os separa de ruído:
- `procedimento.preco_alterado` só quando o preço mudou de verdade. Editar a
  descrição e salvar é o uso comum daquela tela.
- `integracao.conectada` compara o `is_active` anterior. O formulário da API
  oficial também serve para corrigir uma credencial com tudo no ar, e o
  pareamento da uazapi roda em **polling** — sem a comparação, cada volta do
  laço contaria uma reconexão que não houve.
- `cargo.permissoes_alteradas` não sai quando nada mudou. Abrir a matriz e
  salvar é como se confere um cargo; emitir aí faria a auditoria gritar sobre
  uma conferência de rotina.

**O evento de cargo leva de→para por módulo.** Sem isso ele diria apenas
"mexeram nas permissões", e a pergunta que se faz é outra: *alguém ganhou
acesso ao financeiro?* Isso obrigou a **ler a matriz antes do upsert** — depois
dele a anterior não existe mais, foi sobrescrita.

**Nada de credencial no payload.** A integração é identificada por um `rotulo`
legível (o id do número, o nome da conta de anúncio, o nome da página) e nunca
por token. A entidade é o **provedor**, não a linha de `integration_configs`:
o id da linha não diz nada a quem lê o evento, e `removerConexaoUazapi` apaga e
recria essa linha sem que a integração mude de identidade.

Desconectar distingue `pedido` de `removida`: os dois levam ao mesmo "saiu do
ar", mas só um volta apertando um botão.

`membro.desativado` carrega o cargo e a abrangência que a pessoa **tinha** — é
o que uma automação de "revogar o que ela ainda alcança" precisa, e depois de
desativada procurar isso já é arqueologia.

**Correção de contagem:** as entradas anteriores subcontavam o catálogo em um
desde a Fase 2 (doze eventos, não onze), e o erro se propagou pelos totais.
Corrigido nas três entradas.

**Falta a fase 6** — o painel de conferência. Depois dele, o motor.

### 2026-09-23 — Eventos, Fase 6 (visibilidade) — fim da base

Aba **Eventos** em Configurações, e com ela a base das automações está
completa: **42 eventos**, todos emitidos e todos visíveis.

**O painel responde uma pergunta só: este gatilho já disparou alguma vez?**
Montar automação sobre um evento que nunca ocorreu é um erro mudo — ela fica
salva, ativa e silenciosa, e o sintoma de "o nome do evento está errado" é
idêntico ao de "ainda não aconteceu". Por isso a tela mostra o **catálogo
inteiro**, não só o que a corrente tem: `vezes: 0` é informação, não ausência
dela. E não é diagnóstico — `pagamento.estornado` fica em zero numa clínica que
nunca estornou, e está tudo certo.

Quem cruza catálogo com corrente é a **aplicação**, porque o catálogo mora em
`packages/types` e não no banco, de propósito (um `check` no Postgres obrigaria
uma migração a cada evento novo). Do banco vem só a agregação, por uma função
`eventos_resumo_do_catalogo` — **contar em JS traria no máximo 1000 linhas**, o
teto do PostgREST, e subcontaria em silêncio quando a corrente crescer. É a
mesma regra dos indicadores, e aqui pesa mais: o número decide se um gatilho
funciona, e um zero errado manda alguém caçar defeito que não existe.

A lista traz ator, origem e um resumo em uma linha; o payload completo abre no
clique, que é o que quem escreve automação precisa ver — o formato dos dados,
não só que algo aconteceu. Realtime ligado: a corrente cresce com a tela
aberta, e conferir um gatilho é justamente disparar a ação e ver chegar.

**No celular, o catálogo vem recolhido.** Os 42 chips ocupavam a primeira tela
inteira e empurravam para fora justamente a corrente, que é o que se veio ver;
os que já ocorreram ficam à vista e os mudos atrás de um toque.

`listarEventosDeDominio` e `resumoDoCatalogo` são **só leitura**, com
`settings: MANAGE`. O emissor continua fora de `actions/`: exposto como
endpoint, qualquer cliente forjaria a corrente que as automações usam de
gatilho.

**A sobreposição com as tabelas antigas fica como está.** `lead_events` e
`appointment_history` **permanecem**: são linha do tempo de tela, com leitura,
RLS e propósito próprios. O que `domain_events` substitui é a falta de um lugar
onde perguntar "o que aconteceu no sistema", não essas duas.

**Base das automações concluída.** O próximo passo é o motor — e é lá que
entram os gatilhos de TEMPO ("sem retorno há 60 dias", aniversário, lembrete
24h antes, `estoque.lote_vencendo`), que foram adiados de propósito: não nascem
de ação nenhuma, são varredura agendada, e quem os agenda é o motor.

### 2026-09-24 — Automações, Fase 1 (o motor, sem tela)

Alguém finalmente reage aos 42 eventos. Três tabelas (`automations`,
`automation_runs`, `automation_run_steps`), o catálogo de nodes tipado em
`packages/types/src/automacoes.ts`, e um executor que já roda **gatilho de
evento → IF → SWITCH → ação**. Sem quadro ainda: a automação de prova foi
inserida por SQL, e o que se provou é o motor.

**A fila é uma tabela, não um broker.** Redis e BullMQ estão na tabela de stack
do CLAUDE.md e nunca foram usados; o projeto opera com `after()` + cron, o
volume de uma clínica é de dezenas de execuções por dia, e uma tabela dá
histórico e observabilidade de graça. `automation_runs` É a fila: o cron
recolhe por `status` + `rodar_apos`.

**O processo não segura nada.** Cada passo lê o run, executa um node, grava
onde parou e devolve. Uma espera só grava a data — é isso que vai permitir
"esperar 3 dias" num container que reinicia sozinho.

**O disparo é imediato**, em `after()` dentro do emissor de eventos: enfileirar
e esperar o cron faria "responder na hora quem chegou pelo anúncio" virar
"responder em até cinco minutos", que é exatamente o que essa automação não
pode ser. O cron (Fase 4) fica para o que espera, o que falhou e o que é de
tempo.

**Três travas que já nascem prontas**, porque a primeira automação em anel
manda mensagem ao cliente em laço:
- origem nova `'automacao'` na corrente, para o motor distinguir o que ele fez
  do que uma pessoa fez;
- `profundidade` no run, com teto de 3 — o anel fecha em três voltas;
- índice único `(automation_id, evento_id)`: a mesma automação não roda duas
  vezes pelo mesmo fato. E o despacho fica **depois** do `if` do 23505: a
  repetição barrada pela chave de idempotência não é fato novo, e disparar
  automação por ela faria a segunda tentativa de um webhook mandar a mensagem
  de novo.

**O contexto é hidratado sob demanda** e nunca leva prontuário. O evento
carrega um retrato magro — `DadosClinicos` nem tem telefone — então o motor
busca cliente, agendamento, lead, conversa, plano, produto ou membro conforme o
que as condições e os textos citarem. Anamnese, evolução e foto continuam fora,
pela mesma razão de sempre: a automação avisa que a ficha chegou, não conta o
que tem nela.

**Um defeito achado escrevendo o teste**: a ação de avisar a equipe com alvo
vazio devolvia um resumo e o passo ficava **verde**. Run verde que não fez nada
é pior que vermelho — é a mentira que o passo a passo existe para não contar.
Configuração incompleta passou a lançar.

Módulo de permissão novo: **`automations`** (15º). A automação mexe em agenda,
CRM e financeiro; espremê-la em `marketing` faria quem cuida de anúncio herdar
o poder de mover oportunidade. **Módulo novo não nasce no banco**: `role_permissions`
tem uma linha por cargo e por módulo, e cargo criado antes fica sem a linha — o
admin simplesmente não veria Automações no menu. Quem pegou foi
`e2e/fase4-permissoes.spec.ts`, e a migração dá MANAGE **só ao Admin da rede**:
automação ligada manda mensagem sozinha, e distribuir isso a todo cargo
existente seria decidir pela clínica um acesso que ela não pediu.

Faltam as fases 2 a 5: o quadro, as ações que falam, o tempo e o histórico.

### 2026-09-24 — Automações, Fase 2 (o quadro)

`/admin/automacoes`: lista e editor de quadro infinito com **`@xyflow/react`**
(React Flow 12, dependência nova). Ao fim desta fase dá para montar na tela a
automação que a Fase 1 escreveu à mão em SQL — e o E2E prova exatamente isso,
conferindo que o grafo salvo pelo editor é o que o motor lê.

**A lib fica contida no quadro.** A conversão entre o nosso grafo
(`nos`/`ligacoes`, o que vai para o banco) e o formato `Node`/`Edge` acontece
num arquivo só; motor, validador e resumo nunca veem a biblioteca. Trocá-la um
dia não deveria obrigar a reescrever o executor.

**Salvar é explícito.** O grafo é regra de negócio que age sozinha depois:
gravar a cada arrastão gravaria estados intermediários — um fluxo pela metade,
ligado, disparando errado. Mas **ligar salva antes**, senão a pessoa ligaria a
versão do banco convencida de que ligou a que está vendo.

**A validação é o coração desta fase**, e é função pura com 9 casos de teste:
sem gatilho, dois gatilhos, node solto, campo obrigatório vazio, anel, e a
distinção entre erro (impede ligar) e aviso (só alerta). Automação inválida e
ligada é o mesmo erro mudo do gatilho que nunca dispara — o fluxo fica salvo,
ativo e silencioso.

Detalhes que existem por uma razão:
- **Uma saída leva a um lugar só.** Ligar "sim" a dois nodes pareceria "faça os
  dois", e o executor seguiria um — o caminho errado, em silêncio. A segunda
  ligação substitui a primeira.
- **`gatilhos` é derivado do grafo** a cada salvamento. Escrito à mão,
  dessincronizaria no primeiro ajuste, e o motor procuraria por um evento que
  ninguém assina.
- **Node desconhecido no meio do fluxo para a execução com motivo.** Os nove
  tipos que ainda não têm executor aparecem esmaecidos na paleta e avisam na
  barra inferior; seguir adiante fingindo que a ação aconteceu seria pior.
- **Excluir exige desligar antes**: apagar uma automação ligada é apagar algo
  que está agindo agora.

**Dois defeitos que o E2E pegou na hora de montar o fluxo pela tela:**
1. **O node novo nascia fora da área visível** — e o painel de configuração,
   abrindo, comia mais 320px. Clicar na paleta parecia não fazer nada. Um
   `ResizeObserver` reenquadra quando a área do quadro muda, o que cobre de uma
   vez o painel abrindo, a barra lateral recolhendo e a janela mudando de
   tamanho; acertar isso com `setTimeout` seria cravar um número que a máquina
   lenta desmente.
2. **O painel mostrava "A unidade do fato" e o grafo salvava `alvo: undefined`**
   — a tela dizendo uma coisa e o banco guardando outra. Cada tipo de node
   passou a nascer com os padrões dele.

Módulo novo no menu da rede (só lá: o motor reage a fatos de todas as unidades,
e uma versão por filial prometeria um recorte que ele não faz).

Faltam as fases 3 a 5: as ações que falam, o tempo e o histórico.

### 2026-09-24 — Automações, Fase 3 (as ações que falam)

Cinco ações novas: **mandar mensagem** ao cliente, mover de etapa, marcar
ganho/perdido, marcar com tag e definir responsável. É aqui que a automação
deixa de mexer só em coisas internas e passa a **falar com o cliente** — e é
por isso que os limites de bom comportamento entram nesta fase, não na próxima.

**O envio saiu de `actions/` para `lib/inbox/enviar.ts`.** Agora há dois
remetentes: a pessoa no inbox e o motor. Uma segunda implementação divergiria
no primeiro ajuste, e a primeira divergência seria justamente a **janela de 24h
da Meta** — a regra que, quando falha, marca como "enviado" o que o cliente
nunca recebeu. A action continua existindo e passou a chamar o núcleo.

**A mensagem precisa de uma conversa.** Mensagem não existe no vácuo: mora numa
thread do inbox, que é onde a equipe vê a resposta. O motor usa a conversa do
contexto ou a mais recente do cliente naquele canal; **não abre conversa
nova** — e no WhatsApp oficial nem seria possível sem template aprovado. Fora
da janela de 24h o passo falha dizendo exatamente isso, em vez de um "enviado"
que não chega.

**Dois limites, e cada um falha de um jeito diferente:**
- **Silêncio noturno (21h–8h por padrão) faz a mensagem ESPERAR**, não sumir.
  Descartar faria o lembrete do dia seguinte simplesmente não acontecer. A
  faixa atravessa a meia-noite, e é aí que a aritmética ingênua erra: comparar
  sempre com `>=` e `<=` daria "nunca é noite" no caso normal.
- **Teto por cliente por dia (3) RECUSA.** Esperar até amanhã acumularia a fila
  e mandaria tudo de uma vez às 8h01.

Valem só para o que fala com o cliente: avisar a equipe e anotar na
oportunidade não acordam ninguém, e travá-los faria a recepção descobrir de
manhã um no-show da véspera.

**As ações de CRM fazem o mesmo que a tela, pelos mesmos caminhos.** Mover de
etapa também grava a linha do tempo do card e emite os eventos, como
`updateLeadStage`; uma ação que só trocasse a coluna deixaria o histórico
mentindo sobre como o card chegou ali. E "nada a fazer" é um **fato, não um
erro**: adicionar uma tag que já está lá não pinta o passo de vermelho nem
emite "dados alterados".

**O anel agora tem teste de verdade.** O validador recusa o ciclo dentro de um
grafo; este é outro — dois grafos em linha reta cujo anel se fecha pela corrente
de eventos, porque a ação de um emite o gatilho do outro. O E2E monta o par
adiciona-tag/remove-tag (com uma automação só o anel morreria sozinho: a
segunda passagem não alteraria nada), acende o pavio editando o cliente pela
tela, e confere que as execuções **estabilizam** e que nenhuma passa da
profundidade máxima. Fechou em dez voltas; sem a trava seriam centenas em
segundos.

Faltam as fases 4 e 5: o tempo e o histórico.

### 2026-09-24 — Automações, Fase 4 (o tempo)

Esperar, esperar até uma data, gatilho de horário e busca de clientes — mais o
**segundo serviço de cron no Railway, a cada 5 minutos**. Com isto o catálogo
inteiro de nodes é executável, e os gatilhos de tempo adiados desde a frente de
eventos finalmente existem.

**A espera não segura nada rodando.** Ela grava uma data em `rodar_apos` e
devolve o run à fila; quem o faz andar de novo é outra execução, outro request,
possivelmente outro container. É a promessa central do motor, e agora há um E2E
que a prova: o fluxo para, ninguém é avisado, o cron roda, o fluxo termina.

**Um defeito que só apareceu escrevendo esse teste:** ao esperar, o run gravava
o **próprio** node de espera em `no_atual` — e o cron o re-executaria ao
retomar. "Esperar 3 dias" viraria esperar 3 dias **a cada retomada**, para
sempre, sem nada explicar. Agora grava o node SEGUINTE: a espera já aconteceu,
o que falta é o depois.

**`espera.ate` com momento que já passou segue em frente**, em vez de aguardar
um instante que não existe mais — "24h antes" de um agendamento que é daqui a
duas horas. Travar num passado é o pior sintoma possível: nada acontece e nada
explica.

**`buscar.clientes` abre uma execução POR CLIENTE**, e não um laço interno.
Cada cliente tem o próprio contexto, o próprio passo a passo e os próprios
limites — um laço faria os mil compartilharem um histórico só, e o teto por
cliente não teria como funcionar, porque ele conta execuções. As filhas rodam
em sequência: em paralelo, cem clientes virariam cem envios simultâneos pelo
mesmo canal, que é como um provedor de WhatsApp define disparo em massa. E há
teto obrigatório (200): é a diferença entre a campanha que alguém quis e um
disparo que ninguém revisou.

**O gatilho de agenda precisa de memória.** O cron passa de cinco em cinco
minutos; sem registrar o último disparo, o lembrete das 9h sairia doze vezes
por hora. `ultimo_disparo_agenda` é marcado **antes** de executar e só se
ninguém marcou no meio-tempo — uma busca de quinhentos clientes demora mais que
a passagem seguinte do cron, e sem isso ela recomeçaria inteira.

**Dois serviços de cron, mesmo script e mesma imagem**, com a lista de jobs
escolhida por `CRON_JOBS`. Um script por serviço faria o Dockerfile crescer a
cada ritmo novo, e o `railway.toml` da raiz fixa o Dockerfile para todos.
Documentado no CLAUDE.md §14.1.

**`acao.lembrete` foi REMOVIDO do catálogo.** Ele estava no plano, escrito
antes de as esperas existirem: "daqui a 3 dias, avise a equipe" agora é
`espera` + `avisar`. Dois caminhos para a mesma coisa é exatamente o que um
catálogo curado não deve ter.

Falta a fase 5: o histórico das execuções.

### 2026-09-24 — Automações, Fase 5 (histórico e ensaio) — motor completo

Painel de **Execuções** no editor, com o passo a passo de cada uma — e o
**ensaio**, que é a peça que faltava. Com isto o plano de cinco fases fecha: as
automações estão de pé, do gatilho ao histórico.

**O ensaio responde "por que não disparou?" sem cobrar o preço da resposta.**
Sem ele, conferir um fluxo significa provocar o fato real e torcer: mandar a
mensagem ao cliente para descobrir que a condição estava invertida. O ensaio
percorre o fluxo com um fato que **realmente aconteceu** — o mais recente
daquele tipo na corrente — e não executa nada.

**As condições são avaliadas de verdade; só os EFEITOS não acontecem.** Simular
também as condições transformaria o ensaio num desenho bonito que não prova
nada. A ação vira uma anotação ("Faria: avisar a equipe"), a espera é pulada
(ninguém confere um fluxo esperando três dias) e `buscar.clientes` entra na
lista de efeitos porque abrir cem execuções filhas é efeito — cada uma agiria.

**Funciona com a automação desligada**, e é aí que mais serve: conferir antes
de ligar é o ponto.

**Ensaio não conta como execução.** A coluna `simulacao` o separa no histórico,
e isso teve duas consequências que precisaram ser corrigidas junto: ele sai da
contagem da lista de automações (senão a clínica acharia que o fluxo rodou
sozinho) e do **teto de contatos por cliente do dia** — conferir o fluxo três
vezes calaria a automação até amanhã.

**O passo a passo mostra o que cada node DECIDIU**, não só que rodou: qual saída
do IF, para quem foi o aviso, por que a mensagem não saiu. É a diferença entre
um log e uma explicação — e o resumo é traduzido para uma frase em vez de
despejar o JSON, que transferiria para quem lê a tarefa de garimpar.

**Ajuste de leitura no quadro:** com um painel aberto comendo 360px, um fluxo
largo encolhia a ponto de ninguém ler os cards. O enquadramento ganhou piso de
zoom — cortado e legível é melhor que inteiro e ilegível, e o quadro rola.

**O motor está completo e no ar.** O serviço **Automations Cron** foi criado no
Railway (`*/5 * * * *`, `CRON_JOBS=automacoes`, mesmo Dockerfile e mesmo
`node /app/cron.mjs` do outro), e a primeira passagem respondeu
`{ok:true, retomadas:0, erros:0, agendas:0}` em 350ms. As credenciais entraram
por **referência** ao serviço principal, não copiadas: um segredo duplicado é
um segredo que um dia diverge.

### 2026-09-24 — O parser de anúncio da uazapi estava errado nos três campos

As primeiras mensagens de anúncio de verdade chegaram, e **nenhuma foi
marcada**: todas nasceram "Orgânico". O parser foi escrito a partir da
documentação e de um webhook de teste; sondar a instância real mostrou que a
forma é outra.

**O que o tráfego real diz** (51 mensagens de anúncio num lote de 200):

| o que se supunha | o que chega |
|---|---|
| `m.contextInfo` / `extendedTextMessage` / raiz | **`m.content.contextInfo`** — e só ele |
| `sourceId` | **`sourceID`** — 51 de 51; com a grafia minúscula, zero |
| `sourceUrl`, `thumbnailUrl` | **`sourceURL`**, **`thumbnailURL`** |
| `mediaType` textual (`"IMAGE"`) | **número** (1 = imagem, 2 = vídeo) |

Qualquer um dos dois primeiros erros sozinho já anulava tudo: sem o caminho não
se acha o objeto, e sem `sourceID` não há id de anúncio — que é o campo que
liga à campanha. **E falha em silêncio**, do pior jeito: a mensagem é gravada
normalmente, a conversa nasce "Orgânico", e ninguém descobre que o anúncio
trouxe o cliente.

**Um campo de brinde:** `sourceApp` (`"instagram"` | `"facebook"`) diz a
plataforma direto, sem adivinhar pela URL — que é o que a inferência fazia, e
erra justamente com os encurtadores que o próprio Facebook usa (`fb.me`).

**A lição, que virou teste:** contrato de terceiro se confere no tráfego, não na
documentação. `tests/uazapi-anuncio.test.ts` fixa a forma real com dez casos, e
o primeiro deles falharia com o parser antigo.

**Tamanho do estrago:** só 4 conversas gravadas perderam a atribuição — o
webhook é recente. Mas **26% das mensagens recebidas naquela instância vêm de
anúncio** (264 de 1000 no histórico), então o que se corrigiu vale para todas as
próximas. As 4 foram refeitas a partir do payload que a uazapi ainda tinha.

### 2026-09-24 — O selo do anúncio passa a dizer QUAL anúncio

O selo mostrava **"Anúncio: Fale conosco"**. Aquilo é o texto do BOTÃO — vem
igual em 109 de 109 mensagens reais — e não identifica nada: dois criativos da
mesma campanha têm o mesmo botão. O que quem atende precisa é saber de qual
peça a pessoa veio.

**A imagem do criativo vem de graça no aviso, em base64**, e é ela que fica
guardada. A URL que a Meta manda junto **expira em quatro dias** (o parâmetro
`oe=` é um timestamp — medido no tráfego): guardar a URL daria um selo com
imagem na semana em que a mensagem chegou e sem imagem depois, sem nada
explicar. São ~2,2 KB, que cabem no jsonb da mensagem, com teto de 64 KB porque
o campo vem do protocolo e não há contrato de tamanho.

**O nome do anúncio agora tem hierarquia:** o nome que o gestor deu → o nome do
criativo → **a primeira linha do texto do criativo**, que é o que a pessoa leu
antes de clicar. Os dois primeiros dependem da integração Meta Ads; o terceiro
funciona hoje, sem ela. O botão desceu para o rodapé, junto da plataforma e do
conjunto: contexto, não identidade.

**O lookup passou a pedir o criativo à Graph API** (`creative{name,
thumbnail_url,body,title}`), guardado em `meta_ad_cache`. A miniatura de lá é
hospedada pela Meta e não expira como a do aviso — é o reforço para quando o
base64 não veio.

A função que escolhe o nome saiu do componente para `lib/ads/rotulo.ts`: é
regra pura, e importá-la do inbox arrastava a árvore inteira do servidor para
dentro do teste.

**E a legenda do criativo entrou junto**, dobrada em três linhas com "ver o
anúncio todo". É o texto que promete o desconto, a data, a condição — e é
sobre isso que o cliente fala na primeira frase. Aberta por padrão empurraria a
conversa para baixo, e o selo passaria a atrapalhar quem quer ler as mensagens.

**A legenda não repete o que já virou nome.** Sem a integração Meta Ads o nome
É a primeira linha dela; mostrá-la de novo logo abaixo faria o selo dizer a
mesma coisa duas vezes. Com `adName` vindo da Meta, aparece inteira.

### 2026-09-24 — Conversa nova não aparecia no inbox sem recarregar

Relatado pelo Heitor assim: o inbox parecia estar em tempo real **só para
mensagens novas**. Era isso mesmo — e a causa não estava onde a suspeita
naturalmente cai.

O banco estava certo: `conversations` na publicação `supabase_realtime`, as
policies iguais às de `messages`. Uma sonda com sessão de verdade (magic link
pela service role, como o `global-setup` do E2E já fazia) confirmou que o
INSERT chega ao navegador normalmente.

**O defeito estava na ordem dos fatos.** `resolveConversation` cria o contato
primeiro e a mensagem depois, e `getConversations` descarta quem não tem
`last_message_at` — contato sem mensagem nenhuma não é conversa, é cadastro.
Então:

1. INSERT da conversa, ainda muda → a lista fazia o acréscimo otimista e
   recarregava do servidor, **que devolvia a lista sem ela**;
2. INSERT da mensagem → o trigger `on_new_message` preenche `last_message_at`
   → chega um UPDATE, que é o instante em que ela vira conversa;
3. o handler de UPDATE só sabia mesclar o que já estava na lista — e ela não
   estava. Fim: só com F5.

O mesmo buraco atingia o contato criado pelo quadro do CRM, que nasce mudo e
nunca aparecia ao receber a primeira mensagem.

A decisão dos três caminhos (`atualizar`, `recarregar`, `ignorar`) virou
`lib/inbox/lista.ts`, fora do componente: é regra pura e é o tipo de coisa que
quebra em silêncio — ninguém percebe um evento que deixou de chegar. Por isso
também o `.subscribe()` ganhou retorno: canal que não conecta agora deixa
rastro no console em vez de simplesmente parar de atualizar.

Para não pedir a lista inteira a cada mensagem de conversa que o servidor não
devolve (outro dono, com o escopo "só os meus" do CRM), os ids recusados ficam
marcados. O Realtime entrega o evento — a RLS é por rede —, mas a lista não os
recebe.

O E2E `inbox-realtime.spec.ts` reproduz a ordem do webhook: primeiro o contato,
depois a mensagem. Numa gravação só o defeito não apareceria — foi conferido
que ele falha sem a correção.

---

## 4. Decisões de produto

O PRD e as primeiras versões do CLAUDE.md descrevem coisas que **não** são mais
verdade. O que vale:

| Decisão | Quando | Por quê |
|---|---|---|
| **Campanha e automação são dois produtos** | 2026-09-24 | Campanha é disparo em massa por público (aniversário, X dias após a visita); automação é reação a um fato. A tela de campanhas fica como está e nada migra para o motor. |
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
