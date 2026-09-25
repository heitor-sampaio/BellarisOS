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

## 2. Estado atual (2026-09-25)

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
  esses fatos: gatilho por evento ou pelo relógio (de X em X minutos ou horas,
  ou num horário do dia — diário, semanal, mensal), condições (SE e ESCOLHER),
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
- **Erro de banco nunca é descartado:** `lib/db.ts` (`gravar`/`ler`/`tentar`)
  cobre as 399 consultas que antes falhavam em silêncio.
- **Design system fechado e conferido na tela renderizada.** A paleta não tem
  mais lacuna (erro, informação, escala categórica, elevação de overlay), o
  fundo é off-white neutro, e **seletor tem uma forma por função e UMA altura**
  (`--altura-controle`). O que o olho vê é conferido por E2E, não por
  revisão de código: `seletores-padronizados.spec.ts` mede a altura de
  todo seletor visível em 11 telas e recusa aparência escrita em `style`
  inline.
- **Testes:** 416 unitários (361 no web + 37 em `utils` + 18 em
  `validators`, Vitest) + 81 E2E (Playwright) rodando contra o banco de
  desenvolvimento. `pnpm test` e `pnpm --filter web test:e2e`.
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

### 2026-09-24 — Uma forma de seletor para cada função

Relatado: "tem páginas onde as opções ficam num box com pílula no selecionado,
outras com uma pílula para cada opção, outras com dropdown, umas com ícone,
outras sem".

Mapeado antes de mexer: **12 `<SegSelect>`, 110 `<select>` nativos e 33 grupos
de botões-pílula** — e 50 lugares onde um grupo de opções exclusivas era
desenhado à mão, cada um com seu raio, sua altura e sua fonte.

A padronização é **por função**, não por aparência:

| Situação | Forma |
|---|---|
| exclusiva, 2 a 5 opções curtas e fixas | `<SegSelect>` |
| opções vindas de dados, ou mais de 5 | `.filtro-select` |
| liga/desliga de um filtro só | `.filtro-toggle` |
| filtro que acumula (tag) | `.chip-filtro` |

O SegSelect **já existia** e já resolvia o caso difícil: segmentado no desktop,
dropdown no celular. Três telas o tinham reimplementado à mão.

**A barra de clientes era o caso que mais enganava**: Todos/VIP/Novos/Inativos
eram pílulas soltas, e pílula solta é o desenho de filtro que acumula. A tela
prometia que dava para marcar VIP e Novos ao mesmo tempo — e não dava.

Os 12 dropdowns de filtro perderam o `style` inline (que vencia a classe e
mantinha cada um do seu jeito) e ganharam **o chevron do sistema** em vez do
nativo, que muda de desenho em cada navegador e não acompanha a cor do texto.
Dois arquivos definiam um `selectStyle` local — um com altura 38 e fundo cinza,
outro com raio 8 e fundo branco.

**Ícone:** seletor de texto não leva. O rótulo já diz o que é, e o ícone
repetido cinco vezes na mesma barra vira ruído. O toggle pode levar — ali o
ícone é o próprio assunto que se liga.

**Fora de escopo, de propósito:** escolha de item em lista mestre-detalhe e
passo de wizard não são seletores, ainda que pintem o selecionado de rosé.

### 2026-09-24 — Seletor passa a ter UMA altura, e a tela não opina

A primeira passada padronizou a FORMA e deixou o TAMANHO de fora. O Heitor
voltou com o que sobrou, e com razão: "na página de tratamento temos pílulas
separadas, no dashboard o seletor de período é maior do que o seletor de
unidade na agenda. Preciso que tudo seja padronizado."

A causa era uma prop: `<SegSelect compacto>`. Duas variantes de tamanho — 34px
e 27px — e **cada tela escolhia a sua**. O dashboard pegou a grande, a agenda a
pequena, e as duas estavam "certas". A prop saiu inteira; a aparência do
segmentado saiu do `style` inline e virou `.seg-desktop` / `.seg-chip` /
`.seg-mobile` no CSS, com `--altura-controle: 34px` valendo também para
`.filtro-select`, `.filtro-toggle` e o campo de busca de barra de filtros.

Os chips do segmentado deixaram de ser `btn-primary`/`btn-ghost`: botão de ação
carrega sombra de marca, e dentro de um seletor essa sombra fazia a opção
escolhida parecer um botão de salvar.

**O que ainda estava fora do padrão, e entrou:**

| Onde | Era | Virou |
|---|---|---|
| Tratamentos | 5 pílulas soltas (a reclamação original) | `<SegSelect>` |
| Painel de filtros do inbox | a mesma pílula para as três funções — exclusiva, liga/desliga e acumulável | dropdown, `.filtro-toggle` e `.chip-filtro` |
| Catálogo de procedimentos | pílula por categoria (que vem de dado) | `.filtro-select` |
| Checkout: forma de pagamento | 4 pílulas | `<SegSelect>` |
| Checkout: filial e profissional | pílula com ícone de mapa | `.filtro-select` |
| Planejamento: as duas seções | 2 pílulas | `<SegSelect>` |
| Integrações: como conectar o WhatsApp | 2 pílulas | `<SegSelect>` |
| Desfecho da oportunidade | 3 pílulas | `<SegSelect>` |
| Abrangência do membro (`ScopeChip`) | segmentado reimplementado, em 2 arquivos | `<SegSelect>` |
| Tags, filiais e procedimentos escolhidos | 4 desenhos de pílula acumulável | `.chip-filtro` |

`.chips-bar` saiu do CSS: ela existia para a fila de pílulas de Tratamentos
rolar na horizontal em 390px. Com a fila virando segmentado, o celular já
recebe um botão só que abre menu — o problema deixou de existir.

**Painel estreito é a exceção declarada.** No painel de filtros do inbox (288px)
um segmentado quebraria em duas linhas e deixaria de ler como um controle só;
ali a escolha exclusiva vira dropdown de largura cheia. Está na regra, não no
gosto de quem escreveu a tela.

**Amarrado em teste** (`e2e/seletores-padronizados.spec.ts`, 12 casos): em 11
telas, todo seletor visível mede exatamente `--altura-controle` — lido do
próprio CSS, não escrito no teste —, e nenhum carrega padding, raio, fundo ou
borda em `style` inline. Essa segunda asserção é a que importa no longo prazo:
`style` vence classe, então um padding esquecido desfaz a padronização inteira
sem quebrar nada. Era exatamente o mecanismo que produziu os quatro desenhos.

### 2026-09-25 — Política de privacidade, pública

Pedido do Heitor. Em `/privacidade`, sem sessão.

**O texto descreve o que o sistema FAZ, e cada afirmação foi conferida no
código** — os quatro buckets privados, os terceiros que realmente recebem dado,
o que o pedido de LGPD entrega, o que a retenção apaga. Numa política de
privacidade, frase confortável e falsa custa caro, e a tentação de escrever
"seus dados são totalmente seguros" é grande.

O que ele precisa saber que ficou de fora: **razão social, CNPJ, endereço e o
e-mail do encarregado**. São fatos do mundo, não do código — inventar qualquer
um tornaria o documento falso. Ficaram isolados em
`app/privacidade/dados-do-controlador.ts`, e enquanto estiverem vazios a
página **mostra um aviso** em vez de fingir que a informação existe.

O eixo do texto é a distinção **controlador × operador**: a clínica controla os
dados de quem ela atende, o BellarisOS opera por conta dela, e somos
controladores só dos dados de conta de quem usa o sistema para trabalhar. É o
que decide a quem o titular pede o quê, então vem antes de tudo. Dado de saúde
ganhou seção própria (art. 5º, II), com o que o sistema faz de diferente: bucket
privado, link temporário, permissão específica, e o aviso que não carrega
conteúdo clínico.

**O teste achou o defeito que eu não tinha visto.** A página não chama
`getTenantContext` — e mesmo assim redirecionava para `/login` com
307. A causa: `lib/supabase/middleware.ts` manda para o login tudo que não
está numa lista de rotas públicas, e `/privacidade` não estava.
`/` também não estava: a landing só não caía porque decide sozinha.
"Não pedir sessão" não torna uma página pública neste projeto.

### 2026-09-25 — O sino passa a tocar para quem tem interesse

"Todos que forem partes interessadas no evento devem receber a notificação."

O sino funcionava — realtime, contagem, painel — e estava permanentemente
vazio para admin e gerente. A causa: `notifyUser` só era chamado para o
**profissional do agendamento**. No banco de desenvolvimento, as 108
notificações de equipe eram todas de uma única profissional demo.

**"Parte interessada" não virou uma lista escrita à mão por evento.** Ela sai
de dois eixos que o sistema já conhece, em
`lib/notifications/interessados.ts`:

- **envolvido direto** — a pessoa de quem o fato É (o profissional recebe
  porque a agenda é dele, com permissão ou sem);
- **responsável** — quem tem `MANAGE` no módulo que governa o fato e
  alcança a unidade onde aconteceu. É a abrangência do §11, não uma regra nova.

Duas decisões que valem registrar. **`VIEW` não entra**: ver o módulo é
poder consultar, não responder pelo que acontece nele — quem só olha não
precisa ser interrompido. E **quem causou o fato sai da lista**: sino avisando
a pessoa do que ela acabou de fazer é ruído, e ruído treina a ignorar o sino.
O check-in é a exceção declarada: ali a parte interessada é uma, quem vai
atender; avisar a gerência de cada chegada seria um sino tocando o dia inteiro.

**Um alerta que o sistema prometia e nunca entregou.** O §9.8 listava "estoque
mínimo" entre as notificações operacionais desde sempre. O fato existia —
`estoque.abaixo_do_minimo` é emitido por gatilho no banco desde
2026-09-23, na travessia do mínimo — e **morria ali**: ninguém era avisado.
Agora um job de hora em hora (`/api/cron/estoque-minimo`) recolhe os
eventos da janela e notifica quem responde pelo estoque da unidade.

Por que cron e não a ação que mexe no saldo: ele cai em cinco ou seis lugares
(atendimento, entrada, ajuste, transferência, código de barras), e foi
exatamente por isso que o evento virou gatilho no banco. Instrumentar cada
caminho de novo seria repetir o erro que o gatilho resolveu. E sem estado
próprio de "onde parei": a janela tem folga (90 min para um ritmo de 60) e a
repetição é evitada perguntando se já existe notificação com o id daquele
evento — guardar um ponteiro seria mais uma coisa a dessincronizar quando o
job falhasse no meio.

`e2e/notificacoes-interessados.spec.ts` prova a regra pelo caminho real,
por HTTP: cria cargos com `MANAGE` e com `VIEW`, gente na unidade,
na rede e em outra unidade, insere o evento, chama o job e confere quem
recebeu. Conferido ao contrário: fazendo `VIEW` contar, o teste falha na
asserção certa.

### 2026-09-25 — Uma ficha só, e a avaliação vira procedimento

"Não precisamos de criação de ficha específica de anamnese, isso pode ser feito
pelo construtor universal de fichas. A entidade avaliação deixou de existir e
passou a poder ser criada como um procedimento."

Ele tinha razão sobre o diagnóstico: eram **dois construtores com o mesmo
código e dois nomes**. `settings-anamnesis.tsx` e `settings-attendance.tsx`
eram casca fina em volta do mesmo `settings-forms.tsx`, diferindo só nos
rótulos; `anamnesis-forms.ts` e `attendance-forms.ts`, idem. Quem cadastrava um
procedimento escolhia em qual das duas fichas pôr cada pergunta, e a escolha
não mudava nada — nem os campos, nem o momento de preencher.

**O banco** (migração `20260925000001_ficha_unica.sql`, em uma transação):
`attendance_forms` → `forms`, `procedures.attendance_form_id` → `form_id`,
`medical_record_entries.attendance_data` → `form_data`; saem
`anamnesis_forms`, `procedures.anamnesis_form_id` e o `is_evaluation` dos dois
lados. Conferido ANTES de rodar: 0 agendamentos sem procedimento, 0 fichas
preenchidas nas 21 entradas, e os 2 agendamentos marcados como avaliação já
apontavam para o procedimento "Avaliação". Nada de prontuário se perdeu.

`medical_records.general_anamnesis` **fica**: é o questionário de saúde do
cliente, preenchido uma vez, que alimenta o termo de consentimento e o
planejamento. Outra coisa da ficha por procedimento — e a confusão entre as
duas é o que fazia a coluna `anamnesis_data` guardar, num caminho, as
observações do atendimento, que têm coluna própria (`notes`) ao lado.

**O que a avaliação governava, e onde foi parar:**

| Governava | Agora |
|---|---|
| agendar SEM procedimento | não existe: procedimento é obrigatório |
| o checkbox "Consulta de avaliação" no CRM | a lista de procedimentos, como qualquer outro |
| excluir a avaliação dos itens de um plano | escolha de quem monta o plano |
| "Avaliação" no lugar do nome, na agenda | o nome do procedimento, que já é "Avaliação" |
| o fluxo de montar plano durante o atendimento | **qualquer** atendimento que ainda não pertença a um plano |
| a métrica "avaliações agendadas × comparecimento" | o funil do comercial (`source = COMMERCIAL`) |

A última é a que exigiu decisão, e é a regra do §13.1 aplicada: o rótulo
acompanha a conta. A métrica media quantos primeiros atendimentos o time
comercial marcou e quantos aconteceram; sem a flag, `source` responde a mesma
pergunta — mas então o KPI não pode continuar escrito "Avaliações agendadas".
Virou "Agendados pelo comercial".

A quinta também: o fluxo de montar plano era exclusivo da avaliação. A condição
que sobrou é a que sempre importou — não se propõe plano novo dentro de uma
sessão que já pertence a um plano.

Preso em `e2e/ficha-unica.spec.ts`, que confere as três frentes: uma aba de
fichas, um seletor no cadastro de procedimento, e as colunas fora do banco.

### 2026-09-25 — Três defeitos meus, e o que cada um ensinou

O Heitor cortou uma justificativa minha que não se sustentava: eu vinha
marcando achados como "anteriores ao meu trabalho", e o sistema inteiro é meu.
Não existe defeito de outra pessoa aqui. Os três foram resolvidos, cada um com
um teste que falha se voltar.

**1. A hidratação do inbox caía, e a tela mais pesada do sistema era redesenhada
inteira no cliente.** A inicial do avatar saía de `nome[0]` — que pega a
primeira unidade **UTF-16**, não o primeiro caractere. Um contato chamado
"👁️‍🗨️" (o nome vem do WhatsApp, quem escolhe é o contato) devolvia **metade de
um par substituto**, que não é UTF-8 válido: o servidor serializa como U+FFFD,
o cliente calcula o substituto solto, os textos não batem e o React descarta a
árvore.

O mesmo erro estava escrito de **seis jeitos diferentes** em cinco arquivos
(`[0]`, `charAt(0)`, `split(' ').map(n => n[0])`). Virou
`iniciaisDoNome` em `packages/utils`, com `Array.from`, que
itera por code point e dá o mesmo resultado no Node e no navegador — que é o
que a hidratação exige. `Intl.Segmenter` daria o emoji inteiro em vez de
só o olho, mas depende do ICU de cada lado, e ICU diferente é a mesma falha por
outro caminho.

**2. Chave de lista faltando no estoque.** O `map` devolvia um fragmento
`<>` **sem chave**, com a `key` no `<tr>` de dentro — que não
é o filho da lista. O React deixa de casar as linhas de um render para o outro,
e expandir um produto podia mexer no pedaço de DOM de outro. Fragmento com
chave exige a forma longa (`<Fragment key={…}>`).

**3. O lançamento sumia da tela que acabou de criá-lo.** A lista de
movimentações fechava em `created_at <= to`, e o `to` do
`resolvePeriod` é a janela **decorrida** — "agora", no relógio do app. O
`created_at` vem do relógio do Postgres, que está **0,2s à frente**
(medido contra o Supabase). Lançamento feito neste segundo nascia no futuro e
não entrava na lista. A janela decorrida existe para o delta comparar períodos
de mesmo tamanho; numa lista ela não tem função. Trocada por `fullTo` nos
três lugares que a usavam assim (financeiro da rede, da unidade, e o giro de
estoque do dashboard).

Esse terceiro tinha me enganado antes: o sintoma era
`financeiro-estorno.spec.ts` passar sozinho e falhar depois de
`fase1-dinheiro`. Parecia ordem de teste; era o intervalo entre gravar e
abrir a tela. Conferido ao contrário: com o código antigo, 2 de 3 rodadas do
teste novo falham.

**A guarda que faltava** é `e2e/render-limpo.spec.ts`: 19 telas, e falha
se alguma relatar hidratação divergente ou chave de lista. Os dois avisos saem
no console e eu vinha tratando console sujo como ruído de fundo.

### 2026-09-25 — Lista do celular: dez ajustes de uma vez

O Heitor mandou treze itens numa mensagem só. Dez entraram; três dependem de
decisão dele e estão em "Em aberto".

**Rolagem só na lista** (Planejamentos, Injetáveis). Mesmo raciocínio do inbox
e do quadro: rolando a página inteira, procurar um item no fim da lista leva
embora a busca e o filtro — que é o que se usa para achá-lo. Virou o par
`.tela-de-lista` + `.rolagem-da-lista`, só abaixo de 1024px.

**Cards condensados** (financeiro, estoque, equipe, procedimentos). A causa era
a de sempre: cada célula carrega o respiro da TABELA no `style` inline, e
inline vence classe — a regra que a tabela-virada-card tinha para o celular
**nunca valeu**. Com cinco linhas por card eram 130px só de folga vertical por
item. Altura do documento em 390px, antes → depois:

| Tela | Antes | Depois |
|---|---|---|
| Financeiro | 11.980px | 8.587px |
| Estoque | 2.806px | 1.970px |
| Equipe | 2.536px | 1.415px |
| Procedimentos | 1.873px | 1.418px |

Na equipe, FILIAL e CARGO saíram do card: a linha de cima do próprio card já
dizia "Cargo · Atende · Filial". O comentário no código já chamava essas
colunas de "escondidas" — ninguém as tinha escondido.

**Filtros do quadro de oportunidades.** `estiloGatilho` era estilo local com
33px ao lado de seletores de 34, e a borda engordando meio pixel de cada lado
ao ficar ativo: a barra inteira mexia quando se filtrava. A ordenação era um
`<select>` cru. E, dentro do `PickerCompacto`, o `estiloBotao` PADRÃO vencia a
classe que a barra passava — quem achou foi o próprio
`seletores-padronizados.spec.ts`.

**Abas de Configurações → `<SegSelect>`**, como Relatórios já fazia. Eram abas
sublinhadas: a mesma pergunta com duas caras.

**Agenda da rede: clicar num horário vazio marca ali.** A grade mostrava os
buracos do dia e não deixava preencher nenhum — só o agendamento já existente
era clicável. O minuto sai da posição do clique, arredondado para 15, e a
unidade é a COLUNA clicada, não a do filtro do topo. `defaultDate` já existia
no modal e nunca tinha sido usado por esta tela.

**Configurações → Geral** deixou de dizer "em breve". O que não se edita está
na tela em cinza, com o porquê: o `slug` é o endereço do portal (está em link
já mandado e em QR Code impresso) e o plano vem da assinatura. O documento é
gravado só com os dígitos.

### 2026-09-25 — O painel de filtros do inbox cabia fora da tela

Sobra da padronização dos seletores da véspera, achada ao fotografar o inbox no
celular: o painel nasce ancorado à ESQUERDA do gatilho, e o gatilho fica no fim
da barra de busca.

No desktop isso é inofensivo — o painel avança sobre a coluna da conversa, que
é o que um popover faz. Abaixo de 1024px a lista ocupa a tela inteira, o
gatilho encosta na borda direita, e 288px de painel começavam **metade fora da
tela**: a coluna da direita ficava cortada, sem rolagem que a alcançasse. Valia
do telefone ao tablet.

Ancorado à direita ele cresce para dentro, com teto de
`min(288px, calc(100vw - 24px))` para a tela estreita de verdade. A
ancoragem saiu do `style` inline e foi para o CSS pelo motivo de sempre:
ela depende da largura da tela, e isso é mídia — coisa que inline não sabe
fazer. Ganhou também o `--shadow-popover` que lhe faltava: ele flutua
sobre a lista, e elevação é de quem flutua.

`e2e/inbox-painel-filtros.spec.ts` mede a caixa do painel em quatro
larguras (360, 390, 820, 1440) e exige que ela caiba na viewport. Conferido que
o teste pega o defeito: com a regra antiga, falha em 360, 390 e 820 e passa no
desktop — exatamente onde o problema existia.

### 2026-09-24 — O cabeçalho da conversa encolhe no celular

"Na versão mobile da conversa no inbox, dá uma condensada na parte superior
onde tem os dados do contato." Ele ocupava **163px de uma tela de 844** — 19%
para dizer com quem se está falando, antes da primeira mensagem aparecer.

Duas causas. Com `flex-wrap`, o seletor de situação não cabia ao lado da
identidade e caía numa **segunda linha sozinho**, gastando uma faixa inteira
para uma pílula. E nome, canal/telefone e métricas eram três linhas empilhadas,
cada uma com a sua margem.

Agora o cabeçalho é uma linha só — voltar, avatar, identidade, situação e o
botão do card — e o detalhe flui embaixo do nome, com `display: contents` nas
duas fileiras para que elas dividam as mesmas linhas em vez de reservar cada
uma a sua. **163px → 92px.**

**Nada de informação sumiu, mudou de lugar.** O telefone já era campo do card
do contato; "última interação" e "1ª resposta" passaram a aparecer lá também,
só no celular (no desktop estão no cabeçalho, a dois centímetros — repetir
seria gastar espaço para dizer duas vezes). A pílula de espera fica: é o sinal
de urgência de quem atende, e só perde a palavra "resposta".

**Achado no caminho:** a folha do contato no celular abria em `inset: 0`, ou
seja, colada no topo do documento — e a topbar do app desenha por cima dos
primeiros 68px. O que ficava escondido ali era justamente a barra "Contato ✕":
não havia como fechar o card a não ser pelo voltar do aparelho.

`e2e/inbox-cabecalho-mobile.spec.ts` trava as três coisas: a altura no celular,
o trato de que o que saiu do cabeçalho está alcançável no card, e o desktop
inteiro como era.

### 2026-09-24 — O quadro de oportunidades perde as barras de rolagem

"No funil, não quero que apareça barra de rolagem nas colunas." Eram cinco
barras cinza atravessando o quadro, uma por etapa, competindo com os cards —
que é o que se lê ali.

A rolagem continua; só a barra some (`scrollbar-width: none` + o equivalente
WebKit). O que avisa que há mais passa a ser o próprio card cortado na borda da
coluna — mesmo raciocínio que a barra de abas já usava. A rolagem LATERAL do
quadro entrou junto, pelo mesmo motivo: uma barra horizontal sozinha embaixo de
cinco colunas limpas é o degrau que se acabou de tirar.

`overflow` e `overscroll-behavior` saíram do `style` inline e viraram
`.crm-board-cols` / `.crm-coluna-cards` no CSS.

### 2026-09-24 — O fundo deixa de ser rosé

"Não sei se tô gostando do rosé leve de background." Em vez de discutir, as
opções foram geradas na tela real — a variável sobrescrita no navegador, sem
tocar no código — e comparadas lado a lado com um card branco em cima.

O que a comparação mostrou: **o fundo tem um trabalho só, separar o card
branco do resto**. Por isso branco puro não serve (os cards somem) e por isso
a escolha é de matiz, não de claridade.

`--bg-app` passou de `#faf5f3` (nude rosado) para **`#f8f8f8`** (off-white
neutro), a pedido do Heitor: "um off-white, um cinza beeem leve, só pra dar uma
quebrada".

A decisão tem uma razão de design além do gosto: **o rosa do fundo competia com
o acento**. O rosé já aparece preenchido no KPI hero, no item de nav ativo, nos
botões primários, nas barras dos gráficos e agora no ponto de status da lista
de automações — repetir o matiz na superfície inteira tirava força justamente
de onde ele significa alguma coisa.

**O calor não sumiu, mudou de lugar**: borda (`--border`), divisória
(`--hairline`) e trilha (`--track`) seguem nude. É a identidade nos detalhes,
que a 1px continua legível e não disputa com nada.

Testada também a borda neutralizada junto com o fundo: a 1px a diferença é
imperceptível, e neutralizar tiraria o último traço quente sem ganho nenhum.

CLAUDE.md §13 e o readme da skill foram atualizados — a linguagem não é mais
"fundo nude quente".

### 2026-09-24 — Automações: a lista diz o que o fluxo faz

Relatado: "não gosto muito do visual geral da página de automações". As duas
telas estavam mesmo fora do padrão do resto do sistema.

**A lista tinha o card mais vazio do produto**: ~100px de altura para quatro
dados, com uns 800px de vão entre o nome e "0 execuções em 7 dias". E dizia por
onde o fluxo **começa** sem dizer o que ele **faz**, com o nome técnico do
evento. Agora cabe numa linha e conta o caminho:

    ● Move para follow-up
      Mensagem recebida › Se › Mover de etapa      0 execuções · 7 dias

O ponto à esquerda é a hierarquia por preenchimento na escala de um controle:
rosé = no ar, anel vazado = rascunho. O caminho segue as **ligações** a partir
do gatilho, não a ordem de criação — node solto não entra.

**`ROTULOS_DE_EVENTO`**: os 42 eventos ganharam nome em pt-BR no catálogo. A
tela inteira mostrava `entidade.acao`, inclusive o seletor onde se escolhe o
gatilho. O nome cru também esconde a diferença que mais importa:
`agendamento.cancelado` e `agendamento.nao_compareceu` estão a um underline de
distância e são duas conversas diferentes com o cliente.

**No editor**, quatro coisas: a paleta era texto puro enquanto o card que nasce
dela tem ícone (agora usam o mesmo, exportado de um lugar só); os pontos do
canvas estavam em `--border` sobre o fundo nude, dois tons quase iguais, e a
superfície lia como lisa; os problemas do fluxo eram texto solto onde se lê por
que o "Ligar" está apagado, e viraram faixa com fundo e borda na cor do pior
grau presente; e a barra tinha seis controles do mesmo peso — Execuções,
Versões e Limites viraram um segmento de consulta, Salvar e Ligar ficaram
separados, e "Salvo" deixou de ser botão desabilitado para ser estado.

### 2026-09-24 — O dashboard encaixa: linhas que fecham, colunas que terminam juntas

Relatado: "espaços sobrando, colunas em branco, a coisa não tá bem encaixada",
no desktop. Olhado em retrato de página inteira a 1280, 1440 e 1920 — em 1920 os
buracos são o dobro, e é lá que eles se explicam.

Quatro causas, nenhuma visível lendo o código:

1. **Procedimentos tinha seis cards numa grade de quatro colunas.** A segunda
   linha nascia com metade vazia; em 1920, meia tela de branco. Os dois de
   avaliação saíram para uma grade de duas, que fecha — e a largura dobrada cai
   bem num card que mostra nome, nota e número de avaliações.
2. **Profissionais tinha cinco em quatro colunas**: o quinto sozinho, com três
   quartos de branco ao lado. Virou 3 (rankings) + 2 (avaliação).
3. **`align-items: start`** dava a cada card a altura do próprio conteúdo, e as
   bordas de baixo da mesma fileira ficavam desencontradas. Em `stretch` a
   fileira fecha reta: o respiro sobra **dentro** do card, não entre eles — a
   diferença entre "sobrou espaço" e "tem espaço".
4. **A coluna da direita do topo terminava ~200px antes da esquerda.** Gráfico e
   ranking de filiais somam bem mais que dois cards. O card de estoque passou a
   ocupar o que resta, e as duas colunas terminam juntas.

De caminho: o vazio de "Hoje na rede" era um bloco centralizado com a altura de
quatro filiais listadas e virou uma linha com o ícone ao lado do texto; e as
grades de KPI estavam em `gap: 14` contra os 16px que o DS fixa — um fio mais
apertadas que tudo abaixo delas.

### 2026-09-24 — Dois faturamentos na mesma tela

Achado durante o alinhamento de design e corrigido a pedido do Heitor: "isso
não pode em hipótese alguma ser divergente — o dado tem que ser real e
confiável".

Em `/admin/reports`, o cartão dizia **R$ 5.200,00** e a legenda do gráfico
logo abaixo, **R$ 5.450,00**. Conferido no banco: o cartão estava certo. A
diferença de R$ 250 era uma receita **estornada** que o gráfico contava.

**Não era erro de conta. Eram duas cópias da definição do indicador.** O KPI
somava `txsCurr` em JavaScript excluindo o estorno; o gráfico somava o mesmo
array sem excluir. Duas cópias de uma regra divergem — é questão de quando.

O mais irônico: `metrics_series` já existia e faz tudo certo (só pago, estorno
fora dos dois lados, eixo em `paid_at`, agregado no Postgres, no fuso do
negócio). O dashboard já a usava desde 2026-09-09, com um comentário no código
dizendo exatamente por quê. **A tela de relatórios ficou de fora daquela
correção.**

Três defeitos no mesmo bloco de dez linhas, além do estorno: a despesa do
gráfico não exigia `is_paid` (o §13.1 pede simetria) e o eixo era
`created_at`, não `paid_at`.

**A correção foi tirar a conta da tela.** `getCore` e `getSeries` alimentam
KPI e gráfico; `sumRevenue`/`sumExpenses` foram **removidas** — deixar a função
lá era deixar o convite para a próxima divergência.

**Duas divergências que ainda não apareciam**, encontradas ao varrer o resto:

- o financeiro da **unidade** somava sobre a lista, filtrada por `created_at`.
  Enquanto tudo é criado e pago no mesmo dia, bate; a primeira parcela criada
  num mês e paga no outro cairia em dois lugares diferentes — e o checkout de
  plano cria exatamente isso;
- o card "Receita por lançamento" da unidade era `receita ÷ nº de lançamentos`,
  enquanto o "Ticket médio" da rede é `serviceRevenue ÷ atendimentos
  concluídos`. Duas contas, dois rótulos, nenhuma forma de comparar as telas.
  Agora é a conta canônica nas duas, e o rótulo mudou junto.

`e2e/relatorios-coerencia.spec.ts` fixa isso em três testes: cartão × legenda ×
banco, estorno que não pode inflar a série, e o financeiro da unidade contra o
núcleo. **⚠️ Dois detalhes que custaram tempo no teste:** o rótulo está em
maiúsculas por CSS (no DOM é "Faturamento") e o número do KPI é animado — ler
de primeira pega o meio da contagem.

### 2026-09-24 — A paleta fecha, e 2.882 desvios de design somem

Relatado pelo Heitor: "percebo alguns desalinhamentos de design em todo o
sistema". Mesmo método da varredura anterior — medir antes de opinar.

Os tokens do app batiam **exatamente** com os da skill `/lumiere-design`. O
desvio não estava na definição, estava no uso:

| Desvio | Antes | Agora |
|---|---|---|
| Tamanho de fonte em px | 1.734 | 31 |
| Cor da paleta do **Tailwind** | 587 | 0 |
| Cor inventada | 353 (143 tons) | 54 (só marca de terceiro) |
| Token escrito à mão (`#c34d6b`) | 165 | 0 |
| Sombra em superfície neutra | 34 | 0 |
| Gradiente | 9 | 4 (legendas de mapa de calor) |

**A causa não era descuido: a paleta não cobria o que o sistema precisa.** Não
havia como pintar um erro — então cada tela pegou o vermelho do Tailwind (146
usos de `red-600`) ou inventou o seu. O mesmo com azul de estado informativo,
que não existe no Rosé Vivo. Verde era o caso mais claro: existe
`--success`, e o código tinha **sete verdes diferentes**.

A paleta fechou com o que faltava, e cada peça resolve uma lacuna real:

- `--danger` / `--info` (+ soft e border) — terrosos de propósito: o vermelho
  do Tailwind é frio demais ao lado do nude quente;
- **escala categórica `--cat-1…6`** — para DISTINGUIR, não para significar
  (qual profissional ocupa o horário). Seis tons de rosé seriam
  indistinguíveis, e era por isso que cada tela escolhia os seus. As três
  primeiras reusam brand/info/success: quem tem quatro profissionais nunca sai
  da paleta;
- `--shadow-overlay` / `--shadow-popover` — "superfície neutra usa borda" vale
  para o que está NO plano da página; modal e dropdown precisam de elevação, e
  sem token havia sete sombras pretas diferentes;
- `--gradient-brand` — o único gradiente do sistema era regra de texto e virou
  string copiada em cinco lugares.

**Duas correções que se viam na tela**, e eram as que mais saltavam:

1. **Os gráficos falavam outra língua.** A linha de faturamento era **roxa**,
   custo vermelho, lucro verde — e as barras logo abaixo, na mesma tela, eram
   rosé. Faturamento é o dado principal do sistema: passou a ser `--brand`. De
   caminho, os eixos e o tooltip usavam `system-ui`, não a Hanken.
2. **O KPI tinha dois padrões.** Dashboard e Financeiro preenchiam o primeiro
   card em rosé (a regra de hierarquia do DS); Relatórios mostrava seis cards
   iguais. Seis cards iguais não têm hierarquia — o olho não sabe onde pousar.

A cauda de 97 tons com um ou dois usos era quase toda **quase-token**:
`#3a9b6f` ao lado de `--success #3f9b6f`, `#a03358` ao lado de
`--brand-deep #a63a55`. Ninguém escolheu aquilo — é token digitado de memória.
Resolvida por distância de cor, com corte: acima dele a cor é outra coisa e
foi decidida à mão.

Na tipografia, 28 tamanhos em uso para uma escala de 10. Os vizinhos foram
puxados para o degrau (12px e 12.5px não são dois degraus, são dois jeitos de
escrever o mesmo). Os saltos grandes — 18, 20, 24, 26 — ficaram de fora: ali a
diferença é visível, e mudá-los sem olhar seria redesenhar a tela no escuro.

A skill `/lumiere-design` e o CLAUDE.md §13 foram atualizados junto: a regra
mora onde é consultada.

### 2026-09-24 — Varredura de falha silenciosa: 399 pontos, e um defeito no ar

Frente aberta por uma pergunta do Heitor: "toda vez que você mexe, acha
problema — não estou seguro de que o sistema é funcional". A resposta foi
medir, não argumentar.

**O que os defeitos das últimas frentes tinham em comum:** nenhum quebra a
tela. Todos calam. Parser de anúncio que não casava, realtime que não
atualizava, `.eq(coluna, null)` que nunca casa, campo que a tela não oferecia,
`0 || undefined` virando "Indisponível". O sistema não falha alto — ele
devolve vazio e segue.

**A varredura achou 399 pontos** em que o erro do banco era descartado:

| Classe | O que era | Quantos |
|---|---|---|
| Escrita muda | `await admin.from(x).update(…)`, retorno para lugar nenhum | 129 |
| Escrita anulada | erro vira `data = null` | 5 |
| Leitura | falha vira lista vazia — o "zero silencioso" | 265 |

**`lib/db.ts` dá três jeitos de terminar uma consulta, e nenhum é o silêncio:**
`gravar`, `ler` e `tentar`. Escolher obriga a decidir o que fazer quando
falhar; seguir em frente virou escolha escrita, com o motivo ao lado, em vez do
que sobra quando ninguém olhou. Hoje são 106 `gravar`, 262 `ler` e 23
`tentar`.

**O estorno era o pior caso e virou uma transação de verdade.** Eram duas
escritas soltas — a contra-transação e a marca na original — e os indicadores
leem os dois lados: a metade que sobrava fazia o estorno bater duas vezes no
resultado. Agora é a função `estornar_transacao`, que de caminho corrigiu dois
defeitos: a filial da contra-transação vinha do CLIENTE (dava para lançar a
despesa em outra unidade) e estornar duas vezes gerava duas contra-transações.

**O `<Toaster />` não existia.** Quatro componentes chamavam `toast()` — o
editor de automações inclusive — e o sonner só desenha onde o Toaster está
montado. Todos avisavam no vazio.

**E a varredura achou um defeito que estava no ar há meses.** Com as leituras
falhando alto, a suíte E2E derrubou cinco testes de uma vez. A causa:

> `getCachedNetworkCompletedAppointments` filtrava `.eq('tenant_id', …)` em
> `appointments` — **coluna que não existe**. O Postgres respondia 42703 em
> toda chamada, o erro era descartado, e a coluna "última visita" da barra
> lateral de clientes do `/admin` ficava em branco para todo mundo.

Ninguém tinha como desconfiar: cliente sem última visita é exatamente o que se
vê num cliente que nunca veio. É a armadilha nº 1 do CLAUDE.md pela quinta vez
registrada — e a primeira em que alguma coisa a pegou.

**O que a varredura NÃO resolve, e continua valendo:** o sistema segue sem
transação em nenhum outro fluxo. A conclusão de atendimento faz sete gravações
em sequência (status, prontuário, estoque, financeiro, comissão, pacote,
fidelidade) e o CLAUDE.md §10 a descreve como atômica. Agora cada uma falha
alto, mas se a quarta falhar as três primeiras ficam. É a próxima frente.

Sete ocorrências ficaram na varredura, conferidas uma a uma: cinco leituras
dentro de blocos que já tratam a ausência, um `.catch(() => {})` deliberado no
rollback do login, e uma linha de comentário que casa com o padrão.

### 2026-09-24 — Automações: o funil antes da etapa, e o relógio em minutos

Dois pedidos do Heitor sobre as escolhas que o painel oferece.

**Mover de etapa passou a perguntar o funil primeiro.** A lista era única —
"Funil · Etapa" em cada linha —, e ela cresce pelo produto das duas coisas: com
quatro funis de seis etapas são 24 linhas para ler prefixo a prefixo. Agora o
funil é o primeiro campo e a lista de etapas é a dele. **Com um funil só o
seletor não aparece**: seria uma escolha de uma opção.

O funil **não** entrou no grafo como destino. Quem manda continua sendo o
`etapaId` — a etapa já pertence a um funil, e gravar os dois abriria a chance de
discordarem. O campo é derivado da etapa gravada, e só o `funilNome` vai junto
(quando há mais de um funil) para o card do quadro poder dizer "para Pós-venda ·
Retorno" sem consultar nada.

Funil arquivado some da lista, **menos quando é o destino que já está gravado**:
escondê-lo apagaria da tela para onde aquela automação move.

**O gatilho de tempo deixou de ser só "num horário do dia".** Tinha diária,
semanal e mensal; faltava o que a maior parte das automações de acompanhamento
quer — "a cada 30 minutos", "a cada 2 horas". São duas famílias de frequência no
mesmo node: a de intervalo conta **a partir do último disparo** e a de relógio
acontece numa hora marcada. O formulário troca de campo junto com a frequência,
e o que não vale some do grafo: um `hora: '09:00'` esquecido numa automação de
30 em 30 minutos ficaria no JSON parecendo respeitar um horário que ninguém lê.

**O piso é de 5 minutos**, que é de quanto em quanto o cron passa. Aceitar "a
cada 1 minuto" seria prometer um ritmo que o relógio não entrega: sairia de
cinco em cinco do mesmo jeito, sem nada dizendo por quê. O validador recusa
antes de ligar, e o motor trata o valor menor como o piso — grafo salvo por
outro caminho não vira disparo em toda passagem.

A folga de **meio passo do cron** na comparação não é preciosismo: o cron não
cai no minuto exato, e cobrar os 5 minutos cheios reprovaria por dois segundos
um disparo de 9:05:03 contra a marca das 9:00:05 — "a cada 5" viraria 10, e o
atraso somaria a cada volta.

De caminho, um defeito que só doeria agora: a trava de concorrência do cron
comparava `ultimo_disparo_agenda` com `.eq(..., null)` no primeiro disparo de
cada automação. `eq.null` compara **com** NULL e nunca casa, então o UPDATE
passava sem gravar nada e sem erro. Com gatilho diário isso repetia o disparo
dentro da hora de tolerância; com "a cada 5 minutos" repetiria para sempre.
Agora é `.is(..., null)` e a marca **confere quantas linhas mudou** — zero linha
significa que outra passagem chegou primeiro.

Também mudou o nome do node na paleta: **"Pelo relógio"**, não mais "Todo dia,
no horário", que já era impreciso com semanal e mensal.

### 2026-09-24 — O editor de automações no celular

O editor nasceu em três colunas — paleta (190px), quadro e painel (320px). Em
390px de tela isso deixava **cerca de 200px para o quadro**: o fluxo virava um
card cortado ao lado de uma lista de botões, e a barra de ações quebrava em três
linhas, comendo um terço da altura útil. A lista de automações, essa, já estava
bem: cards que quebram sozinhos.

As duas laterais saíram do fluxo e viraram tela cheia, uma por vez — o mesmo
princípio de "uma tela por vez" que injetáveis e a ficha do cliente já seguem:

- a **paleta** vira gaveta, aberta por um "+ Passo" que só existe no celular, e
  fecha ao escolher — deixá-la aberta esconderia o node que acabou de nascer, e
  o toque pareceria não ter feito nada;
- **painel do node, limites, execuções e versões** cobrem a tela (eles têm
  larguras diferentes porque no desktop convivem com o quadro; ali não convivem
  com nada);
- os botões que não são ação principal ficam **só com o ícone**; Salvar e Ligar
  mantêm o rótulo.

**O fluxo passou a abrir pelo gatilho quando o quadro é estreito.** Enquadrar
três passos em 390px daria zoom de 0,45 — ilegível — e, com o piso de zoom, o
que aparecia era o MEIO do fluxo, cortado dos dois lados: a tela abria no lugar
errado e não havia pista de para que lado arrastar. Começando no gatilho, o
caminho é sempre o mesmo: seguir as setas para a direita.

Dois detalhes que só apareceram olhando a tela de verdade (retratos em 390px
pelo próprio Playwright, não por leitura de código):

- o **botão flutuante do app** fica no canto de baixo à ESQUERDA e cobria
  exatamente o começo da última linha do rodapé de problemas — onde o problema
  do fluxo está escrito — e o "Remover do fluxo" do painel;
- tirar a prop `fitView` do React Flow (para o enquadramento pelo gatilho valer)
  **quebrou o desktop**: o `ResizeObserver` ignorava de propósito a primeira
  medida, que era justamente a que a prop cobria, e os cards apareciam
  transbordando por cima da paleta. Agora a primeira medida também enquadra, só
  que sem animação.

De caminho, um teste que falhava por sorteio: `automacoes-ensaio` procurava o
texto `0` no cartão da lista, e o sufixo em base 36 do nome de teste às vezes
tem um zero — duas correspondências, falha sem nada a ver com o produto.

### 2026-09-24 — Automações: o histórico do fluxo

O terceiro item fora de escopo. `automations.versao` existia desde a Fase 1 e só
**contava**: cada salvamento incrementava um número que ninguém conseguia
consultar. O buraco aparece no dia em que alguém mexe num fluxo que estava
funcionando — e "estava funcionando" era justamente o que se perdia.

`automation_versions` guarda nome, grafo e limites a cada salvamento. Os três
juntos porque restaurar só o desenho traria o fluxo certo com a régua de
silêncio de outro dia.

**Voltar para uma versão carrega, não salva.** Ela entra no editor como
rascunho e vira realidade quando a pessoa salvar — a mesma regra do resto do
editor, onde salvar é explícito. Um clique por engano não pode trocar em
silêncio um fluxo que está no ar. E como o salvamento grava um retrato novo, o
histórico é append-only: restaurar gera a versão seguinte, nunca apaga a de
onde se veio.

Guarda os **últimos 30** salvamentos. Um fluxo editado a tarde inteira geraria
dezenas de retratos e ninguém volta trinta salvamentos; isto é configuração, não
registro financeiro nem de prontuário — o que não se apaga é outra coisa.

Gravar a versão **nunca derruba o salvamento**: o grafo já está no banco quando
o retrato é escrito, e perder o que a clínica acabou de montar por causa do
histórico seria a troca errada.

### 2026-09-24 — Automações: renomear sem quebrar, e expressões nos campos

Os dois primeiros itens que tinham ficado fora de escopo, retomados a pedido do
Heitor.

**Renomear um passo agora reescreve quem o citava.** O nome é a chave, então
trocá-lo deixava toda referência apontando para o vazio — e variável sem valor
vira string vazia: a frase sairia pela metade para o cliente. O validador
avisava, mas avisar é o segundo melhor. A troca é por segmento inteiro
(`passos.<chave>.`), nunca por prefixo: renomear "Mandar mensagem" não pode
mexer no que cita "Mandar mensagem 2". E acontece quando o campo perde o foco,
não a cada tecla — renomeando letra a letra o nome passa por "" no meio, e as
referências seriam reescritas para um nome pela metade.

**O campo de condição passou a aceitar expressão.** Isso abre a decisão de
produto original ("condição é construtor, não linguagem"), e a troca foi feita
com ela na mesa: a lista de campos continua sendo o caminho normal da tela, e a
expressão é a saída para o que ela não cobre — o item "outro campo ou
expressão…", conferido enquanto se digita.

O que existe: caminhos, aritmética, comparação, lógica, `??`, ternário e uma
lista fechada de funções em pt-BR (`contem`, `maiusculo`, `tamanho`, `moeda`,
`dias`, `escolher`…). O que não existe, de propósito: atribuição, laço,
definição de função e qualquer forma de alcançar o ambiente.

**Sem `eval` e sem `new Function`** — o ponto que mais importa aqui. O texto vem
do banco e é avaliado no servidor, dentro do motor: ali um `new Function` seria
execução remota de código a um `update` de distância. Daí um analisador próprio
(tokenizador + descendente recursivo, ~380 linhas), com teto de tamanho e de
aninhamento, e `__proto__`/`constructor`/`prototype` fora do alcance da
navegação de caminho — trava que também passou a valer para o `lerCaminho` de
sempre.

**Expressão quebrada devolve vazio em vez de explodir**: parar um fluxo no meio
dos efeitos por causa de um erro de digitação seria pior que uma frase com
buraco. O preço é o erro ficar mudo na execução, então o validador passou a
recusar a ativação — e o painel marca o campo em vermelho enquanto se escreve.

O que tornou tudo isso invisível de quebrar, e por isso está em CLAUDE.md §9.9:
**toda leitura de campo passa por `valorDoCampo` e toda hidratação por
`caminhosDoCampo`**. Ler à mão com `lerCaminho` volta a ignorar expressões, e
`{{maiusculo(cliente.nome)}}` sairia vazio porque ninguém saberia que era
preciso buscar o cliente.

### 2026-09-24 — Automações: as variáveis se propagam de node em node

Relatado montando um fluxo: **o IF não conseguia validar a mensagem recebida**.
E não conseguia mesmo — mas não por falta de motor. `lerCaminho` sempre soube
ler qualquer caminho do contexto, e `evento.dados.texto` sempre esteve lá; a
tela é que oferecia **22 campos fixos**, nenhum vindo do evento que dispara. O
dado estava no contexto e era inalcançável pelo painel.

A segunda falta era irmã da primeira: **a saída de um node morria no passo**.
Cada ação já devolvia um resumo (`{ enviada: true, conversaId }`), que ia para
`automation_run_steps` e parava ali — nenhum node conseguia reagir ao que o
anterior fez.

**O que cada node deixa agora vai para o contexto**, em `passos.<nome do
passo>`. A chave é o NOME, não o id: o caminho aparece dentro do texto de uma
mensagem que alguém relê seis meses depois, e `passos.n_7a3f.enviada` não diz
nada. Todo node nasce nomeado ("Mandar mensagem 2", numerado a partir dos que já
existem) e o nome é editável. É a escolha do n8n, que o Heitor citou como
referência.

**A lista de campos passou a depender de onde o node está.** `variaveisDisponiveis`
junta três fontes: o payload do gatilho, as entidades que o motor hidrata, e o
que cada passo **anterior** deixou — só os anteriores, porque um node do outro
ramo do IF pode não ter rodado, e oferecê-lo seria prometer valor que não chega.
O payload do gatilho é exceção: aparece mesmo com o node ainda solto, já que o
fluxo tem um gatilho só e é no meio da montagem que a lista precisa estar cheia.

**Os campos de cada evento são declarados E descobertos.** `CAMPOS_DO_EVENTO`
(nos types) dá o rótulo em português dos 42 eventos e funciona num banco sem
nenhum fato gravado; `amostraDoEvento` lê o **último fato real** daquele nome e
mostra o que de fato chegou, com um exemplo ao lado. `DadosDeEvento` tem índice
livre — nenhum catálogo cobre tudo, e o exemplo é o que responde "é este campo
mesmo?" sem abrir o banco. Fecha a lista um **"outro campo…"** para o caminho
escrito à mão; continua sendo um caminho, não uma expressão.

Os textos ganharam **"inserir variável"**, que escreve `{{…}}` na posição do
cursor: antes era preciso decorar o caminho, e um `{{cliete.nome}}` com erro de
digitação vira string vazia na mensagem do cliente, sem nada avisar.

**A validação cobre as duas formas novas de quebrar em silêncio**: citar um
passo que não acontece antes, e dois passos com o mesmo nome (a chave seria a
mesma, e o segundo apagaria o que o primeiro deixou).

Dois achados de caminho:

- o `Campo` do painel era um `<p>` sobre o controle — virou `<label>` de
  verdade. Clicar no rótulo foca o campo, e o E2E do quadro **passava pelo
  motivo errado**: ele preenchia "o primeiro input", que depois desta frente
  passou a ser o nome do passo, e o título do aviso (não obrigatório) ficava
  vazio sem ninguém notar;
- no ensaio, a saída de um passo é o que ele *faria* — uma condição sobre
  `passos.x.enviada` dá falso ali, e isso é honesto: nada foi enviado.

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
  filiais" e caixa com abertura/fechamento diário. É o único documento do repo
  que ainda não foi conferido contra o sistema.
- **Prisma está morto — metade resolvida em 2026-09-25.** O CLAUDE.md parou de
  descrevê-lo: a tabela de stack, o exemplo de Server Action, as queries e o
  fluxo de conclusão passaram a mostrar o que o código de fato faz (cliente
  Supabase + `lib/db.ts`). **Falta a outra metade:** `apps/web/lib/prisma.ts`
  re-exporta um client que ninguém importa e o `postinstall` roda
  `prisma generate` para nada. Tirar isso é mexer em código e ficou para
  quando o Heitor decidir.
- **RLS de `integration_configs` decide por nome de cargo**
  (`jwt_claim('role') = 'NETWORK_ADMIN'`), o que o CLAUDE.md §11 proíbe. É a
  última regra por nome de cargo no banco; não é exposição hoje porque o app lê
  pelo cliente de serviço.
- `metrics_core.new_clients` ignora o filtro de filial.
- ~~Hidratação em `/admin/inbox`, chave de lista no estoque, e o
  lançamento que sumia da lista.~~ **Resolvidos em 2026-09-25** — ver a entrada
  da linha do tempo.
- `product_batches` nunca é decrementado.
- Apagar um lead leva junto o histórico dele (`lead_events` em cascata).
- **Não há transação em nenhum fluxo além do estorno.** A conclusão de
  atendimento faz sete gravações em sequência — status, prontuário, estoque,
  financeiro, comissão, pacote, fidelidade — e o CLAUDE.md §10 a descreve como
  atômica. Hoje cada uma falha alto, mas falhar a quarta deixa as três
  primeiras gravadas.
- **O sistema nunca foi usado por uma clínica de verdade.** Nenhuma sessão de
  celular, um navegador logado, clientes demo, nenhum número pareado no
  WhatsApp oficial. Tudo que se sabe vem de testes escritos por quem escreveu o
  código — e teste só prova o que alguém pensou em perguntar.

### Decidido, e registrado para não voltar à discussão

- **Botão de ação tem 38px e seletor tem 34px, e fica assim** (2026-09-25):
  "pode manter, dá um destaque leve, eu gosto". A diferença é hierarquia — a
  ação enfatizada é mais alta que o filtro —, não descuido.

### Próxima frente candidata

**A conclusão de atendimento em uma transação só.** É o que sobrou da varredura
de falha silenciosa: as sete gravações precisam valer juntas. O desenho que
funcionou no estorno serve aqui — o TypeScript calcula (pontos, comissão,
insumos) e uma função do Postgres grava tudo dentro de uma transação, sem
duplicar regra de negócio no banco.

Depois dela, **fidelidade**: hoje só existe saldo read-only no portal do
cliente. Falta configurar regras (`loyalty_configs`), creditar e debitar
pontos, extrato e resgate como desconto no pagamento. O módulo foi removido do
catálogo de permissões em `4511b5c` por não ter gate nenhum — volta quando
existir.

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
