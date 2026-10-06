# DEVLOG — BellarisOS

Registro do desenvolvimento: o que existe hoje, como chegamos aqui e o que está
em aberto. Documento único.

**Última atualização: 2026-10-06.**

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

---

## 2. Estado atual (2026-10-05)

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
  origem de lead. A pessoa (`contacts`) une as conversas das várias caixas.
  O WhatsApp oficial se conecta pelo **cadastro incorporado da Meta** (o app do
  BellarisOS é Tech Provider), em coexistência — o aplicativo do celular segue
  atendendo, e o histórico vem junto — ou Cloud API.
- **Vendas** — "Vender" na ficha e no inbox: **pacote** (conjunto de
  procedimentos por um preço) ou **procedimento pré-pago**; desconto em toda
  venda; à vista, entrada + parcelas ou a receber; agendar usando o que já foi
  pago.
- **Termos e contratos** — modelos com editor rico e variáveis, emitidos pelo
  atendimento e pelo checkout do plano, assinados na clínica, no portal, por
  link ou no papel, com PDF assinado e verificação pública.
- **Estoque** — produtos, lotes, movimentações, transferência entre unidades,
  mínimo por filial, histórico por produto.
- **Financeiro** — receitas e despesas, cada parcela um lançamento no mês do
  seu vencimento, estorno com crédito interno, DRE, indicadores por unidade e
  consolidados.
- **Comissões** — regra por profissional com exceção por procedimento, base
  lida no servidor, por atendimento ou por pagamento, taxa da maquininha e
  insumos configuráveis, fechamento por período que vira despesa.
- **Fidelidade** — programa da rede (nasce desligado): pontos no pagamento,
  desconto em pontos, recompensas e vouchers, validade, bônus de aniversário e
  de primeiro acesso.
- **Relatórios (BI)** — oito abas: visão geral, financeiro, agenda, clientes,
  procedimentos, profissionais, estoque e comercial.
- **Configurações** — unidades, cargos, fichas, documentos, integrações,
  fidelidade, comissões, LGPD e **Eventos** (a corrente de fatos do
  sistema, com o catálogo cruzado com o que já ocorreu na rede).
- **Eventos de domínio** — 47 fatos nomeados pela intenção
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
  us-east-1. **Três apps** desde 2026-10-06: a clínica (`apps/web`), o sistema
  e o suporte (`apps/sistema`, `apps/suporte`, hosts próprios), uma imagem só
  (`BELLARIS_APP`); o que dividem mora em `packages/nucleo`.
- **Sessão só no servidor:** cookies do Supabase httpOnly; o navegador pega só
  o access token, para o Realtime (`/api/auth/token`).
- **Autorização dinâmica:** cargos por rede, 17 módulos com nível
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
- **Testes:** 677 unitários (628 no web + 44 em `utils` + 5 em
  `validators`, Vitest) + specs E2E (Playwright) contra o banco da produção,
  isolados pelo prefixo `[e2e]`. A completa roda à mão no GitHub Actions, em
  duas metades juntas (isolados em paralelo, compartilhados um por vez): a
  última, de 2026-10-05 (run 37361972137), deu 502 verdes e 1 pulado, em
  ~16 min.
- **Cron:** dois serviços na Railway rodam `scripts/cron.mjs` — de hora em hora
  (campanhas, LGPD, CAPI, estoque, fidelidade, PDFs) e a cada 5 minutos (fila
  das automações) —, com nova tentativa em erro da borda.
- **Menu lateral** com categorias que recolhem; modais no `<dialog>` nativo
  (`JanelaModal`).
- **Busca universal na topbar** (`Ctrl/⌘+K`): cliente, conversa,
  oportunidade, agendamento, equipe, catálogo e páginas, sem acento e com o
  mesmo alcance da tela de cada registro (`busca_universal` + a conta do
  inbox).
- **Suporte da plataforma** (app próprio, suporte.bellarisos.com, verificação em duas etapas): fila de
  chamados aberta pela Ajuda da topbar, painel das redes com diagnóstico e
  ações, e **"Entrar como"** o membro (numa aba nova, na clínica, por código de uso único) — só com autorização da clínica, sem
  dado clínico salvo autorização que o inclua, nada saindo para o paciente, e
  tudo registrado "via suporte" e visível à clínica (Configurações → Suporte).
- **Administração do sistema** (app próprio, admin.bellarisos.com, só ADMIN da plataforma): painel do
  negócio (MRR, redes por situação), redes (criar, editar, desligar), planos,
  assinatura e cobrança pelo **Asaas** (webhook + regras de teste e carência),
  equipe da plataforma e auditoria. Rede bloqueada (desligada, suspensa ou
  cancelada) só vê a tela de regularizar.

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

### 2026-10-06 — A plataforma em apps e hosts próprios: `apps/sistema` e `apps/suporte`

O `/sistema` e o `/suporte` saíram do app da clínica e viraram dois apps, cada
um no seu serviço e no seu host (decisão do Heitor): o **sistema**
(admin.bellarisos.com, só ADMIN) e o **suporte** (suporte.bellarisos.com,
SUPORTE e ADMIN). O motivo: na mesma origem da clínica — que desenha conteúdo
de fora —, um script injetado alcançava a sessão de quem enxerga todas as
redes; e o "entrar como" guardava o refresh token do atendente no domínio da
clínica.

- **Os hosts recusam na porta** (`proxyDaPlataforma`, núcleo): nega por
  padrão; sessão de quem não é do host é desfeita ali, e o login de cada app
  diz o motivo (`recusaDoHost`). A clínica, por sua vez, recusa a marca da
  plataforma (proxy, `buildContext`, login, sessão). O primeiro admin
  (`PLATAFORMA_ADMIN_EMAIL`) só é promovido no sistema.
- **O "entrar como" é entre origens**, por um código de uso único (60 s, só
  o SHA-256 no banco — migration `20261006000001`): o painel abre a sessão e
  manda, numa aba nova, um POST com o código à clínica, que o consome e só
  então cria a sessão do membro, com cookie httpOnly NELA. O cookie de volta
  (`bellaris_suporte_volta`) acabou: a sessão do atendente nunca vai à clínica,
  e o "Sair" leva ao painel no host do suporte.
- **Cache entre processos**: cada app tem o seu `unstable_cache`. O que o
  sistema ou o suporte mudam e a CLÍNICA guarda (a situação da rede, a sessão
  de suporte, o membro) — e o atendente, cujo cache mora também no suporte —
  vai por `/api/interno/expirar` (segredo `INTERNO_SECRET`, lista fechada de
  tags). Visto no vermelho: desligar a rede não mandava a equipe à
  `/conta-suspensa` enquanto o cache da clínica não vencia.
- **CSP estrita com nonce** nos dois hosts (`politicaDeConteudo`), `noindex`,
  e lista de IPs opcional (`PLATAFORMA_IPS`).
- **Fato da plataforma não dispara automação** (`gravarEvento`, sem
  despacho), e o reenviar acesso volta pela clínica (`linkDeDefinirSenha`) —
  antes o link sairia com o host de quem clicou.
- **Deploy**: um Dockerfile só, com `BELLARIS_APP` (web | sistema | suporte)
  como build arg; o cron manda `assinaturas` ao sistema (`baseDoJob`). O
  E2E sobe os três builds em hosts próprios (127.0.0.1/.2/.3), e o CI também.
- **Decisões minhas**: reenviar acesso e reativar membro moram só no suporte
  (o sistema manda para lá); a verificação TOTP fica DENTRO do painel de cada
  app; o código vai no corpo de um POST (não na URL).
- TDD: `plataforma-hosts.spec` (o "Painel" que não existia no host do
  sistema), `suporte-entrada.spec` (a rota que ainda respondia 303 do fluxo
  antigo), os unitários de `destino`, `interno`, `porta` e `cron`, e o
  `sistema-redes` desligando a rede — todos vistos vermelhos antes.
- **A verificação independente** (um agente em paralelo, depois das fases)
  achou, e foi corrigido com o teste antes:
  - a `/api/entrar` do suporte não conferia o `Origin`. Os hosts
    `*.bellarisos.com` são o mesmo SITE, então o cookie lax do atendente ia
    junto num POST que partisse da clínica: um script lá abriria sessões em
    outras contas pelo atendente. O vermelho foi um Origin da clínica
    recebendo 200 e o código;
  - o Realtime da fila do suporte nunca autenticava: faltava o
    `/api/auth/token` no app do suporte (404). A rota agora mora no núcleo
    (`rotaDoToken`), e a clínica e o suporte a reexportam;
  - havia redirecionamento aberto no `next` do `/auth/confirm` dos três apps:
    `/\evil.com` e `/<tab>/evil.com` passavam pelo `startsWith`. Agora é
    `caminhoInterno` (`lib/origem`);
  - menores:
    - a página de erro da entrada não mostra mais o erro do Auth;
    - o reset de senha da plataforma usa o host do app (`urlDoHost`);
    - a verificação do sistema pede ADMIN também na action;
    - o `CRON_SECRET` das assinaturas é comparado em tempo constante;
    - o `/api/interno/expirar` dos três apps entrou no `api-sem-credencial`;
    - o `sistema-redes` esquenta o cache antes de desligar (sem isso, passava
      sem provar a expiração entre processos).
  - Não procedia: o `no-referrer` da página do código, que pela especificação
    tiraria o `Origin`. O `next.config` já o trocava por
    `strict-origin-when-cross-origin`. O cabeçalho morto saiu, e o teste trava
    a política.

### 2026-10-06 — `packages/nucleo`: o código que a clínica e a plataforma dividem

Fase 2 da separação da plataforma: antes de nascerem `apps/sistema` e
`apps/suporte`, o que os três apps usam saiu do `apps/web` para
`packages/nucleo`, na MESMA árvore (`src/lib/…`, `src/components/…`), com
`git mv` (o histórico segue). São 32 arquivos: `db`, os clientes do Supabase
e o cookie da sessão, `origem`, `sem-acesso`, `texto`, `query-params`,
`storage`, `notify`/`push`, `redes/*`, `suporte/*`,
`plataforma/{contexto,destino,auditoria}` e três componentes comuns.

- O `apps/web` guarda um shim em cada caminho antigo (`export * from
  '@estetica-os/nucleo/…'`): nenhum dos 160+ imports mudou.
- Dois cortes para o núcleo não puxar o resto do app: o cache da rede saiu do
  `cached-queries` para `lib/redes/cache.ts`, e a assinatura foi dividida em
  LEITURA (`redes/assinatura.ts`, núcleo) e COBRANÇA (`redes/cobranca.ts`,
  que fala com o Asaas e fica fora do núcleo — vai para o `apps/sistema`).
- O `next`, o `react` e o `@supabase/*` do núcleo são a MESMA cópia do
  `apps/web` (conferido pelo caminho real): um `unstable_cache` de outra cópia
  não veria as tags.
- TDD: `tests/nucleo-sem-app.test.ts` (o núcleo existe e não importa de app
  nenhum) nasceu vermelho; o resto é a rede dos testes que já existiam —
  654 unitários e 45 E2E vizinhos no dev, e os da sessão, do quadro, do
  `/sistema`, do Asaas e do "entrar como" contra o build.
- Decisão: um pacote só (em vez de `servidor` + `ui`), porque os arquivos
  movidos se importam entre si e a mesma árvore deixa tudo relativo.

### 2026-10-06 — A sessão só no servidor (cookies httpOnly)

Fase 1 da separação da plataforma, mas vale para a clínica inteira. Os
cookies do Supabase eram legíveis pelo JS da página (o padrão do
`@supabase/ssr`): um script injetado — e a clínica desenha conteúdo de fora,
do WhatsApp ao editor de documentos — levava o refresh token (7 dias,
renovável) e sequestrava a conta da máquina de quem o roubou, mesmo depois da
falha corrigida.

- Todo cookie de sessão passa por `opcoesDoCookieDeSessao`
  (`lib/supabase/cookie-de-sessao.ts`): httpOnly, lax, sem domínio, `secure`
  em produção. Eram cinco lugares escrevendo cada um o seu (e o de
  `lib/supabase/server.ts` dava 7 dias até ao pedaço que vinha vazio para
  apagar).
- O navegador não lê nem renova mais a sessão. O cliente de
  `lib/supabase/client.ts` serve só ao Realtime e pega o ACCESS token em
  `/api/auth/token` (até 1 h, nunca o refresh; 401 sem sessão, 403 de outro
  site), guardado em memória e renovado um minuto antes de vencer
  (`lib/supabase/token-do-navegador.ts`). O Realtime o pede de novo a cada
  heartbeat; os sinos deixaram de chamar `setAuth` à mão.
  - ⚠️ Corrigido no mesmo dia (achado do verificador): com a opção
    `accessToken`, o construtor do supabase-js chama `realtime.setAuth(token)`
    COM o token, e o realtime-js o trata como MANUAL — nunca mais chama a
    função. O canal morria quando o primeiro token vencia (até 1 h), em
    silêncio. O `setAuth` do cliente do navegador agora ignora o argumento
    (`criarClienteDoNavegador`, `tests/realtime-token.test.ts`). Os E2E de
    tempo real não pegam isso: duram menos que um token.
- `/api/auth/session` (hoje só do apoio do E2E) ganhou guarda contra login
  CSRF: só JSON, e nada marcado como vindo de outro site.
- Os aparelhos já instalados ainda guardavam o último refresh token nas
  Preferences: a `NativeShell` apaga a chave antiga na abertura
  (`lib/sessao-antiga-do-aparelho.ts`).
- No E2E contra o build (http em 127.0.0.1) o cookie vai sem `Secure`
  (`COOKIE_DE_SESSAO_SEM_SECURE=1`, só no `playwright.build.config.ts` e no
  workflow): o Playwright não manda cookie Secure por http nos pedidos fora do
  navegador (`page.request`, `chamarAcao`) — eles chegavam sem sessão.
- O app Android deixou de espelhar access e refresh token nas Preferences
  (`capacitor-session-sync.tsx` e `native-store.ts` saíram): a sessão é o
  cookie do WebView, que a `MainActivity` grava em disco ao pausar
  (`CookieManager.flush()`). O "cold start" é a landing perguntando ao
  servidor, depois da hidratação, se há sessão. **Pede build novo do app** —
  quem estiver só com o espelho antigo entra de novo uma vez.
- TDD: `tests/cookie-de-sessao.test.ts`, `tests/token-do-navegador.test.ts` e
  `e2e/sessao-httponly.spec.ts` nasceram vermelhos (o cookie
  `sb-…-auth-token` "legível pelo JS"); o quadro em tempo real e os sinos
  provaram que o Realtime seguiu vivo.

### 2026-10-06 — O CLAUDE.md vira índice; as regras de cada módulo vão para `docs/regras/`

O CLAUDE.md chegou a 165 mil caracteres, e o Claude Code o carrega inteiro em
toda sessão (o aviso de tamanho apareceu). Ficaram nele só as regras do sistema
inteiro: projeto, stack, pastas, multi-tenant e RLS, portais, convenções,
permissões (§11), comandos, o §16 e o "nunca fazer" geral. Ficou com uns 38 mil caracteres.

- O resto foi para `docs/regras/`, um arquivo por área (atendimento,
  crm-inbox, fidelidade, vendas-financeiro, comissoes, documentos,
  whatsapp-push, automacoes, plataforma, busca, design, indicadores, infra,
  e2e). Cada um termina com o "O que nunca fazer aqui" da área.
- **O texto não mudou, só de lugar** — conferido linha a linha contra a
  versão anterior. Os números de seção se mantiveram, e o §9 do CLAUDE.md é
  o índice: arquivo, seções e os GATILHOS (arquivos, tabelas, funções, telas)
  que mandam ler cada um antes de mexer. As citações "CLAUDE.md §9.7" no
  código e nos specs continuam achando a seção por ele.
- `@import` não resolveria: o importado também é carregado no início.
- Regra nova de módulo entra no arquivo da área; no CLAUDE.md, só a que vale
  para o sistema inteiro (§16).

### 2026-10-05 — A completa no GitHub Actions, com as duas metades juntas

O Heitor pediu a completa no CI (a primeira desde o suporte e o `/sistema`, e a
primeira com as metades juntas). Foram várias rodadas até ela ficar de pé. A
maior parte era o TESTE sob carga; duas coisas eram do app, e uma delas era
um defeito de produção:

- **Do app — o Realtime perdia eventos em lote.** O servidor do Realtime guarda
  as claims com os nulos virados TEXTO (`"branch_id": "null"`). Lá dentro,
  `jwt_claim('client_id')` devolvia `'null'`, `eh_da_rede()` dava falso,
  `can_access_branch` fazia `'null'::uuid` e estourava — e o Realtime descarta
  o lote inteiro de mudanças em que isso acontece (centenas de
  `PoolingReplicationError` por hora nos logs, só nas horas em que havia
  membro da rede com tela aberta). Em produção: qualquer tela com tempo real
  podia deixar de atualizar sempre que o admin da clínica estivesse logado.
  No E2E aparecia como o quadro de oportunidades "lento". `jwt_claim` trata o
  texto `'null'` como nulo (migration `20261005000001`); descoberto pelos
  quadros do websocket no trace (inscrição confirmada, evento nunca chegou) e
  pelos logs do Realtime.
- **Do app — `ensurePrivateBucket` listava todos os buckets a cada upload.**
  Uma chamada a mais ao Storage por arquivo, e sob carga era ela que falhava
  ("Não consegui listar os buckets" no meio da assinatura no papel) ou
  demorava (o chamado da Ajuda preso em "Enviando…"). Agora confere uma vez
  por processo (`lib/storage.ts`).
- **O limite do Auth é POR IP e por tipo.** Com as duas metades juntas, o balde
  da verificação de token (magic link) esgotava — e é o mesmo que o app usa no
  "entrar como". Esperar não resolvia (nem ~5 min). Os logins que o apoio CRIA
  (membro, cliente final, atendente) entram por SENHA aleatória posta pela API
  de admin (`sessaoDeTeste`, `e2e/apoio/sessao.ts`), que é outro balde, e
  alternam para o magic link no limite. O admin real segue no magic link. De
  quebra, os tempos caíram: compartilhados de ~20 para ~13–18 min, isolados de
  ~15 para ~5–7 min.
- **Leitura sem a rede filtrada** (configurações, eventos, WhatsApp, a ficha
  mobile): com redes `[e2e]` nascendo ao lado, "a primeira" ou "um cliente
  qualquer" podiam ser de outra rede. Todas filtram por `tenantId()`.
- **Hidratação:** evento ou arquivo entregue antes de o componente hidratar
  some (a Ajuda aberta pelo evento, a foto da ficha). O teste repete até a
  tela responder.
- **Realtime:** a inscrição sobe depois da hidratação; o que mudava antes
  disso não chegava, e os testes chutavam 2,5 s. O `RealtimeRefresher` agora
  desenha um marcador escondido (`data-tempo-real`, `data-estado="ligado"`
  quando o canal confirma), e o teste espera por ele.
- **Relógio:** a sessão de suporte "vencida em agora − 1 s" pelo relógio de
  quem roda ainda não tinha vencido para o banco. Vence com 10 min de folga.
- **Corrida entre as metades:** as duas emitem o link do MESMO admin; o
  `global-setup` tenta de novo. E a sessão do admin é por metade
  (`test.info().project.use.storageState`, nunca caminho fixo).

### 2026-10-03 — Administração do sistema (`/sistema`): redes, planos e cobrança pelo Asaas

O pedido do Heitor: além do suporte, uma central para administrar todos os
clientes do sistema — e criar a equipe de suporte por lá, sem script.
Decisões dele: o primeiro admin por variável no Railway; catálogo de planos
com preço especial por rede; cobrança pelo **Asaas**; em atraso, aviso e
depois suspensão sozinha pela carência (pagou, volta sozinha); suspensa, só a
tela de regularizar; a clínica vê a assinatura em Configurações.

- **Dois portais da plataforma**: o `/suporte` ficou como estava (o
  atendimento); o `/sistema` é a administração, só ADMIN, com seletor entre
  os dois. Equipe e auditoria mudaram do `/suporte` para lá.
- **Primeiro admin sem script**: `PLATAFORMA_ADMIN_EMAIL`. O login promove
  quem tem esse e-mail; sem conta, o "Esqueci minha senha" a cria já marcada.
  Membro de rede com o e-mail não é promovido. O script saiu.
- **Redes**: lista com situação, plano, valor e vencimento; "Nova rede" (o
  login do responsável, a rede pelo MESMO caminho do cadastro público —
  `semearRede` — e o convite por e-mail; a unidade fica para o `/setup`);
  editar os dados; **desligar/religar** à mão (abuso, pedido).
- **O portão da rede bloqueada** (`buildContext`): desligada, suspensa ou
  cancelada → `/conta-suspensa`, para a equipe (página e action) e para o
  paciente no portal. Automações e campanhas pausam; o que chega pelo
  WhatsApp continua gravado.
- **Planos e assinatura**: catálogo (`platform_plans`), o valor retratado
  por rede (preço especial), estender o teste, marcar em dia, cancelar e
  reabrir. Painel com MRR, recebido no mês e as redes que precisam de atenção.
- **Asaas**: cliente (procurado antes de criar) + assinatura mensal em que a
  clínica escolhe Pix, boleto ou cartão; webhook pelo token, gravado pela
  chave do evento e processado depois; a situação é recalculada por estado no
  banco (eventos fora de ordem não estragam). Cron `assinaturas`: teste
  vencido → atraso → suspensa pela carência.
- **A clínica**: Configurações → Assinatura (plano, faturas, "Pagar") e o aviso
  no topo para quem administra a rede (teste acabando; atraso com a data da
  suspensão).
- **O verificador em paralelo achou, e foi corrigido** (migration `000012`):
  - evento atrasado tirava do "em dia" quem já pagou (fatura paga voltava a
    vencida) — agora paga não volta atrás;
  - lembretes, campanhas automáticas e o push ao paciente não pausavam — agora
    pausam (e a campanha agendada espera, em vez de ser dada como concluída);
  - a primeira fatura se perdia (chegava antes do id da assinatura) — achada
    pelo cliente;
  - "marcar em dia"/"estender teste" eram desfeitos pelo próximo evento — o
    atraso até o dia é perdoado;
  - o bloqueio valia só no app — agora também na RLS (`jwt_claim` nulo);
  - o primeiro admin exigia "Confirm email" ligado — agora só e-mail
    confirmado é promovido;
  - e menores: run de automação em espera não se perde, trava contra assinatura
    em dobro, o dia do pagamento no fuso certo, a data do "regularize até", o
    MRR só com cobrança ligada, "já cobrando" ligando o Asaas sozinho,
    contestação registrada, reconciliação diária pelo cron, o cliente do Asaas
    acompanhando a edição dos dados.
- **Prova**: `sistema-portal` (5), `sistema-redes` (5),
  `assinaturas-asaas` (7, contra o build com o Asaas falso),
  `plataforma-primeiro-admin` (2, contra o build) e `tests/sistema-regras.test.ts`;
  77 testes (os novos e os vizinhos de RLS, suporte e automações) contra o build.

### 2026-10-03 — Suporte endurecido: o que as verificações acharam

Cada fase teve um agente verificador em paralelo (pedido do Heitor). O das
fases 1 e 2 achou três defeitos sérios e vários médios; todos corrigidos,
cada um com prova:

- **A migration `20261003000005` no repositório não aplicava** (`$` no lugar
  de `$$` — no banco estava certa). Causa: `String.replace` com `$$` no texto
  de troca vira `$`; os scripts de edição passaram a usar função na troca.
- **Re-autorizar não derrubava a sessão em curso**, que seguia com o retrato
  antigo (inclusive o dado clínico). Agora toda autorização revogada OU
  substituída encerra as sessões dela, por gatilho
  (`trg_autorizacao_revogada_encerra`), e quem mexe na autorização expira o
  cache delas. Desativar o atendente também derruba a dele.
- **O atendente criava um login permanente na rede** (cadastrar membro com
  senha escolhida por ele). Cadastrar membro, mudar cargo e a matriz de um
  cargo passaram a ser recusados no modo suporte — e colher assinatura,
  marcar papel e dispensar documento também (a evidência é imutável e diria
  que foi o membro).
- **"Nada sai para o paciente" não era verdade**: o push do agendamento
  (criar, cancelar, remarcar…) e as automações saíam. Agora `notifyClient`
  não envia numa sessão de suporte e fato gravado nela não dispara automação.
  O teste pegou um segundo furo no meio do caminho: a marca "é suporte" vinha
  do `cache` do React, que NÃO sobrevive numa server action — passou a vir do
  `session_id` do token (`sessaoDeSuporteAtual`).
- **Aparelho de push e sino pelo PostgREST**: as políticas conferem
  `auth.uid()`, então o atendente registrava o FCM dele na conta do membro.
  Restritivas novas em `push_tokens` e `user_notifications`.
- **Custo do `jwt_claim`**: a fase 2 o fez consultar `support_sessions` a cada
  chamada (~140 µs, por linha, em toda política). Agora o estado é lido uma vez
  por transação (GUC local) — 20 mil linhas: 2,8 s → 120 ms (o `auth.jwt()`
  puro dá 35 ms). E o `anon` deixou de receber 42501.
- Menores: telefone pendente na trava de credencial; a sessão que falha ao
  abrir é encerrada (travava novas entradas por 60 min); o "Sair" por link de
  fora não desloga mais um membro comum; o cabeçalho do registro de acesso não
  passa forjado nem no caminho de erro do proxy; o nome de quem manda mensagem
  vem do contexto.

O da fase 3 não achou nada grave; corrigidos: quem autoriza pelo chamado
revoga ali mesmo (a aba de Configurações pede `settings`); tudo o que o
suporte faz no chamado (nota, assumir, situação, abrir) vai para a auditoria;
registro que falha depois da resposta não a duplica; o chamado só é atribuído
por resposta de verdade; o bucket recusa outro tipo e tamanho e gravação que
falha apaga o print; o push da resposta tem texto genérico (tela de bloqueio).

**Prova:** `e2e/suporte-clinico.spec.ts` (3) e `e2e/suporte-credenciais.spec.ts`
(9), que faltavam do plano, e `e2e/chamados.spec.ts` ganhou a ida e volta pelo
chamado e a recusa das actions da plataforma a um membro.

### 2026-10-03 — Chamados: a Ajuda da topbar e a fila do `/suporte` (fase 3 do suporte)

O canal que faltava: a clínica pede ajuda de dentro do sistema e o suporte
responde com tudo à mão.

- **Ajuda na topbar** (ícone de boia, ao lado do sino): meus chamados, novo
  chamado e a conversa, numa `JanelaModal`. O chamado leva onde a pessoa estava
  (a tela, a janela, o navegador) — quem, cargo, unidade e rede vêm da sessão —
  e um print opcional (PNG/JPEG até 5 MB, no bucket privado).
- **"Autorizo o suporte a entrar na minha conta por 72 horas"** no próprio
  chamado: a autorização nasce na mesma transação, ligada a ele. Também dá para
  autorizar e revogar depois, na conversa. Dado clínico só para quem gerencia
  prontuário.
- **`/suporte/chamados`** vira a primeira aba do portal (com o contador dos
  abertos): fila com situação e busca, a conversa com **nota interna** (a
  clínica nunca a recebe), resposta escolhendo a situação seguinte, "Assumir",
  "Pedir autorização" (o suporte nunca se autoriza) e o **"Entrar como"**
  quando quem abriu autorizou — sair volta ao chamado.
- **A resposta chega no sino** de quem abriu, e "Ver a resposta" abre a Ajuda
  já no chamado. A fila se atualiza sozinha pelo sinal `support_signals` (sem
  dado; só a plataforma lê) e por um refresh a cada minuto — no lugar da rota
  `/api/suporte/contagem` do plano.
- **Prova**: `e2e/chamados.spec.ts` (8) — abrir pela tela com print e
  autorização, o colega não lê e quem administra a rede sim, o sinal só para a
  plataforma, nota interna × resposta, sino → conversa sem a nota, pedir
  autorização → a clínica autoriza na conversa, entrar e sair pelo chamado.

### 2026-10-03 — Entrar como o membro, com autorização (fase 2 do suporte)

O coração do pedido do Heitor: o atendente entra na conta do usuário da
clínica para ver o que ele vê e resolver. Decisões dele: **só com
autorização da clínica, temporária**; **prontuário fora** salvo autorização
que o inclua; **nada sai para o paciente** no modo suporte.

- **Por que uma sessão REAL do membro**: a agenda, os cargos e todo o
  Realtime usam o token do usuário (RLS). Trocar só o contexto do servidor
  deixaria metade do app vazia. A sessão é gerada no servidor e ligada à de
  suporte (`support_sessions`, migration `20261003000005`) antes de ir ao
  navegador; o refresh token do atendente fica cifrado no cookie de volta.
- **Como o sistema sabe que é o suporte**: pelo `session_id` do JWT, e não
  por cookie. Servidor: `getTenantContext` monta `ctx.suporte`, troca o nome
  para "Ana (via suporte: Heitor)" — e é esse nome que fica em histórico,
  eventos, mensagens —, rebaixa o prontuário e registra cada tela e action
  (`support_access_log`). Banco: `jwt_claim` nula a rede de sessão de suporte
  que acabou; tabelas clínicas ganham política RESTRICTIVE; gatilhos no `auth`
  travam senha, e-mail e fatores do membro durante a sessão.
- **Decisão minha: o hook de token do Supabase ficou OPCIONAL.** O plano o
  previa como obrigatório, mas ligá-lo exige o painel do Supabase (não tenho o
  token de gerenciamento) e ele vira ponto único de falha do login. Achar a
  sessão pelo `session_id` dá o mesmo resultado sem depender dele. A função
  está pronta e testada; ligá-la só acrescenta a recusa do refresh pelo Auth.
  Também tirei a variável `SUPORTE_COOKIE_KEY` do plano: a chave do cookie de
  volta é derivada (HKDF) da service role, então não há passo no Railway.
- **A clínica no controle**: Configurações → Suporte (autorizar por 24 h,
  72 h ou 7 dias, com ou sem prontuário; revogar; cada sessão com o que foi
  aberto e feito; o que a plataforma fez na rede) e aviso no sino quando o
  suporte entra e sai. Desativar um membro revoga a autorização dele.
- **Achado de passagem — e corrigido**: `dispatchCampaignInline` era
  exportado de um arquivo `'use server'` sem conferir ninguém: qualquer pessoa
  disparava notificação para os clientes de qualquer rede. Foi para
  `lib/notifications/disparo-de-campanha.ts`.
- **Também**: o `setAll` do proxy dava validade de 7 dias até ao pedaço de
  cookie que vinha para ser apagado (sessão trocada); agora apaga.
- **Prova**: `e2e/suporte-impersonar.spec.ts` (10): sem autorização e com ela
  vencida não entra; entra com o aviso fixo e a clínica avisada; "via suporte"
  no histórico, no evento e no registro de acesso; prontuário fora na tela e
  pelo PostgREST com o token capturado (com o controle do próprio membro);
  envio ao paciente recusado; senha não muda pelo Auth com o token (e muda,
  como controle, depois); o atendente não abre `/suporte` de dentro da conta;
  "Sair", revogar e vencer derrubam a sessão — o token capturado deixa de
  alcançar a rede e o refresh deixa de valer; apagar cookie não tira o aviso.
  Vizinhos (RLS, portais, credenciais, permissões, envio, campanhas,
  documentos, tempo real): verdes.

### 2026-10-03 — Portal da plataforma `/suporte` (fase 1 do suporte)

O pedido do Heitor: dar suporte de verdade às clínicas que assinam, com o
atendente podendo "entrar como" o usuário. O plano tem quatro fases
(0: correções; 1: a base da plataforma; 2: autorização e impersonificação;
3: chamados). Esta é a 1: a equipe do BellarisOS passa a existir no sistema.

- **Quem é da plataforma não é membro de rede**: login com a marca
  `app_metadata.plataforma` + `platform_staff` (migration `20261003000003`).
  Portal próprio, `/suporte`, com **verificação em duas etapas obrigatória**
  (TOTP do Supabase; cadastro do autenticador no primeiro acesso).
- **Os lados não se misturam**: o proxy desvia, `buildContext` recusa a marca
  antes de tratar o login como cliente final (sem `role`, viraria CLIENT), e os
  três destinos de login mandam o atendente para a verificação.
- **O painel**: lista das redes (agregada no banco, `suporte_resumo_redes`;
  as `[e2e]` escondidas), o detalhe de cada uma — equipe com último uso (das
  sessões do Auth, não de `last_sign_in_at`), unidades, plano —, e o
  diagnóstico (caixas e integrações SEM segredo, eventos sem `dados`,
  automações que falharam, LGPD por situação).
- **Ações sem entrar na conta**: reenviar acesso, reativar membro (miolo em
  `lib/equipe/ativacao.ts`), e — só admin — plano/trial, equipe da plataforma
  (cadastrar, desativar, redefinir a verificação) e auditoria.
- **Tudo vai para `platform_audit_log`** (só acrescenta), inclusive abrir o
  painel de uma rede (uma vez a cada meia hora por pessoa).
- **Primeiro admin**: `apps/web/scripts/plataforma-primeiro-admin.mjs <email> "<Nome>"`
  — imprime o link de definir senha. É passo do Heitor.
- **Prova**: `e2e/suporte-plataforma.spec.ts` (7) — o TOTP é calculado no
  teste (`e2e/apoio/totp.ts`, conferido contra os vetores da RFC). A varredura
  de sobras passou a apagar atendentes `[e2e]`.

### 2026-10-03 — Dado clínico só com prontuário; credencial fora da tela (fase 0 do suporte)

Achados ao desenhar o suporte com impersonificação (o plano tem quatro
fases; esta é a 0, correções que valem sozinhas). Corrigidos **para todos**,
por decisão do Heitor — não só para o modo suporte.

- **Dado clínico vazava por telas de outros módulos:** a evolução do
  atendimento saía com `agenda`; exame, laudo, foto clínica, receita e termo
  anexados ao cliente, com `clients`; a anotação do profissional no plano e a
  anamnese no arquivo do tratamento, com `agenda`. Agora tudo isso passa por
  `podeVerClinico(ctx)` (`lib/auth.ts`), e concluir o atendimento e salvar a
  evolução pedem `medical_records: MANAGE` — gravam prontuário. A recepção
  sem prontuário deixa de ver e anexar laudo.
- **A aba de integrações mandava o token das caixas ao navegador** (as de
  credencial colada à mão; o cadastro incorporado já era limpo) e o token de
  cada página do Messenger. Agora o segredo vira um marcador, e salvar com ele
  mantém o do banco (`lib/integracoes/sem-segredo.ts`).
- **A política de `treatment_plans` nunca casava** (comparava o
  `tenant_id` do topo do JWT) e negava tudo. A primeira correção
  (`20261003000002`) a fez casar — e com isso ABRIU a tabela: qualquer
  funcionário da unidade lia, alterava e apagava plano pelo PostgREST, e o
  Realtime entregava a linha inteira, com a anotação clínica, a quem não tem
  prontuário. O verificador da fase pegou; `20261003000004` fechou de vez:
  `treatment_plans` sem política (o app só lê pelo servidor), sessões do
  plano só LEITURA (eram `FOR ALL` sem WITH CHECK), e as assinaturas de
  Realtime de `treatment_plans` (que nunca entregaram nada) saíram das telas.
- **Também da verificação:** o checkout do plano mostrava a anotação a quem só
  recebe; a lixeira do anexo sumia com a linha mesmo quando a action recusava;
  o escopo OWN do prontuário não valia nos planos; a tela do atendimento
  oferecia "Finalizar" e a evolução editável a quem não tem prontuário; o
  `proxyUrl` da uazapi (usuário e senha) não estava na lista de segredos.
  Todos corrigidos.
- **Prova:** `e2e/clinico-so-com-prontuario.spec.ts`, 5 testes. Pela tela e
  pela action direta, com o admin como controle (inclusive na exclusão), e o
  token das páginas do Messenger fora do payload. Vizinhos verdes.
  `finishSession`, `saveDraftNotes` e o upload recebem FormData — o
  `chamarAcao` não monta multipart, então a recusa direta desses três fica
  provada só pelo código.

### 2026-10-03 — Busca universal na topbar

Pedido do Heitor: na barra superior, em todas as páginas, uma busca única,
"um atalho universal para tudo". Decisões dele: campo fixo na topbar com o
painel de resultados logo abaixo (no celular, a lupa abre a busca em tela
cheia embaixo da topbar); acha páginas, clientes, conversas, oportunidades,
agendamentos, equipe, procedimentos, pacotes e produtos; **só acha** — as
ações ficam para uma fase 2.

- **A regra que importa: a busca não abre exceção de alcance.** O navegador
  manda só o termo e o slug do portal; `buscarTudo` decide os tipos pelo cargo
  (o módulo da tela de cada um), o dono pelo "só os meus" do CRM e da agenda e
  a unidade pela abrangência. As conversas passam pela MESMA conta do inbox
  (`idsDaPaginaDoInbox`, extraída de `getConversations`), com dono, modo e
  caixas do cargo.
- **No banco**, `busca_universal` (migration `20261003000001`, só
  `service_role`): sem acento (extensão `unaccent`, `private.sem_acento`),
  todas as palavras em qualquer ordem ("prado juliana" acha "Juliana Prado"),
  telefone e CPF por dígitos com ou sem máscara. Procedimento respeita a
  disponibilidade por unidade; oportunidade de funil arquivado fica de fora.
- **O inbox ganhou de brinde** a busca sem acento e o telefone por dígitos
  (`inbox_pagina`), e a guarda do navegador passou a comparar igual
  (`conversaCasaComBusca`) — senão a tela escondia o que o banco achava.
- **Páginas** vêm do menu e das abas de Configurações, que saíram da tela para
  `lib/configuracoes/abas.ts` (uma lista só, lida pelas duas), com apelidos:
  "negócio" acha Oportunidades, "usuário" acha Equipe.
- **Destinos por URL**, que não existiam: `?lead=` abre o card no quadro de
  oportunidades (e o mesmo card de novo, se pedido outra vez); `?q=` nasce a
  lista filtrada em equipe, procedimentos, pacotes e estoque, nos dois portais.
  De passagem, a equipe da rede deixou de levar o termo cru ao `.or()` do
  PostgREST.
- Teclado: `Ctrl/⌘+K` e `/` focam, setas escolhem, Enter abre, Esc limpa e
  fecha; combobox/listbox para leitor de tela.
- **Prova**: `e2e/busca-universal.spec.ts` (7 testes, rede `[e2e]` própria):
  sem acento e fora de ordem, páginas por apelido, conversa e oportunidade
  abrindo no lugar certo, o mesmo card reaberto, a busca do inbox sem acento,
  o SDR com CRM OWN sem a oportunidade e sem a conversa de outro dono, a agenda
  OWN só com os próprios horários, a sobreposição do celular dentro da tela, e
  o cliente final recusado — as recusas pela action direta, com o admin como
  controle. Mais os unitários de `tests/busca-universal.test.ts` (catálogo de
  páginas, tipos por cargo, destinos, textos, a guarda do inbox).
- Um verificador em paralelo auditou a entrega contra o plano e achou sete
  ajustes (a guarda do inbox no navegador, a disponibilidade do procedimento,
  o card que não reabria, recusa provada só em negativo, acessibilidade do
  painel); todos feitos antes do commit.

### 2026-09-30 — WhatsApp pelo cadastro incorporado da Meta (Tech Provider)

O app do BellarisOS virou Tech Provider na Meta, e o Heitor trouxe o link do
cadastro incorporado (Embedded Signup). Ele parecia já existir no sistema — o
SDK da Meta já carregava em toda página e a escolha coexistência × Cloud API já
estava na tela —, mas conferido: nada chamava `FB.login`, a caixa oficial era
credencial colada à mão, e a volta do link caía no callback de anúncios, que
não o entende. Construído:

- **"Conectar pela Meta"** em Configurações → WhatsApp → Oficial: a janela da
  Meta sobre o BellarisOS (`FB.login` com o `config_id` em
  `META_ES_CONFIG_ID`), e a escolha da tela vira o `featureType`. As
  credenciais manuais descem para "avançado" (clínica com app próprio).
- **O servidor confere tudo** (`lib/whatsapp/cadastro-incorporado.ts`): troca
  o código pelo token de negócio, confere com ele que o número é da conta,
  grava a caixa inativa, inscreve o webhook da conta, registra o número com PIN
  (Cloud API) ou pede contatos e histórico (coexistência), e ativa. Número de
  outra rede é recusado.
- **Webhooks da coexistência** (`lib/whatsapp/coexistencia.ts`): a mensagem
  mandada pelo celular entra como saída; o histórico (até 180 dias) entra
  IMPORTADO e lido, sem reordenar a conversa nem disparar automação
  (`messages.importada` + gatilho `on_new_message`, migration
  `20260930000025`); a agenda do aparelho dá nome a quem não tem.
- A caixa do cadastro não manda o token à tela, e o formulário manual só a liga
  e desliga (gravar por cima apagaria o token).
- **Prova**: `e2e/whatsapp-cadastro-incorporado.spec.ts` (6 testes, Meta
  falsa em porta fixa — `META_GRAPH_BASE_TESTE`, só contra o build), mais
  `api-sem-credencial`, `mensagens-saida` e `mensagens-meta`: 26/26.
- **Não provado**: a janela da Meta de verdade. A primeira conexão real tem de
  ser feita pelo Heitor, com um número.

### 2026-09-30 — Categorias do menu lateral recolhem

O menu tinha crescido a ponto de rolar (seis categorias, até 19 itens na
rede). Pedido do Heitor: cada categoria recolhe e expande pelo título.
- `SecaoDoMenu` (`components/shared/secao-do-menu.tsx`), nos menus da rede e
  da unidade. O título continua lendo como overline, com uma seta que gira.
- **Nasce aberta**: o menu não esconde nada sem ninguém pedir.
- **Fechada, a página em que se está continua à mostra**: fechar a categoria
  da tela aberta não a some do menu, e quem navega para uma tela de categoria
  fechada a vê marcada.
- Lembra por navegador (`localStorage`, como o "Recolher" da barra).
- Com a barra recolhida em ícones, não recolhe: ali cada ícone precisa estar
  à mão, e o título já vira filete.
- No celular, abrir ou fechar a categoria não fecha a barra (o clique no
  `<nav>` fechava).
- Prova: `e2e/menu-lateral.spec.ts`.

### 2026-09-30 — Dívidas técnicas do dia

- **Modais.** Os 27 modais feitos de `div` fixo com `z-index` (pagamento e
  finalização do atendimento, cancelamento, recebimento do plano, agendamento
  do inbox, respostas rápidas, template, equipe, unidade, ficha e sessões do
  tratamento, checkout, planejamento, construtor de ficha, notificações…)
  passaram para `<JanelaModal>` (`components/shared/janela-modal.tsx`), o
  `<dialog>` nativo: acima da topbar, cabe na tela, corpo rolando, folha de
  baixo no celular, Esc fecha. O checkout e os formulários longos não fecham
  com clique no fundo; os que gravam ficam `travado` enquanto gravam. Os 7
  `position: fixed; inset: 0` que sobraram são o fundo invisível de menus.
  A impressão do termo de dentro do checkout solta a altura da janela.
- **Ficha do cliente**: o "x/y parcelas" (de `installments`) virou "Vence
  dd/mm" do próprio lançamento. `installments` só leitura (a política antiga
  citava uma coluna que não existe) — migration `20260930000024`.
- **Cron**: `scripts/cron.mjs` repete (15 s, 30 s) quando a chamada não chegou
  ao app — rede, 502/503/504, 404 "Application not found" da borda. Tempo
  esgotado não repete.
- **O cron de produção e o banco do E2E.** Investigado job a job: todos passam
  pelo `[e2e]`, mas as filas reivindicam a linha e os testes conferem o
  estado final. A única janela real era o `lgpd-exports`, que pegava pedido
  recém-criado — disputando com o `after()` da própria solicitação e com o
  pedido que o `lgpd-exportacao` deixa aberto entre dois testes. Agora ele só
  recolhe o que está parado há 15 min (o teste do cron cria o pedido "velho").
- **E2E**: a varredura de sobras só leva `[e2e]` com mais de uma hora; as duas
  metades rodam JUNTAS no CI, contra um servidor só, cada uma com o seu
  arquivo de sessão. De brinde, uma rodada local durante o CI não derruba mais
  o CI.

### 2026-09-30 — Cada parcela é um lançamento no financeiro

O Heitor notou que um pagamento parcelado aparecia no dia da venda com o valor
total. Conferido: o saldo virava UM lançamento (o total, com o vencimento da
1ª parcela); as parcelas moravam em `installments`, que nenhuma tela lia; o
"Pagar" quitava o saldo de uma vez (as parcelas ficavam em aberto para
sempre); e a lista e o "a receber" contavam tudo no mês da venda — e o saldo
sumia do "a receber" no mês seguinte, ainda em aberto.

- **Cada parcela é um lançamento**, com o vencimento dela e "— parcela 2/3"
  na descrição; a entrada, "— entrada" (colunas `parcela_numero`,
  `parcela_total`, `parcela_grupo`). Pagar, estornar, comissão (proporcional),
  fidelidade e métricas passam a valer por parcela sem código novo.
- **Uma divisão só** (`dividirEmParcelas`) para pacote, pré-pago, checkout e
  recebimento do plano e despesa parcelada: centavos, sobra na última, e o dia
  31 vira o último dia dos meses curtos. O checkout do plano não jogava a sobra
  na última (3 × 66,67 = 200,01 para 200).
- **`data_de_referencia`** (coluna gerada): pago no dia do pagamento, em
  aberto no vencimento. A lista do financeiro (unidade e rede) recorta por ela
  e mostra "Vence dd/mm" no que está em aberto; o "a receber" do período conta
  por ela; o gráfico de evolução passou a usar o dia do pagamento (usava a
  criação). O saldo zerado do check-in saiu da lista.
- O card "Parcelas a receber" dos relatórios lê os lançamentos (lia
  `installments`, e mostrava parcela já quitada ou estornada).
- A taxa da maquininha na comissão vem de `parcela_total` do lançamento.
- Os 2 parcelamentos em aberto no banco foram convertidos (um deles com o
  centavo a mais do arredondamento antigo, corrigido na última parcela).

Migration `20260930000023`. **Prova:** `financeiro-parcelas` (a entrada no
mês, cada parcela no seu mês com o vencimento, "Pagar" quitando só uma; a
despesa parcelada pela tela) e os vizinhos atualizados (checkout de plano,
recebimento do plano, pacotes e pré-pago — com a comissão liberando parcela a
parcela), mais 41 do financeiro, comissões, fidelidade e indicadores.
Unitários da divisão.

### 2026-09-30 — Suíte completa em duas metades (isolados em paralelo)

O Heitor perguntou por que a suíte demora (~25 min no CI, 107 arquivos, 421
testes). O maior fator era rodar um teste por vez (`workers: 1`), necessário
porque a suíte usa o banco da produção e metade dos specs mexe na rede real.

- `e2e/grupos.ts`: os 31 specs ISOLADOS (rede própria, sem rede real, sem a
  sessão padrão, sem cron) — 140 testes, ~630 s somados — rodam com 3
  workers; os 76 COMPARTILHADOS (~860 s) seguem um por vez, depois.
- Em sequência, no mesmo job: a varredura de sobras (global-setup) apaga todo
  [e2e], e rodando juntas uma metade apagaria os dados da outra. (Desde o
  mesmo dia, mais tarde, a varredura só leva sobra de mais de uma hora e as
  metades rodam JUNTAS — ver "Dívidas técnicas do dia".)
- `tests/e2e-grupos.test.ts` confere que cada isolado continua cumprindo as
  regras; cada metade guarda as falhas na sua pasta de `test-results`.
- Medido no CI (4 rodadas): isolados 2–4 min, compartilhados 9–14 min (varia
  com o banco e a rede) — 13 a 18 min de testes contra ~25. Primeira rodada
  verde de ponta a ponta: 421/421 (run 36759341259). Em paralelo apareceram duas coisas, corrigidas: o Auth
  do Supabase limita a verificação de token por origem, e ~40 sessões de
  membro em 2 min estouravam ("Request rate limit reached") — a abertura de
  sessão do apoio espera e tenta de novo nesse erro; e um teste conferia um
  evento emitido depois da resposta sem esperar.
- Estimativa inicial: ~25 → ~18 min. Próximos passos para encurtar mais: migrar
  compartilhados para rede própria, e (mudando a varredura para só apagar
  sobras antigas) rodar as duas metades ao mesmo tempo.

### 2026-09-30 — Sessão de pacote pelo núcleo; conflito com dois agendamentos

O Heitor perguntou se a sessão de pacote não conferia conflito, já que a tela
só mostra os horários livres. Conferido: a tela esconde o horário ocupado,
mas olha só o INÍCIO da sessão nova — 60 min às 10:00 passava por cima de
outro agendamento às 10:30 — e o servidor não conferia nada (duas recepções
ao mesmo tempo, ou a action chamada direto, encavalavam).

- `schedulePackageSession` passa pelo `createAppointmentCore` com a sessão
  como crédito: sobreposição com a duração, histórico, evento e quem agendou.
  As recusas próprias da sessão (já agendada, outro procedimento, cliente do
  pacote) seguem com as mesmas mensagens. Pacote vencido passa a ser recusado.
- **Defeito achado pelo teste**, no núcleo: a conferência de conflito usava
  `.maybeSingle()`, e um horário que encostava em DOIS agendamentos dava
  "Não consegui buscar o agendamento" em vez de "já tem agendamento nesse
  horário" — na agenda, no inbox e no portal. Agora é `.limit(1)`.
- Apoio do E2E: o `limpar()` do membro solta `appointments.created_by_id`
  antes de apagá-lo (sem isso a rede [e2e] ficava no banco).

**Prova:** `agendar-com-credito` ganhou o caso (encavalado recusado, livre
agendado com preço da sessão, quem agendou e linha do tempo). Vizinhos (26):
pacotes, agenda, agendamento da rede, CRM, portal, abrangência.

### 2026-09-30 — Agendar usando o que já foi pago (fase 3 de "Vender")

Fecha a frente "Vender". O que o cliente já pagou — unidade de procedimento
pré-pago ou sessão de pacote — vira o **crédito** do agendamento.

- **Pelo núcleo**: `createAppointmentCore` aceita `credito`
  (`lib/creditos/credito.ts`): confere que é do cliente, da rede, livre e na
  validade; o procedimento e o preço vêm dele (procedimento diferente é
  recusado); liga por compare-and-swap e desfaz o agendamento se outro pegou o
  mesmo crédito. Conflito de horário, histórico e evento como qualquer
  agendamento.
- **Onde**: "Agendar" em cada unidade do card "Procedimentos pagos" (o mesmo
  seletor de horário das sessões de pacote, agora exportado); campo "Já pago"
  no modal da agenda e no do inbox; "Agendar agora" depois de vender um
  procedimento, para quem tem agenda.
- `schedulePackageSession` passou pelo núcleo logo depois (entrada acima).

**Prova:** `agendar-com-credito` (4: pela ficha, "Agendar agora", pela agenda,
pelo inbox com pacote e pré-pago e as recusas — usado, alheio, outro
procedimento). Vizinhos (47): agenda, agendamento da rede, CRM, abrangência,
pacote-agendar, portal, pré-pago, pacotes, permissões.

### 2026-09-30 — Procedimento pré-pago e o "Vender" único (fase 2 de "Vender")

O cliente compra N unidades de UM procedimento, paga (ou fica a receber) e
agenda depois. Separado do pacote, como o Heitor pediu.

- **Banco** (migration `20260930000022`): `procedure_sales` (retrato da venda,
  validade opcional) e `procedure_sale_units` (uma por unidade, com a parte
  do preço e o agendamento); `procedimento_vender` e
  `procedimento_cancelar_unidade` numa transação cada; o dinheiro e a linha de
  comissão ganham `procedure_sale_id`.
- **No atendimento**: a conclusão usa a unidade e liga a comissão (origem
  `PRE_PAGO`, proporcional ao recebido); a recepção recusa cobrar de novo;
  falta ou cancelamento do agendamento devolvem a unidade (gatilho).
- **Cancelar a unidade**: reduz o a receber que sobrou e registra a devolução
  do que foi pago a mais (despesa "Devolução" a pagar).
- **"Vender" único** na ficha e no inbox (`components/shared/vender.tsx`):
  Procedimento | Pacote. Com ou sem ficha no inbox, como antes.
- **Ficha**: card "Procedimentos pagos" com as unidades e o cancelar com
  motivo. **Portal**: o que ainda há para agendar. **LGPD**: seção própria.
- **Fidelidade por procedimento** passou a valer para pré-pago e pacote
  (cumulativa pelo pago, como o plano). O pacote dava zero ponto nesse modo.

**Prova:** `pre-pago` (8 casos: venda pela ficha com desconto e parcelas, a
unidade no atendimento com a comissão proporcional e a recusa da recepção,
falta devolvendo a unidade, cancelar pela ficha reduzindo o a receber,
devolução do que foi pago e recusa com agendamento, permissões e RLS,
fidelidade, procedimento de outra rede). Vizinhos (58): pacotes, desconto,
conclusão, fechamento, comissões, fidelidade, portal, pacote-agendar,
permissões, LGPD, inbox. Telas por captura.

A fase 3 (agendar usando o que já foi pago) está logo acima.

### 2026-09-30 — Desconto em todas as vendas (fase 1 de "Vender")

Decisões do Heitor: pacote e procedimento pré-pago são coisas SEPARADAS (o
procedimento pré-pago ganha estrutura própria, não reaproveita o pacote); toda
venda aceita desconto, sem teto; cliente que falta pode remarcar ou cancelar, e
cancelar registra a devolução; validade do pré-pago é opcional. Três fases:
**1. desconto** (esta), 2. procedimento pré-pago + "Vender" único, 3. agendar
usando o que já foi pago.

- **Um cálculo**: `lib/vendas/desconto.ts` (R$ ou %, em centavos; rateio pelo
  maior resto) e um campo, `CampoDoDesconto`, nos quatro lugares.
- **Pacote**: preço vendido = catálogo − desconto (`client_packages.preco_tabela`,
  `desconto`); sessões e pagamento sobre o vendido. `pacote_vender` ganhou
  `p_desconto` (com padrão: a chamada de antes segue valendo).
- **Plano**: `plano_aplicar_desconto` rateia o desconto nos procedimentos do
  plano no checkout, antes do dinheiro; o de antes fica em `preco_tabela`.
- **Recepção**: `sale_discount` no lançamento do avulso; a comissão
  percentual sai sobre o vendido.
- **Contrato**: o desconto entra no retrato do pagamento; trocá-lo depois de
  assinar é recusado no checkout como trocar a forma. Variáveis
  `pagamento.subtotal` e `pagamento.desconto`.
- **Conserto no caminho**: a fidelidade do plano lia `treatment_plan_items`,
  tabela legada — no modo "por procedimento" os planos de verdade davam ZERO
  ponto. Passou a ler os procedimentos das sessões (o mesmo total da comissão).

Migration `20260930000021`. **Prova:** `vendas-desconto` (6 casos: pacote pela
tela, recusas, plano rateado com fidelidade, recusas do rateio e de outra rede,
recepção pela tela com a comissão, recusas da função). Unitários
(`vendas-desconto.test.ts`). Vizinhos (35): pacotes, checkout de plano (com o
desconto fora do contrato assinado recusado), fidelidade (ganho, pontos,
vouchers), contrato com pagamento, fechamento e comissões. Telas conferidas por
captura no desktop e no celular.

### 2026-09-30 — "Vender pacote" na conversa de quem ainda não é cliente

A pedido do Heitor, o botão aparece no inbox mesmo sem ficha. Clicar abre o
cadastro (com o aviso "Para vender o pacote, primeiro o cadastro") e, ao
salvar, a venda abre sozinha para o cliente recém-criado. Se a unidade
escolhida no cadastro não tiver pacote à venda, a tela avisa em vez de abrir.
Sem ficha e numa rede com várias unidades, `vendaDePacote` vem sem unidade: é
só o sinal de que a rede tem o que vender.

**O modal de cadastro do inbox** era um `div` fixo com `z-index`: a topbar
cobria o cabeçalho e o formulário saía da tela. Virou o `<dialog>` nativo dos
outros modais (`JanelaDeCadastro`). Conferido por captura no desktop (acima da
topbar, cabe na tela, o corpo rola) e no celular (folha de baixo).

**Prova:** o caso da conversa em `pacotes-venda` agora cadastra pela tela e
vende (o pacote de R$ 800 no cliente novo). A limpeza apaga o cliente e o login
que a tela criou.

### 2026-09-30 — "Vender pacote" no cabeçalho da ficha e na conversa

A pedido do Heitor:
- **Na ficha do cliente**, o botão saiu de baixo do card de tratamento e foi
  para o cabeçalho, à esquerda do "+ Agendar".
- **No inbox**, o painel da direita ganhou "Vender pacote" ao lado de "Ver
  cliente", quando a conversa tem cliente ligado. `getConversationCard`
  devolve `vendaDePacote`: a unidade da venda (a de quem atende, senão a do
  cliente, senão a única da rede) e os pacotes à venda nela. Sem permissão de
  receber, sem unidade ou sem pacote, o botão não aparece.
- O apoio do E2E (`criarOutraRede`) passa a apagar o funil, as etapas e o
  sinal do quadro. Abrir o inbox cria o funil padrão, e o gatilho do quadro
  recusava a cascata da rede: a rede `[e2e]` ficava no banco.

**Prova:** `pacotes-venda` ganhou o caso da conversa (com cliente, o botão
abre a venda; sem cliente, só "Cadastrar cliente"). Seis testes passam e o
banco termina sem sobra.

### 2026-09-30 — "A receber" com vencimento opcional

A pedido do Heitor: na forma "A receber", a data deixou de ser obrigatória, e
o campo começa vazio e marcado "(opcional)".

- Vale nos dois lugares que usam os mesmos campos: a venda de pacote e o
  pagamento do contrato do procedimento.
- **Sem data:**
  - a venda lança o valor a receber sem vencimento;
  - o contrato diz "R$ X a receber" sem o dia, e
    `pagamento.primeiro_vencimento` fica vazio (não é variável obrigatória).
- Entrada + parcelas continua exigindo a data da primeira parcela.

**Prova:** unitários das frases e dos lançamentos sem data; E2E da venda "a
receber" sem data pela tela, mais o contrato com pagamento e o checkout de
plano.

### 2026-09-30 — Pacote é um conjunto de procedimentos

A pedido do Heitor: um pacote tem vários procedimentos, iguais ou não ("5
limpezas + 3 drenagens"). Antes era um procedimento × N sessões.

- **Itens** (`service_package_items`): procedimento + quantidade. O editor do
  catálogo tem "Adicionar procedimento" e mostra quanto as sessões custariam
  avulsas, como referência para o preço. Pacote e itens se gravam juntos
  (`pacote_salvar`).
- **Cada sessão vendida guarda o seu procedimento e a sua parte do preço**,
  rateada pelo preço de tabela. Exemplo: R$ 800 com 2× A (R$ 300) + 2× B
  (R$ 100) dá sessões de 300, 300, 100 e 100. `pacote_vender` confere que as
  sessões batem com os itens e que a soma fecha. É a base da comissão da
  sessão.
- **Agendar a sessão** usa o procedimento, a parte do preço e a duração dela:
  o servidor recusa outro procedimento. O modal mostra o procedimento de cada
  sessão e a composição no cabeçalho.
- Os pacotes de antes viraram um item só, e as sessões deles ganharam o
  procedimento. A parte do preço fica vazia e cai na conta antiga (preço ÷
  sessões).

Migration `20260930000020`.

**Prova:**
- `pacotes-venda`, reescrito para um pacote misto:
  - o editor com dois procedimentos;
  - as quatro sessões com procedimento e parte do preço;
  - a comissão de 30 × a proporção recebida;
  - a recusa de sessões que não batem e de agendar a sessão de B como A.
- Unitários do rateio.
- Vizinhos (31 testes): pacote, conclusão, comissões, portal e permissões.

### 2026-09-30 — Menu: Vendas e Marketing separados, Pacotes com entrada própria

A pedido do Heitor:
- "Vendas e marketing" virou duas categorias:
  - **Vendas:** Inbox, Oportunidades, Procedimentos e Pacotes;
  - **Marketing:** Notificações, Marketing e Templates.
- **Procedimentos** saiu de Gestão.
- **Pacotes** ganhou tela própria (`/admin/pacotes` e `/[slug]/pacotes`, ícone
  de ingresso) e saiu do card em Procedimentos. Na unidade, a tela é só
  consulta.
- A tela de cargos agrupa os módulos igual ao menu: `crm` e `procedures` em
  Vendas, `marketing` em Marketing.
- O `portais-isolamento` passou a conferir que o cliente final não abre
  `/[slug]/pacotes` nem `/[slug]/financeiro/comissoes`. Esta última faltava
  desde a fase 3 das comissões.

**Prova:** unitário do menu (a divisão, nos dois portais) e E2E de pacotes,
portais e permissões verdes.

### 2026-09-30 — Pacotes: catálogo e venda

Antes, pacote só existia no banco de demonstração: nenhuma tela criava nem
vendia, e a sessão de pacote era "paga na venda" de uma venda que o sistema não
registrava. Decisão do Heitor: construir o catálogo e a venda, com o pagamento
do plano.

- **Catálogo em Procedimentos** (card "Pacotes", da rede): procedimento,
  sessões, preço e validade.
- **Venda na ficha do cliente**, para quem recebe dinheiro: à vista, entrada +
  parcelas ou a receber. `pacote_vender` grava numa transação:
  - o pacote com o RETRATO do preço, das sessões e da validade;
  - todas as sessões;
  - o dinheiro ligado ao pacote (`client_package_id`), com o recebido agora e
    o a receber em lançamentos separados.
- **Comissão** da sessão de pacote no modo "quando o cliente paga": liberada na
  proporção do que o pacote recebeu, como o plano. A base é o preço da venda
  ÷ sessões.
- **Furo fechado:** qualquer funcionário criava `client_packages` (sessões de
  graça) e mexia no catálogo pela chave pública. A sessão agora só lê.
- **Campos de pagamento compartilhados:** `CamposDoPagamento` saiu do
  "Definir pagamento" do contrato e serve aos dois.

Migration `20260930000019`.

**Prova:**
- `e2e/pacotes-venda.spec.ts`, 4 casos:
  - catálogo pela tela, e quem só vê é recusado;
  - venda com entrada + parcelas: 4 sessões e o dinheiro 100 pago e 300 em
    3 parcelas;
  - comissão: 25% recebido libera 2,50, a baixa do saldo completa 10, e o
    estorno da entrada volta a 7,50;
  - recusas: soma que não fecha, forma inválida, quem não recebe, e o
    PostgREST.
- Unitários dos lançamentos.
- Vizinhos verdes (55 testes): contrato com pagamento, conclusão, comissões,
  pacote, permissões, RLS, portal do cliente e LGPD.
- A limpeza do E2E passou a apagar as sessões do pacote pelo pacote.

### 2026-09-30 — Comissões: eventos e estorno do fechamento

O que ficou de fora das três fases, a pedido do Heitor.

**Eventos:**
- `comissao.liberada` sai do banco quando um pagamento libera comissão: o
  recebimento do plano, ou o avulso no modo "quando o cliente paga";
- `comissao.paga` sai do fechamento;
- `comissao.gerada` passa a ter chave por linha (por procedimento). Com a
  chave por atendimento, a sessão de plano perdia os eventos do segundo
  procedimento em diante — defeito da fase 2.
- O catálogo foi de 42 para 44 eventos.

**Estorno do fechamento** (decisão do Heitor: volta para "a pagar"):
- botão "Estornar" com motivo na lista de fechamentos (`financial: MANAGE`);
- a função estorna a despesa (contra-lançamento) e devolve os lançamentos
  daquele fechamento a "a pagar";
- um gatilho recusa estornar essa despesa pelo financeiro comum, que deixaria
  a comissão "paga" com o dinheiro de volta.

Migrations `20260930000017` (eventos) e `…18` (estorno).

**Prova:**
- `comissoes-fechamento`: o estorno pela tela, a recusa por fora e o evento
  `comissao.paga`;
- `comissoes-calculo`: `comissao.liberada` e um `comissao.gerada` por
  procedimento. O teste esperava os fatos antes de a action emiti-los, e agora
  espera com `poll`.

### 2026-09-30 — Comissões, fase 3 (de 3): fechamento e quem vê o quê

**Financeiro → Comissões**, nos dois portais (`/admin/financeiro/comissoes`,
`/[slug]/financeiro/comissoes`, o link fica no cabeçalho do financeiro):
- os períodos são os da configuração (mensal, quinzenal ou semanal, no fuso);
- por profissional e unidade: o que foi lançado, o que foi pago e o que está a
  pagar, agregado no banco (`comissoes_resumo`);
- o extrato de cada um (procedimento, cliente, base, regra, motivo) e a
  exportação em CSV;
- os últimos fechamentos.

**"Fechar e pagar"** (`comissao_fechar`, uma transação):
- reivindica o que está a pagar até o fim do período;
- cria o fechamento e uma **despesa paga** ("Comissões", na unidade, com a
  forma escolhida) e marca os lançamentos como pagos;
- dois cliques fecham uma vez;
- fechamento não se reabre: o estorno que chegar depois fica negativo para o
  próximo, e saldo negativo não fecha.

**Quem vê quanto cada um ganha:**
- **Financeiro com escopo de todos.** Com "só os meus", a pessoa vê "Minhas
  comissões" e não fecha. O financeiro da rede, que mandava essa pessoa para
  um "perfil" que não existia, agora a leva para lá.
- **Vazamentos fechados:** o ranking de comissão do dashboard estava sob
  `team`, e a comissão na aba Profissionais dos relatórios sob `reports`. Os
  dois mostravam a de todos a quem não via o financeiro; agora o dado nem sai
  do servidor.
- **O ranking ordena pela comissão** (`metrics_ranking_comissao`). Antes era o
  top 5 por atendimentos, reordenado, e quem mais ganhou podia nem aparecer.

**Métricas pelo lançamento.** O período de uma comissão passa a ser o
`released_at` em todas as `metrics_*`. O cenário de indicadores ganhou dois
lançamentos que mostram a troca: um ajuste de março lançado em abril fica
fora, e o acerto de um atendimento de fevereiro lançado em março entra. Os
valores mudaram, à mão: aberto 25, ranking 35.

**Limpeza:** `loyalty_configs.commission_base` saiu do banco (o código no ar já
não a lia).

**Migrations:** `20260930000014` (a coluna da fidelidade), `…15` (fechamento e
leituras da tela) e `…16` (métricas; o bloco de `metrics_relatorio` é trocado
por texto conferido — a migration falha se o trecho não estiver lá).

**Prova:**
- `e2e/comissoes-fechamento.spec.ts`, 4 casos:
  - fechar pela tela gera a despesa e marca pago;
  - estorno depois do fechamento, saldo negativo recusado, e dois cliques
    concorrentes que fecham uma vez;
  - quem vê só as próprias: redirecionada, só a própria linha, action recusada;
  - dashboard e relatórios sem a comissão para quem só vê a equipe, com o
    financeiro como controle.
- Unitários dos períodos.
- Vizinhos (66 testes): indicadores, coerência dos relatórios, financeiro,
  portais, permissões e os specs de comissão.

### 2026-09-30 — Comissões, fase 2 (de 3): o cálculo e o extrato

**O que muda:** a comissão deixa de ser um número gravado uma vez e passa a
ser uma **linha por procedimento executado** (`commission_lines`), com um
**extrato** (`commissions`) de lançamentos que acertam a linha até o que ela
deve.

**O acerto (`private.comissao_acertar_linha`):**
- calcula quanto a linha deve agora (`comissao_alvo`) e lança a diferença:
  LIBERACAO, AJUSTE ou ESTORNO, com motivo e a transação que causou;
- a conclusão chama o acerto, e o gatilho `trg_comissoes_do_pagamento` também,
  em pagamento, recebimento do plano e estorno;
- chamar duas vezes não lança duas: é trava por linha, com a diferença contra o
  já lançado.

**A conta mora no banco, numa cópia só.** O recebimento do plano entra por
gatilho, e receita paga nasce em vários lugares. O app só escolhe a regra e lê
a base (`linhasDoAtendimento`).

**Regras, como o Heitor decidiu na fase 1:**
- **Base:**
  - avulso: o preço;
  - sessão de plano: cada procedimento com o seu preço no plano e a sua regra.
    Antes, a regra do primeiro procedimento valia sobre a sessão inteira;
  - sessão de pacote: preço ÷ sessões, lido no servidor. Antes vinha do preço
    que o navegador mandou.
- **Descontos**, só no percentual: taxa do recebimento (no plano, ponderada
  pelo que cada recebimento pagou) e insumos (custo dos movimentos, rateado
  pelo preço). Pontos e voucher reduzem o valor fixo na proporção, como já
  era.
- **Modo "no atendimento":** a comissão é devida na conclusão. O pagamento
  acerta a taxa e a base com pontos, e o estorno zera.
- **Modo "quando o cliente paga":**
  - no avulso, só vale depois de pago;
  - no plano, é liberada na proporção do que ele recebeu, e cada recebimento
    seguinte completa;
  - no pacote, é liberada na conclusão (o pacote é pago na venda, e o sistema
    não registra essa venda).
- **Configuração retratada na linha:** mudar a configuração não reescreve o
  que já foi concluído.
- **Concluído não se cancela nem vira falta.** Um gatilho no banco e a action
  recusam; o que se desfaz é o pagamento.
- `confirmar_pagamento_do_atendimento` não mexe mais em comissão, e
  `loyalty_configs.commission_base` ficou sem leitor.

**Migrations:**
- `20260930000011`: tabela, extrato, funções, gatilhos, a nova
  `concluir_atendimento` (ainda aceita o `comissao` singular do código de
  antes do deploy) e o pagamento sem o bloco de comissão. As 21 comissões de
  demonstração viraram linha + lançamento.
- `20260930000012`: o valor fixo com pontos.

**Prova:**
- `e2e/comissoes-calculo.spec.ts`, 5 casos:
  - no atendimento, com a taxa como ajuste e o estorno;
  - quando paga, com taxa e insumos;
  - a configuração retratada na linha;
  - plano pela tela: 25% recebido libera 25%, a parcela completa e o estorno
    volta;
  - pacote pela tela: R$ 300 ÷ 3.
- Os specs de conclusão e de fidelidade no pagamento passaram a concluir pela
  função, como o app faz.
- Vizinhos verdes (38 testes): fechamento, fidelidade, vouchers, estorno,
  checkout e recebimento do plano, pacote, agenda.

### 2026-09-30 — Comissões, fase 1 (de 3): configuração e regras

**Por que:** a comissão nascia de `commission_rules`, mas nenhuma tela criava
regra (só o seed e os testes), nada era pago (tudo `OPEN`), a base de plano e
pacote era frágil (o preço do pacote vinha do navegador), o estorno não mexia
na comissão, e a sessão de QUALQUER funcionário gravava `commission_rules` pelo
PostgREST. Plano aprovado pelo Heitor em três fases:

1. **Configuração e regras** (esta entrega).
2. **Cálculo novo**: linhas e extrato (`commission_lines`), base de plano e
   pacote no servidor, desconto de insumos e taxa, os dois modos, liberação
   proporcional do plano (gatilho no pagamento), estorno e o bloqueio de
   cancelar atendimento concluído.
3. **Fechamento e visibilidade**: `commission_payouts`, Financeiro → Comissões
   (extrato, fechar e pagar → despesa, CSV), o profissional vê as dele, e os
   vazamentos do dashboard e dos relatórios.

**Decisões do Heitor:**
- A regra é do profissional (padrão), com exceção por procedimento.
- Quando e sobre o quê é configurável pela rede: no atendimento, sobre o preço;
  ou quando o cliente paga, sobre o recebido.
- Os descontos da base (insumos, taxa da maquininha) são configuráveis, e a
  tabela de taxas entrou agora.
- No plano, a base é o preço de cada procedimento. No pacote, preço ÷ sessões.
  No modo "quando paga", o plano libera na proporção do que já recebeu.
- O pagamento ao profissional é um fechamento por período configurável
  (mensal, quinzenal ou semanal).

**O que entrou:**
- Migrations `20260930000008..10`:
  - `commission_configs` (uma por rede) e `payment_fees`.
  - `commission_rules` reformada: `tenant_id`, `professional_id` uuid → users,
    sem unidade obrigatória, um padrão e uma exceção por procedimento (índice
    único), valor validado.
  - As funções `comissao_regras_definir` e `comissao_taxas_definir`
    (service_role).
  - RLS de só leitura, e as políticas de INSERT/UPDATE abertas saíram.
  - `updated_by` nulo quando o membro sai; a regra sai com o profissional, o
    procedimento ou a rede.
- **Configurações → Comissões** (`financial: MANAGE`, só no portal da rede):
  como a comissão acontece, o que sai da base, a base com pontos (saiu da aba
  Fidelidade), o período do fechamento e a tabela de taxas. A aba também avisa
  quem atende sem comissão padrão.
- **Equipe**: o chip "Comissão 30% · 1 exceção" (ou "Sem comissão", amarelo
  para quem atende) abre o diálogo do padrão e das exceções. Só aparece com
  `financial: MANAGE`. Quem gere a equipe sem o financeiro não vê quanto cada
  um ganha.
- `finishSession` lê as regras novas (`regraAplicavel`). **O resto do cálculo
  ainda é o antigo** até a fase 2: modo e descontos ficam gravados, mas ainda
  não mudam o valor. Por isso esta fase fica na `main` local e **sobe junto com
  a fase 2**.

**Prova:**
- `e2e/comissoes-configuracao.spec.ts`, 6 casos:
  - config e taxas pela tela, conferidas no banco;
  - padrão + exceção pela Equipe;
  - percentual acima de 100 recusado;
  - quem só vê o financeiro não vê o chip, e as três actions recusam;
  - profissional e procedimento de outra rede recusados;
  - a sessão não grava regra, configuração, taxa nem chama a função pelo
    PostgREST.
- Unitários em `tests/comissoes-config.test.ts`.
- Vizinhos verdes: `atendimento-fechamento` (exceção vence o padrão), a
  fidelidade no pagamento, `configuracoes-geral` e `permissoes-acoes`.

### 2026-09-30 — O pagamento no contrato do procedimento

**O que muda:** as variáveis de pagamento (forma, meio, entrada, parcelas,
valor da parcela, primeiro vencimento) passam a valer também no contrato do
procedimento — antes, só no contrato de plano. Como no atendimento avulso o
pagamento só é recebido depois, a recepção o DEFINE antes de colher a
assinatura (decisão do Heitor): "Definir pagamento" na ficha e no painel da
sessão, com o mesmo vocabulário do fechamento do plano (no atendimento, à
vista, entrada + parcelas, a receber). Enquanto não define, o contrato mostra
"Falta definir o pagamento" e não se assina nem sai por link; trocar é
possível até a assinatura. Na hora de receber, o meio combinado já vem
escolhido (a recepção pode trocar).

- Nova variável `pagamento.metodo` (o meio por extenso), nos dois contratos.
- `definirPagamentoDoContrato` (`documents: MANAGE`): só contrato do
  procedimento, e só antes de assinado; o servidor confere a forma e monta o
  contrato de novo com ela.
- Prova: `e2e/documentos-contrato-pagamento.spec.ts` (4 casos: sem pagamento
  fica INCOMPLETO e não sai por link; define entrada + parcelas pela ficha e o
  texto cita o combinado; troca e o recebimento vem com o meio; o servidor
  recusa pagamento torto, termo e contrato fechado). Vizinhos (plano,
  atendimento, fechamento, fidelidade no pagamento, modelos, editor) verdes.

### 2026-09-30 — Editor rico de documentos, fase 2: a tela de edição

**O que muda:** em Configurações → Documentos, o termo e o contrato se
escrevem num editor de texto de verdade, numa folha com as medidas do
documento: estilo (normal, títulos 1–3), 12 fontes, tamanho, negrito, itálico,
sublinhado, tachado, cor do texto, realce, alinhamento (4), entrelinhas,
listas, tabela (linhas/colunas/cabeçalho), imagem (logo, com tamanho e
alinhamento), divisória, quebra de página, "Inserir variável" (chip) e o lugar
da assinatura. Abas Corpo · Cabeçalho · Rodapé, e a prévia com dados de
exemplo é o documento de verdade. Modelo antigo (marcação) abre convertido;
salvar abre uma versão nova no formato novo.

- `components/admin/editor-rico/` (Tiptap 3: extensões próprias para
  variável, assinatura, quebra, imagem e entrelinhas; barra com
  `useEditorState`). `salvarModeloDoEditor` recebe o JSON e passa pelo
  conversor; `enviarImagemDoModelo` guarda a imagem pelo hash do conteúdo.
- Dois achados de tela, registrados no CLAUDE.md: o JSON do ProseMirror (attrs
  sem protótipo) precisa ir à action como cópia pura; e o foco tem de voltar
  ao texto na hora, senão o que se digita depois de escolher numa lista vai
  para a lista.
- Prova: `e2e/documentos-modelos.spec.ts` reescrito (escreve, formata, fonte,
  variável, tabela, imagem, cabeçalho, prévia, v2 sem mexer na v1; o servidor
  recusa variável fora do tipo, nó estranho e imagem de outra rede) e o novo
  `e2e/documentos-editor-rico.spec.ts` (modelo rico → emitido → aberto SEM
  sessão com logo e fontes → assinado → PDF com as fontes embutidas e o logo).
  Telas conferidas no desktop e em 390px. Documentos inteiros verdes (43).

### 2026-09-30 — Editor rico de documentos, fase 1: a árvore, as fontes e o PDF

**Por quê:** a marcação leve (`#`, `**`, `{{…}}`) era boa, mas pouca gente na
clínica entende markdown. O Heitor pediu um editor de texto de verdade, "bem
completo": 12 fontes (as do Office pelas equivalentes livres + modernas),
tamanho, negrito, itálico, sublinhado, tachado, cor, realce, alinhamento,
entrelinhas, listas, tabelas, imagens (logo), cabeçalho e rodapé, quebra de
página. Plano em duas fases; esta é a de baixo — nada muda na tela de edição
ainda.

- **Árvore v2** (`lib/documentos/arvore.ts`): o que se assina continua sendo
  uma árvore própria, fechada; o editor (Tiptap, fase 2) só a escreve, pelo
  conversor (`editor/converter.ts`), que recusa o que não conhece e normaliza o
  que vem colado do Word.
- **A marcação antiga continua valendo** por conversão
  (`editor/da-marcacao.ts`): o contrato de plano semeado e todos os E2E que
  criam modelo por `p_texto` passam pelo caminho novo sem mudar.
- **Migration `20260930000007`**: `document_template_versions.body_doc` (o JSON
  do editor), `documento_modelo_salvar` com `p_documento` (default, compatível
  com o código no ar) e o CHECK "marcação OU JSON".
- **Fontes**: 48 TTF (12 × 4 estilos, ~13 MB, licenças livres junto) em
  `public/fontes-documento/`, por `scripts/baixar-fontes.mjs`; `@font-face` na
  tela, `@pdf-lib/fontkit` no PDF (sem subset). **Achado:** o TTF que a API do
  Google serve para Arimo, Carlito e Cousine quebra o fontkit ("beyond buffer
  length") — as três vêm do repositório (a Arimo estática, de um commit antigo).
  Um teste embute e desenha os 48.
- **PDF**: motor novo (`pdf/diagramacao.ts`) — quebra com estilos misturados,
  justificado, listas aninhadas, tabelas (linha maior que a página é dividida
  sem perder conteúdo), imagens conferidas pelo sha256, cabeçalho/rodapé em
  toda página (ou no fluxo, se não couberem). A página de evidências passou
  para a Arimo: nome com acento ou símbolo sai como é.
- **Tela**: `DocumentoRenderizado` desenha uma "folha" com medidas em pontos,
  como o PDF (no celular, com piso de legibilidade).
- O proxy deixa `.ttf` passar: a página pública do link carrega as fontes sem
  sessão.
- Prova: `tests/documentos-arvore.test.ts` e `tests/documentos-pdf.test.ts`
  (19 casos); PDF de amostra conferido página a página; E2E de verificação,
  atendimento, portal, link e checkout verdes (28).

### 2026-09-30 — Termos e contratos: o link pela conversa do inbox (a "6b")

**O que muda:** a rede escolhe, em Configurações → Documentos, se a equipe
pode mandar o link de assinatura pela conversa do cliente no inbox ("Só pelo
aparelho" × "Também pela conversa"; decisão do Heitor: configurável, e nasce
desligado). Ligado, a ficha ganha "Enviar pela conversa": o link sai pelo
WhatsApp da clínica, na conversa em que o cliente falou por último, pelo número
DELA, com o nome de quem mandou — e aparece no inbox como qualquer resposta.

- Migration `20260930000006`: `tenants.documentos_link_pela_conversa`.
- `enviarLinkPelaConversa` (`documents: MANAGE`) usa `enviarNaConversa`, o
  mesmo caminho do inbox e das automações, com `pelaCaixaDaConversa`. Janela
  de 24h fechada (API oficial): não sai, e o link gerado volta para copiar.
  Sem conversa: recusa antes de gerar. Registra `LINK_ENVIADO_CONVERSA` na
  trilha do documento (entra na página de evidências) e emite
  `conversa.mensagem_enviada`.
- Mudar a opção pede `forms: MANAGE` e abrangência de rede; a unidade vê.
- Prova: `e2e/documentos-link-conversa.spec.ts` (5 casos, caixa uazapi falsa
  e uma oficial de janela fechada). Vizinhos (link público, modelos,
  atendimento) verdes.

### 2026-09-30 — Termos e contratos, fase 6: o link público de assinatura

**O que muda:** na ficha, "Enviar link" gera um link de uso único, válido por
7 dias, com "Copiar link" e "Abrir no WhatsApp" (mensagem pronta, genérica, no
`wa.me` com o telefone do cadastro). O cliente abre sem conta, confirma o CPF
(ou a data de nascimento, se o cadastro não tem CPF) e assina na mesma tela do
portal. Antes da identidade a página mostra só a clínica e "um documento". A
ficha mostra "link enviado · vale até…" e "Revogar link".

- Migration `20260930000005`: `document_sign_links` (só o SHA-256 do token;
  um ativo por documento) e `document_link_attempts`, as duas sem política;
  `documento_link_criar` (gerar revoga o anterior; token nulo só revoga),
  `documento_link_espiar`, `documento_link_abrir` (CPF/nascimento, 5 erros
  revogam, 20 por IP na hora bloqueiam) e `documento_assinar` passando a
  conferir e consumir o link.
- `lib/documentos/link.ts` e `link-publico.ts`; rotas `/api/assinar/abrir` e
  `/api/assinar/assinar`; página `/assinar/[token]` (pública no proxy,
  `noindex`, `no-referrer`).
- **Achado no caminho:** `ipEAparelho` lia o primeiro do `x-forwarded-for`,
  que o cliente escreve como quiser — furava o limite por IP e deixava o IP da
  evidência forjável. Passou a ler o `X-Real-IP`, que a borda do Railway
  escreve.
- O cron `documentos-pdf` apaga as tentativas com mais de 30 dias.
- Prova: `e2e/documentos-link-publico.spec.ts` (9 casos, sem sessão: o hash no
  banco e o WhatsApp; CPF errado conta e o certo assina e consome o link; 5
  erros revogam; vencido, inexistente e revogado; token de um com hash de
  outro; nascimento; sem CPF nem nascimento; limite por IP; quem só vê não
  gera nem revoga; a sessão de um membro não lê os links). `api-sem-credencial`
  ganhou as duas rotas. Telas conferidas em 390px. Vizinhos (fases 2, 4 e 5)
  verdes.

### 2026-09-30 — Termos e contratos, fase 5: o portal do cliente

**O que muda:** o cliente assina pelo celular. Na ficha, "Pedir no portal"
coloca o documento no portal dele e manda um push ("A Unidade X pediu a sua
assinatura em um documento" — nada do título, que pode dizer o procedimento).
No portal: um cartão "N documentos para assinar" na home, a lista em
Documentos, e a mesma tela de assinatura, já no modo do cliente. Quem agenda
pelo portal um procedimento que pede termo vai direto para ele. O cliente
também baixa o PDF dos que assinou.

- `actions/documentos-portal.ts` (`assinarNoPortal`: identidade = a sessão do
  cliente, canal PORTAL; só documento DELE) e `pedirAssinaturaNoPortal` na
  equipe (recusa cliente sem conta no portal e documento com dado faltando).
- `/api/documentos/[id]/pdf` atende o cliente, só no documento dele.
- O comum aos canais saiu de `actions/documentos.ts` para
  `lib/documentos/assinar.ts`.
- Prova: `e2e/documentos-portal.spec.ts` (4 casos: o pedido e o aviso
  genérico; o cliente na home → lista → assina → baixa o PDF; o documento de
  outro cliente não abre, não assina, não baixa, e a tela da equipe não é
  dele; cliente sem portal). Telas conferidas em 390px. Vizinhos (portal,
  portais-isolamento, ficha, fases 2 e 4, API sem credencial) verdes.
- Não testado de ponta a ponta: o desvio para os documentos depois de agendar
  pelo portal (o agendamento pelo portal depende de horário livre real);
  a action devolve a contagem e o wizard navega, conferido no código.

### 2026-09-30 — Termos e contratos, fase 4: o PDF assinado e a verificação pública

**O que muda:** todo documento assinado ganha um PDF final — o documento, a
assinatura, um rodapé "Assinado eletronicamente · Código XXXX" em toda página e
uma **página de evidências** (assinante com CPF mascarado, canal, identidade,
quem conduziu, horário em Brasília e UTC, IP, aparelho, SHA-256 do conteúdo,
código, QR e a trilha). A ficha tem o botão "PDF", e qualquer pessoa confere a
autenticidade em `/verificar`, pelo código, sem conta — inclusive escolhendo o
arquivo recebido, que é conferido no próprio aparelho.

- Migration `20260930000004`: `documento_registrar_pdf` (uma vez só),
  `documentos_pdf_reivindicar` (fila do cron, `skip locked`, 5 tentativas) e
  código de verificação para os 6 do legado.
- `lib/documentos/pdf.ts` com `pdf-lib` + `qrcode` (dependências novas); o
  PDF enviado pela clínica é carimbado como está. Gerado em `after()` depois da
  assinatura; cron `documentos-pdf` no Notification Cron.
- Páginas públicas `/verificar` e `/verificar/[código]` (declaradas no proxy),
  `noindex`, sem CPF, nome completo, IP nem conteúdo — só as iniciais.
- `/api/documentos/[id]/pdf`: sessão + `documents: VIEW` + rede + unidade.
- Export da LGPD: os termos e contratos saem da parte clínica para a geral
  (com as evidências do titular), e os PDFs assinados vão no pacote.
- Achados na limpeza dos testes: o PDF assinado não era apagado com o
  documento, e o spec da fase 1 deixava o membro (autor dos modelos, via
  `created_by`) e a rede para trás.
- Prova: `e2e/documentos-verificacao.spec.ts` (4 casos: o PDF aparece sozinho
  e o hash gravado é o do arquivo; a rota do PDF com e sem o módulo; a página
  sem sessão, sem CPF nem nome, conferindo o arquivo certo e o alterado; código
  torto e inexistente), `api-sem-credencial` com o cron e a rota novos. Conferi
  o PDF gerado página a página.

### 2026-09-30 — Termos e contratos, fase 3: o checkout do plano

**O que muda no dia da clínica:** o fechamento do plano passou a ser Plano →
**Pagamento → Documentação** → Agendamento. Os dois termos fixos de antes
("Termo de Anamnese" e "Contrato") saíram: o cliente assina o termo de cada
procedimento do plano (dois procedimentos com o mesmo termo, um termo só) e o
**contrato de plano da rede**, que agora cita a forma de pagamento escolhida.
A assinatura acontece dentro do próprio checkout (tela ou papel), sem sair
dele.

- Migration `20260930000003`: `documentos_emitir_do_plano` (idempotente;
  cancela o que deixou de valer se o plano mudou), `documentos_pendentes_do_plano`,
  `documento_substituir`, `documento_registrar_texto` (o texto + o retrato do
  pagamento), o gatilho `trg_documentos_bloqueiam_plano` e
  `documentos_modelos_padrao` — o contrato de plano padrão, com o texto de
  antes em variáveis e a forma de pagamento, semeado em toda rede.
- **Trava no servidor antes do dinheiro**: `checkoutTreatmentPlan` recusa com
  documento que bloqueia aberto, ou com o contrato assinado para OUTRO
  pagamento. Trocar o pagamento depois de assinar substitui o contrato (o
  antigo fica, com a assinatura, como prova).
- **Legado**: os 6 termos assinados de `consent_terms` viraram documentos
  emitidos (LEGADO), com a assinatura desenhada preservada. O histórico da
  ficha e o do portal leem um lugar só. `consent_terms` ficou só de leitura
  na prática (nada novo é gravado; a política de RLS não mudou).
- Saíram de `actions/treatment-plans.ts`: `createCheckoutConsentTerms`,
  `signConsentTerm`, `marcarTermoAssinadoEmPapel`, `emitirTermoAssinado` e
  `termoDoTenant`. O pagamento do plano foi para `lib/checkout/pagamento.ts`.
- Achado no caminho: voltando de uma assinatura, a lista do checkout mostrava
  o estado de antes por um instante e deixava abrir de novo o documento já
  assinado — os botões ficam travados enquanto ela recarrega.
- Implantação: a migration entrou antes do código, e o contrato de plano
  padrão ficou DESATIVADO até o deploy (o checkout antigo, em produção, não
  sabia colhê-lo e o gatilho travaria o fechamento).
- Prova: `e2e/checkout-de-plano.spec.ts` reescrito numa rede `[e2e]` (4 casos:
  a tela inteira com três documentos no papel e o dinheiro conferido; chamar
  direto sem assinar não lança nada, nem pelo banco; trocar o pagamento
  substitui o contrato e o antigo é recusado; outra rede). 6 unitários do
  pagamento. Vizinhos (planejamentos, abrangência, plano a receber, portal,
  prontuário, ficha, fidelidade, relatórios, LGPD, RLS, ações entre redes)
  verdes.

### 2026-09-30 — Termos e contratos, fase 2: emissão pelo atendimento, assinatura na clínica e no papel

**O que muda no dia da clínica:** um procedimento com termo ou contrato ligado
passa a gerar o documento sozinho — ao agendar ou no check-in, conforme o
modelo. Se o modelo BLOQUEIA, o atendimento não começa sem a assinatura. A
recepção colhe pela ficha do cliente (aba Documentos, seção "Termos e
contratos") ou pelo painel da sessão: confere a identidade, entrega o aparelho
e o cliente lê, marca "li e concordo" e assina com o dedo. Ou imprime e
registra que foi assinado no papel, com a digitalização opcional.

- Migration `20260930000002`: `issued_documents` (retrato do modelo, texto
  canônico, hash, código de verificação), `document_signatures` (evidência:
  canal, identidade, IP, aparelho, hash exibido, quem conduziu — imutável),
  `issued_document_events` (trilha). Gatilhos no agendamento para emitir,
  cancelar e BLOQUEAR o início; `documento_assinar`, `documento_dispensar`,
  `documento_registrar_render`, só do service_role. Evento novo
  `termo.emitido` (do banco); `termo.assinado` vale para os novos.
- Texto montado no app com os dados de agora (CPF com máscara, data por
  extenso, endereço em linha); dado obrigatório faltando deixa o documento
  INCOMPLETO, com "Gerar de novo" depois de completar o cadastro.
- Tela `/[slug|admin]/documentos/[id]/assinar` (equipe → cliente → pronto, ou
  papel); PDF enviado desenhado com `pdfjs-dist` (o WebView do Android não
  abre PDF em iframe). `voltar` só aceita caminho interno.
- Achados no caminho: o `startAppointment` descartava o `{ error }` na tela
  da sessão (o botão só voltava ao normal) — agora mostra o motivo; e o
  `.btn-primary` não tinha estado desabilitado em lugar nenhum do sistema.
- ⚠️ Armadilha registrada no CLAUDE.md: o React memoriza `fetch` GET idênticos
  numa renderização, e a releitura do documento depois de montá-lo devolvia a
  resposta velha (tela de assinar vazia). `abortSignal` desliga.
- Prova: `e2e/documentos-atendimento.spec.ts` (7 casos: emissão e bloqueio
  pelas duas portas, INCOMPLETO → gerar de novo, assinatura na tela com a
  evidência conferida no banco, hash divergente, papel, dispensa, cancelamento,
  plano não emite, quem só vê não colhe, outra rede e RLS), 8 unitários de
  formatação e código. Vizinhos de agenda, atendimento, checkout, portais,
  permissões e RLS verdes.

### 2026-09-30 — Termos e contratos, fase 1: os modelos da rede

"A rede poder enviar documentos de termos de consentimento e contratos, ou criar
os documentos pelo próprio sistema. Ao criar ou editar um procedimento, deve ser
possível linkar um documento para assinatura do cliente. Precisamos também de
alguma forma de validação dessa assinatura." Até aqui só existiam os dois textos
fixos do checkout de plano (`consent_terms`, sem modelo, sem PDF, sem prova).

**Decisões do Heitor (2026-09-29):**
- assina nos QUATRO canais: na clínica (tela), portal do cliente, link público
  pelo WhatsApp e papel;
- validação própria: assinatura eletrônica simples (Lei 14.063/2020) com
  evidências (IP, aparelho, hash), PDF final e código de verificação público —
  sem serviço externo;
- PDF enviado vai COMO ESTÁ; só o documento do editor tem variáveis;
- **o documento é do procedimento**: até UM termo e UM contrato por
  procedimento. No plano, um termo por procedimento distinto e UM contrato de
  plano da rede (que lista procedimentos, sessões, valor e pagamento);
- no avulso, o momento (agendar / início do atendimento) e se bloqueia ou avisa
  são do modelo; no plano, tudo no fechamento;
- **sempre de novo**: cada atendimento e cada plano pede documentos novos.

**Plano em seis fases**: (1) modelos; (2) emissão pelo atendimento, assinatura
na clínica e no papel, ficha do cliente; (3) checkout do plano com o contrato de
plano e a forma de pagamento; (4) PDF final e verificação pública; (5) portal do
cliente; (6) link público e WhatsApp mínimo (copiar link / wa.me).

**Fase 1, entregue:**
- Tabelas `document_templates` e `document_template_versions` (migration
  `20260930000001`). Tipos TERMO, CONTRATO e CONTRATO_PLANO; origem EDITOR ou
  ARQUIVO. Versão é imutável; editar só abre versão nova quando o CONTEÚDO muda
  (`documento_modelo_salvar`, uma transação). Contrato de plano: no máximo um
  ativo por rede, por índice.
- `procedures.consent_template_id` / `contract_template_id`, com chave composta
  com `tenant_id` (outra rede não entra) e gatilho do tipo certo em cada campo.
- Marcação própria (`lib/documentos/marcacao.ts`) e catálogo fechado de
  variáveis por tipo (`lib/documentos/variaveis.ts`), com 13 unitários.
- Configurações → **Documentos** (editor com prévia, envio de PDF conferido com
  `pdf-lib`) e os dois seletores no cadastro do procedimento.
- Módulo novo `documents` ("Termos e contratos"), semeado para ninguém perder
  o que fazia no checkout: Gerenciar para quem gerencia clientes, prontuário,
  recebimentos ou financeiro; Ver para quem só vê clientes ou prontuário.
- Prova: `e2e/documentos-modelos.spec.ts` (5 casos, numa rede `[e2e]`, com o
  reenvio da action contra outra rede e a RLS pelo token do membro) e o caso
  novo em `permissoes-acoes`.

Ainda NÃO muda nada no dia da clínica: nenhum documento é emitido até a fase 2,
e o checkout segue com os dois termos fixos até a fase 3.

### 2026-09-29 — Fidelidade: opcionais da rede (bônus, troca pelo portal, aviso de vencimento)

Decisão do Heitor: o que tinha ficado fora da fidelidade vira OPÇÃO da rede, e o
aviso de vencimento sai por push. Os quatro nascem desligados.

- **Bônus de aniversário** e **de primeiro acesso**, cada um com liga/desliga e
  quantidade de pontos. Uma vez por ano / uma vez na vida, garantido por índice
  único (`bonus_ref`). O aniversariante e quem entra pela primeira vez recebem
  push. 29/02 ganha em 28/02 fora de ano bissexto.
- O primeiro acesso passou a ser marcado (`clients.app_account_created_at`
  existia e ninguém preenchia) no login pela tela e na sessão do app; quem já
  tinha entrado foi marcado pela migration, pelo auth.
- **Troca pelo portal**: "Quem troca pontos por recompensa: só a equipe /
  também o cliente". Ligada, o portal mostra "Trocar" → "Confirmar" em cada
  recompensa ao alcance do saldo; o voucher aparece na hora.
- **Aviso antes de vencer** (com validade ligada): push N dias antes (1 a 90),
  um por lote novo na janela.
- O cron `fidelidade-expiracao` virou `fidelidade` (expirar → aniversário →
  avisos).
- **Achado no caminho**: `expirar_pontos` valia para todas as redes, e o teste
  da fase 4 a chamava com datas de 2027. Inofensivo hoje (nenhuma rede real
  ligou o programa); no dia em que uma ligasse, o teste venceria pontos de
  clientes reais. As três funções da rotina ganharam `p_tenant` e os testes o
  passam (migration `20260929000006`).
- `test:e2e:afetados` não tinha área de fidelidade desde a fase 1: os specs
  `fidelidade-*` só rodavam na completa. Área criada.
- Banco: migrations `20260929000005` (config, BONUS, `fidelidade_dar_bonus`,
  `fidelidade_primeiro_acesso`, `fidelidade_bonus_aniversario`,
  `avisos_de_vencimento`) e `20260929000006` (recorte por rede).
- Testes: `e2e/fidelidade-opcionais.spec.ts` (6: config pela tela; primeiro
  acesso pela tela de login, uma vez, e não para quem já entrou; aniversário
  uma vez e o 29/02; aviso por lote e sem a opção; o cron gravando o push; troca
  pelo portal e a action recusando sem a opção) e 2 casos unitários novos;
  vizinhos (fidelidade 1–4, autenticação, portal, crons, LGPD, RLS): 50
  passaram. Mudou `e2e/apoio/sessao.ts` (parâmetro opcional de rede em
  `clienteComSessao`) e `actions/auth.ts` — vale uma completa quando o Heitor
  quiser.

### 2026-09-29 — Fidelidade, fase 4: validade dos pontos e abrangência por unidade

Fecha o plano de fidelidade (fases 1 a 4).

- **Validade** na aba Fidelidade: "Não vencem" ou "Vencem" após N meses (1 a
  120). Cada ponto recebe o vencimento ao entrar e o guarda — mudar a regra vale
  para os novos. Os mais antigos são usados primeiro.
- **Baixa diária** pelo cron `fidelidade-expiracao` (hoje `fidelidade`) (no Notification Cron, de
  hora em hora; idempotente). A conta FIFO é uma função só, em forma fechada
  (`fidelidade_a_expirar`), sem "consumir" lote a lote.
- **Abrangência**: rede inteira (padrão) ou só na unidade. Com "só na unidade",
  a ficha mostra o saldo de cada unidade, e pagamento, troca e débito usam só o
  saldo de onde acontecem. **Trava** depois do primeiro lançamento da rede — a
  tela mostra a escolha fixa com o porquê, e a action recusa.
- **Na ficha e no portal**: "N pontos vencem nos próximos 30 dias" e "vence em
  dd/mm" em cada crédito do extrato.
- O estorno de um ganho leva o vencimento dele (senão o lote estornado vencia
  de novo). `loyalty_accounts.balance` saiu do banco.
- Banco: migration `20260929000004` (`fidelidade_a_expirar`,
  `pontos_expirando`, `saldos_por_unidade`, `expirar_pontos`,
  `estornar_transacao` refeito).
- Testes: `e2e/fidelidade-validade.spec.ts` (5: config e trava pela tela e pela
  action; FIFO com datas escritas à mão, rodado duas vezes; estorno com
  validade; saldo da unidade A recusado na B no débito e no pagamento; o cron
  com o segredo) e o caso novo em `tests/fidelidade-config.test.ts`; vizinhos
  (fidelidade 1–3, RLS, crons sem credencial, crédito interno, estorno, LGPD,
  portal): 48 passaram.

### 2026-09-29 — Fidelidade, fase 3: catálogo de recompensas e vouchers

- **Catálogo** em Configurações → Fidelidade: procedimento grátis, desconto em
  R$ ou %, produto/brinde, com custo em pontos e validade do voucher.
- **Na ficha do cliente**: "Trocar pontos" (as recompensas que o saldo não
  alcança ficam desabilitadas) e a lista de vouchers — situação, validade,
  "Cancelar voucher" com motivo (os pontos voltam) e "Entregar produto".
- **No pagamento**: "Aplicar voucher" lista só os que servem naquele atendimento;
  o voucher desconta antes dos pontos. Procedimento grátis zera a conta.
- **No portal**: "Meus vouchers" (ativos) e o catálogo, só para ver.
- Banco (migration `20260929000003`): `loyalty_rewards`, `loyalty_vouchers`
  (leitura pela sessão, escrita só pelo servidor), `resgatar_recompensa`,
  `cancelar_voucher`, `entregar_voucher_produto`; o pagamento e o estorno
  refeitos para o voucher. Evento `fidelidade.voucher_emitido`.
- A conta do saldo de estoque depois de uma saída saiu de `finishSession` para
  `lib/estoque/baixa.ts` — a entrega de produto usa a mesma.
- Testes: `e2e/fidelidade-vouchers.spec.ts` (5: cadastro, troca e pagamento
  pela tela; entrega de produto pela tela com baixa do lote; cancelamento;
  voucher de outro procedimento e vencido; % + pontos e estorno) e
  `tests/fidelidade-voucher.test.ts`; vizinhos: 54 passaram. A varredura passou
  a tirar vouchers e recompensas das redes de teste antes dos procedimentos.

### 2026-09-29 — Fidelidade, fase 2: pontos como desconto no pagamento

- **Na recepção**, o modal de pagamento mostra "Usar pontos" quando o programa
  está ligado e o cliente tem saldo: "usar o máximo" (o menor entre saldo e
  teto), a linha "−R$" e o total a receber em destaque. Pago todo com pontos,
  some a forma de pagamento.
- **Regras na aba Fidelidade**: valor do ponto, mínimo e teto (% do valor).
- **`confirmar_pagamento_do_atendimento`** (migration `20260929000002`): o
  pagamento do atendimento virou UMA transação — pagamento, resgate dos pontos,
  comissão e linha do tempo. O app calcula em centavos inteiros
  (`lib/fidelidade/resgate.ts`) e o banco confere o mesmo número; o servidor
  refaz a conta a partir dos pontos pedidos.
- **`amount` é o dinheiro recebido**; o desconto vai em `loyalty_discount`.
  Receita, LTV, estorno e relatórios não mudaram (relatorios-coerencia passou).
- **Comissão** conforme a rede: sobre o preço, ou cai na proporção do pago.
- **Estorno** devolve os pontos usados e tira os ganhos; R$ 0 não vira
  "Purchase" na Meta.
- Testes: `e2e/fidelidade-desconto-no-pagamento.spec.ts` (tela com teto e
  comissão, três tentativas de burla recusadas sem gravar, estorno, R$ 0,
  concorrência — dois pagamentos com o saldo inteiro, um passa) e
  `tests/fidelidade-resgate.test.ts`; vizinhos (fechamento, crédito, estorno,
  permissões, entre redes, Meta, abrangência, relatórios): 53 passaram.

### 2026-09-29 — Fidelidade configurável, fase 1: config, ganho no pagamento, extrato e ajuste

"Vamos pensar de uma maneira que possa ser usado ou não e configurado pela rede,
como quiser." O programa existia só no esqueleto: nenhuma rede tinha config, nem
havia tela para criá-la, e o ponto nascia na conclusão sobre o preço. Plano de
quatro fases aprovado (decisões do Heitor: ganho por real pago OU por
procedimento; resgate como desconto e por catálogo com voucher; validade e
abrangência escolhidas pela rede; comissão com desconto configurável).

Fase 1 (migration `20260929000001`):
- **Config por rede**, desligada por padrão: aba Fidelidade em Configurações
  (liga/desliga, modo de ganho e taxa, base da comissão).
- **Ponto nasce no pagamento** (gatilho `trg_fidelidade_ganho`, evento
  `fidelidade.pontos_ganhos`), estorno tira, plano cumulativo, crédito interno
  não gera; `concluir_atendimento` perdeu o passo dos pontos.
- **Pontos por procedimento**: campo no cadastro do procedimento (só nesse modo).
- **Ficha do cliente**: saldo, extrato com autor e "Ajustar pontos" com motivo
  (`ajustar_pontos`); **portal**: cartão e página "Meus pontos".
- **Saldo = soma do extrato**; extrato e conta só se leem pela sessão (antes a
  equipe gravava pontos direto pela chave pública).
- Módulo `loyalty` volta ao catálogo (herda o nível de `clients`).
- O teste pegou um erro real: `floor(120 × (100 ÷ 300))` dava 39 — a regra
  multiplica antes de dividir.
- `e2e/fidelidade-ganho.spec.ts` (7) e `e2e/fidelidade-ajuste.spec.ts` (4),
  `tests/fidelidade-config.test.ts`; vizinhos rodados (RLS, fechamento,
  estorno, crédito, portal, LGPD, checkout, permissões): passaram.

### 2026-09-28 — "Criando…" eterno: bug do Next; o nome vem da pessoa; erro na tela

Três pendências fechadas de uma vez.

- **O "Criando…" eterno era bug do Next** (vercel/next.js#86151, corrigido no
  PR #95391, em 16.3.0): um `router.refresh()` que atropela uma server action em
  andamento desalinhava a fila do router, e a action nunca entregava o
  resultado — com o registro gravado. Só no build, em página com
  `loading.tsx`, mais em rede rápida: era o `RealtimeRefresher` recebendo o
  próprio insert. Subimos para **16.3.4**; 16.3.5+ tem outra regressão no
  refresh (#99028), por isso a versão fica fixa. Contra o build, o diagnóstico
  que travava 4 de 5 fechou 5 de 5; `eventos-cadastro`,
  `procedimento-modal-limpo`, `prontuario` e `permissoes-acoes` passaram. A
  regra nova de lint do 16.3 (`window.location` com caminho interno) virou
  `lib/navegacao-inteira.ts`, para as três navegações inteiras de propósito.
- **O nome é lido da pessoa** (`contacts.name`), não da cópia da conversa:
  lista, busca do inbox (migration `20260928000009`), card, "virar cliente",
  templates, agendamento pelo CRM, evento. O telefone da conversa fica — é o
  destino da thread. `e2e/inbox-nome-da-pessoa.spec.ts` falha sem a mudança.
- **Cinco telas mostravam `e.message`** de erro do servidor (movimentações,
  respostas rápidas, visibilidade do inbox, conexão uazapi ×2): em produção, o
  aviso genérico do Next em inglês. `lib/erro-na-tela.ts` (`erroParaTela`)
  põe o texto da tela, e "sem acesso" pelo digest. `tests/erro-na-tela.test.ts`.

### 2026-09-28 — O que a suíte contra o build achou em produção

A primeira regressão no GitHub (contra o build, não o `next dev`) deu 283
passando e 8 falhando. Três eram defeitos REAIS de produção, que o dev nunca
mostraria:

- **Link de e-mail quebrado.** O standalone monta `req.url` e
  `req.nextUrl.origin` com o `HOSTNAME` em que escuta: `/auth/confirm` em
  app.bellarisos.com redirecionava para `https://0.0.0.0:8080/login`
  (conferido com curl). Recuperação de senha, confirmação e o retorno do OAuth
  da Meta. `lib/origem.ts` (`origemPublica`) usa `x-forwarded-*`, depois o
  `Host`; `tests/origem.test.ts`.
- **"Algo deu errado" no lugar de "sem acesso".** Em produção o Next troca a
  mensagem de todo erro do servidor, e `app/error.tsx` reconhecia a falta de
  permissão por `message === 'Forbidden'`. As travas lançam `semAcesso()`
  (`lib/sem-acesso.ts`), com `digest` fixo, que é o que atravessa.
- A suíte em si servia o build em `[::]` e os redirects levavam a pessoa para
  lá, sem o cookie: agora servidor e teste em `127.0.0.1`.
- A varredura passou a apagar procedimentos `[e2e]` da rede real (havia 33).

~~**Em aberto:** criar procedimento contra o build fica às vezes em "Criando…" —
a action grava, a resposta chega inteira, e o formulário não recebe o
resultado. É corrida: o `RealtimeRefresher` pede `router.refresh()` com a
action em andamento e o router a aborta (visto pelo stack do DevTools), mas
com o realtime bloqueado ainda acontece às vezes. Em produção o Heitor criou
normalmente. Uma tentativa de contar actions em voo pelo `fetch` não se provou
e não entrou.~~ **Resolvido no mesmo dia** — bug do Next, ver a entrada acima.

### 2026-09-28 — Novo procedimento abre vazio

Visto pelo Heitor em produção: depois de criar um procedimento, "Novo
procedimento" abria com campos do anterior e o "criado com sucesso" dele. O
`<dialog>` só se esconde ao fechar, e o formulário (com o estado do
`useActionState`) sobrevivia. A modal agora monta um formulário novo a cada
abertura (`key`). As outras seis modais com `useActionState` já zeravam ao
abrir. Prova: `e2e/procedimento-modal-limpo.spec.ts` (falha sem a correção). O
`test:e2e:afetados` ganhou a área de procedimentos: 3 specs, 32 s.

### 2026-09-28 — A regressão sai do caminho: afetados na etapa, completa no GitHub

"Se cada etapa vai demorar todo esse tempo, o desenvolvimento fica quase
inviável." A suíte tem 299 testes num worker só (eles dividem o banco) e levava
27 minutos contra o `next dev`, que compila cada tela na primeira visita.

- **`pnpm test:e2e:afetados`** (`scripts/e2e-afetados.mjs`): os arquivos
  alterados (ou `--desde <ref>`) casam com áreas, e cada área diz seus specs;
  roda também o `vitest related`. Arquivo compartilhado recusa a escolha e
  pede a completa.
- **`pnpm test:e2e:completa`**: `next build` + a suíte contra `next start`
  na porta 3100 (`playwright.build.config.ts`), ao lado do dev da 3000.
- **GitHub Actions** (`.github/workflows/e2e.yml`): a completa a cada push na
  main. Secrets só do Supabase, no environment `e2e` restrito à main, e nunca
  em pull request; o resto é descartável, gerado a cada execução. Repositório
  privado (confirmado pelo Heitor).
- Falta do lado do Heitor: criar o environment e os três secrets (ver §6).

### 2026-09-28 — O inbox paginado, filtrado no banco

"A lista de leads do dono pode carregar 30 com carregamento automático por
scroll." O inbox carregava as 200 conversas mais recentes e filtrava no
navegador: a 201ª não aparecia nunca — nem rolando, nem procurando por ela, nem
filtrando. E no modo "pela conversa" os leads do dono vinham de um select que o
PostgREST corta em 1000 linhas sem avisar.

- **`inbox_pagina`** (migration `20260928000007`): 30 por vez, cursor
  `(last_message_at, id)`, com alcance (dono, caixas do cargo), filtros do
  painel e busca aplicados no banco — as mesmas definições de
  `passaNosFiltros`, que ficou como guarda do realtime.
- **`inbox_opcoes`**: donos, funis, etapas, tags e unidades em uso na rede,
  somados às opções das conversas carregadas.
- **`leads_do_dono`**: os leads do dono num array só, também usado pela
  abertura por id (`alcanceDoDono`).
- Na tela: o fim da lista busca a próxima página; filtro e busca (com espera
  de 300 ms) voltam à primeira; o realtime recarrega o tanto já carregado.
  `getConversations` deixou de engolir erro devolvendo lista vazia.
- `conversations.tags` **fica** (decisão do Heitor): é a semente das tags da
  pessoa, lida só pelo gatilho. Ganhou comentário na coluna
  (`20260928000008`) e saiu da lista de dívidas.
- `e2e/inbox-paginado.spec.ts`: 45 conversas numa rede `[e2e]` — abre com
  30 e traz as 45 ao rolar; busca e "não lidas" acham a da página 2; SDR com
  1005 leads no modo "pela conversa" vê a do seu e não a do outro dono. A
  varredura de sobras passou a apagar oportunidades e pessoas das redes de
  teste (a primeira rodada deixou 1006 pessoas para trás).
- De carona, na regressão: salvar a campanha editada não saía do formulário.
  O `router.push` dentro da transição perdia para o refresh do
  `revalidatePath` da action; a navegação agora sai num efeito, depois dela.

### 2026-09-28 — O quadro de oportunidades em tempo real

"Adicione realtime no quadro de oportunidades." O quadro já assinava leads,
etapas e funis — e quase nada chegava: funis fora da publicação do realtime, a
política de etapas comparando a claim fora de `app_metadata` (nunca valeu) e
lead legível pela sessão só para quem é da rede. Na prova com a tela antiga,
nem o lead novo chegou para quem é da rede.

- **Sinal em vez de dado** (migration `20260928000006`): `crm_quadro_sinais`,
  uma linha por rede, marcada por gatilho em leads, etapas e funis. A tela
  assina o sinal e recarrega pelo servidor, com o alcance de sempre. Abrir a
  leitura de `leads` pela sessão mandaria a linha inteira pelo websocket a quem
  o escopo "só os meus" esconde.
- `e2e/quadro-tempo-real.spec.ts`: com o quadro aberto, o banco é mexido por
  fora — o lead novo aparece para quem é da rede, a etapa renomeada aparece
  para quem é de unidade. Os dois falham com a tela antiga.

### 2026-09-28 — Três funções sem botão ganham tela; código morto sai

O levantamento do código morto separou três casos, e o Heitor aceitou a
sugestão para cada um.

**Funcionalidade pronta no servidor e sem botão** — ligadas
(`e2e/funcionalidades-ligadas.spec.ts`, as três falham no código antigo):
- **Excluir automação**: ícone na barra do editor, só com ela DESLIGADA (a
  action recusa excluir o que está agindo), com confirmação que diz o que sai
  (o histórico de execuções) e o que fica (o que ela já fez).
- **Editar campanha**: `/admin/notificacoes/[id]/editar`, o mesmo formulário
  aberto preenchido, nos estados em que o servidor aceita (rascunho e pausada).
  O tipo fica travado — mudar o tipo é outra campanha. `updateCampaign` lia com
  `.single()` (500 para id inexistente): agora `maybeSingle`.
- **Sair do portal para o push deste navegador**: o botão "Sair da conta" tira
  a inscrição do servidor, cancela no navegador e só então sai. Antes, quem saía
  de um computador emprestado continuava recebendo as notificações nele.

**Substituídos por outro caminho** — removidos: `saveSessionNotes` (a tela usa
`saveDraftNotes`), `cadastrarClienteRapido` (o cadastro rápido é o
`garantirClienteRapido`, dentro do agendamento), `conferirGrafo` (o editor
valida no navegador), `podeEditarMapa`, `getIntegrations`, `getMetaPages`,
`assertRelatorio`, `CANAIS_COM_JANELA`, `REFERENCED_BUCKETS`, `rotaNovoCliente`,
`rotaCheckout`, `sourceTagFor` e os schemas de agendamento, procedimento,
cliente e login do cliente em `packages/validators`. A seção de relatórios
passou a usar `podeVerRelatorio` (a regra testada) em vez de repeti-la.
(O teste desses schemas ficou para trás e deixou o Vitest de `validators`
vermelho — 16 de 18 — até 2026-09-29, quando ficou só com os de
autenticação, os dois de senha incluídos.)

**As dicas de cada módulo** (`MODULE_HINTS`, escritas e nunca mostradas)
aparecem ao lado do nome na tela de Cargos; a de Fichas foi corrigida para a
ficha única do procedimento.

Tropeço registrado: um script que removia funções por nome errou os limites de
blocos em quatro arquivos (apagou 67 linhas onde eram 3). Foi desfeito antes de
qualquer commit e a remoção refeita item a item, conferindo cada trecho.

### 2026-09-28 — Nome e telefone da pessoa se propagam

"Sobre editar nome ou telefone do contato, faça com que a edição propague."
Corrigir o nome numa conversa não mudava a outra conversa da mesma pessoa nem a
própria pessoa (`contacts`), só as oportunidades; e corrigir no card da
oportunidade não mudava nada fora dele.

- `propagarDadosDaPessoa` (`lib/contatos/propagar.ts`), chamada pelos dois
  lugares que editam (painel do inbox e card da oportunidade). O nome vai para
  a pessoa, todas as conversas e todas as oportunidades.
- **O telefone tem regra**: na conversa ele é o DESTINO da mensagem. Vai para
  as conversas com o mesmo número antigo ou sem número; a conversa com outro
  número (outro WhatsApp da pessoa) não muda. O número novo passa a identificar
  a pessoa (`identifiers`).
- `e2e/contato-propaga.spec.ts`: uma pessoa com quatro conversas (duas no
  mesmo número em caixas diferentes, uma no Instagram, uma com outro número) e
  duas oportunidades; edição pelo inbox e pelo card. Os dois caminhos falham no
  código antigo.
- Achado de teste: o nome do lead também aparece nos diálogos fechados de cada
  card do quadro — clicar pelo texto acerta um elemento invisível e trava.
  Clicar pelo `.crm-card`.

### 2026-09-28 — Credencial fora do alcance da sessão

"Pode fazer o ajuste do RLS." O item de "Em aberto" dizia que a RLS de
`integration_configs` decidia por nome de cargo. Conferido no banco, era pior:
uma política FOR ALL que só conferia a REDE — e a tabela guarda o token da Meta,
do Google Ads e o segredo do app. `whatsapp_numbers` (o token de cada número) e
`whatsapp_number_users` (quem fala por cada número) estavam iguais. Qualquer
membro lia os tokens e mexia nos vínculos pela chave pública.

- **Provado ANTES da correção** (`e2e/credenciais-fora-da-sessao.spec.ts`): um
  SDR com só `crm: VIEW` leu o token da Meta direto do PostgREST.
- Migration `20260928000005`: as três ficam com RLS ligada e **nenhuma
  política** — a sessão não alcança nada, e o servidor (service role) segue
  igual. Conferido antes: nenhuma leitura pela sessão no código, nenhuma das
  três no realtime, nenhuma função SECURITY INVOKER dependendo delas.
- O Heitor perguntou se a regra aberta existia por causa do realtime: não
  existia — nenhuma dessas tabelas é publicada nem assinada.

### 2026-09-28 — A conclusão do atendimento numa transação só (e o pacote que nunca agendou)

"Pode fazer o ajuste como você sugeriu." `finishSession` gravava status,
prontuário, comissão, pontos, estoque, pacote e histórico em sequência: falhar
o quinto deixava os quatro primeiros, e o atendimento ficava concluído com
comissão e sem baixa de estoque — sem jeito de refazer.

- **`concluir_atendimento`** (migration `20260928000003`): o app calcula, a
  função grava tudo numa transação, com o agendamento travado e o status
  conferido lá dentro — dois "finalizar" ao mesmo tempo concluíam duas vezes.
  Pontos e contador do pacote passaram a somar no banco (ler e regravar perdia
  quando dois atendimentos fechavam juntos). Eventos e notificações saem depois,
  só se gravou. Nenhuma regra de negócio foi para o banco.
- `e2e/conclusao-atomica.spec.ts`: falha no meio desfaz status, prontuário,
  comissão e o primeiro insumo; pacote usado e contador na mesma transação;
  dois cliques concluem uma vez.
- **Agendar sessão de pacote nunca funcionou**, por dois motivos (achados
  escrevendo o teste acima):
  - `client_packages` não tinha chave para `branches`, e o embed que confere a
    rede respondia PGRST200 — a mesma consulta da lista de sessões do pacote,
    que também nunca abria (migration `20260928000004`);
  - passando dali, gravava `status: 'SCHEDULED'` na sessão, que não existe no
    enum — depois de o agendamento já ter nascido, que ficava órfão. Agora a
    sessão continua `AVAILABLE` (o `appointment_id` é que diz que está marcada),
    só vincula se ninguém vinculou antes, e o agendamento sai se o vínculo falhar.
  - `e2e/pacote-agendar.spec.ts`, provado com o código antigo. A produção não
    tem nenhum pacote vendido.

### 2026-09-28 — Lotes que baixam, lead que não se apaga, Prisma fora, PRD reescrito

Pendências de "Em aberto" que o Heitor mandou resolver.

- **Lotes** (migration `20260928000001`, `e2e/lotes-baixa.spec.ts`). Dois
  defeitos, um desenho:
  - `product_batches` não tinha `branch_id`, e a entrada de estoque gravava
    um: **toda entrada com número de lote falhava**, depois de já ter gravado o
    movimento e o saldo. O lote agora é da unidade (o existente foi preenchido
    pela compra mais próxima), e a leitura segue a unidade do lote — a política
    antiga passava por `products.branch_id`, nulo no catálogo da rede, e pela
    sessão ninguém lia lote nenhum.
  - **O lote nunca baixava.** Agora o gatilho `trg_lote_do_movimento` baixa a
    cada saída: FEFO entre os ainda válidos, os vencidos por último; o consumo
    do atendimento (em ml/UI) convertido para embalagens; a transferência leva
    o lote para o destino. Cada baixa fica em `stock_movement_batches` — de
    qual lote saiu o que foi aplicado. A `reference` da transferência virou
    aleatória (com o relógio, duas no mesmo milissegundo trocariam lotes).
- **Oportunidade não se apaga** (migration `20260928000002`,
  `e2e/lead-nao-se-apaga.spec.ts`). Saíram a action `deleteLead`, o "Excluir
  lead" do card (o menu só aparece quando há outro funil) e o caminho pelo
  banco. Achado: a política FOR ALL de `leads` comparava a claim no topo do
  token, onde ela não está — nunca valeu, e a sessão só lia lead. A de
  `lead_events` valia: **qualquer membro apagava e reescrevia o histórico** pela
  chave pública. Agora é ler e acrescentar. Nada novo foi liberado para a
  sessão (criar política de escrita em `leads` furaria o escopo "só os meus").
- **Prisma removido**: `packages/db`, `lib/prisma.ts`, o `schema.prisma` solto
  na raiz, os scripts `db:*`, o `postinstall` que rodava `prisma generate` à
  toa, e as permissões de build dele.
- **PRD reescrito** (v2.0) contra o sistema como ele é: clínica única, ERP + CRM,
  inbox, funil, automações, marketing; sem caixa, sem agendamento público, sem
  cargos fixos. As metas de negócio da v1.1 eram para redes de filiais e ficaram
  marcadas para redefinir.
- **CLAUDE.md corrigido onde descrevia o que não existe**: o app em Expo
  (é o portal num Capacitor, só Android), BullMQ/Upstash (a fila é o Postgres),
  Expo Push (é Web Push + FCM), a transferência com confirmação (é imediata) e o
  login do cliente por CPF/magic link (é e-mail e senha).

### 2026-09-28 — A extensão de Chrome sai; o app nativo deixa de aceitar HTTP

- **A extensão foi descontinuada** (decisão do Heitor). Saíram `apps/extension`,
  as rotas `/api/ext/*`, `lib/ext`, o `getTenantContextFromToken` (só ela
  entrava por token) e os testes dela. O time comercial agenda pelo CRM
  (`createCrmAppointment`), que é de onde o `source = COMMERCIAL` passa a vir.
  As menções na linha do tempo abaixo ficam como histórico.
- **O app nativo não aceita mais tráfego HTTP em claro**: `cleartext: false` no
  `capacitor.config.ts` (a URL já era `https`). Vale no próximo build
  (`npx cap sync` + build do Android). Saíram junto a exceção de HTTP para os
  IPs de desenvolvimento no `network_security_config.xml` e o
  `usesCleartextTraffic` do manifesto.
- **Achado ao remover**: era a extensão que, por acaso, punha o `@types/react`
  ao alcance dos tipos do `next` — e na versão 18, enquanto o app usa a 19. Sem
  ela o `tsc` quebrava (`next/script` sem atributos). Agora `@types/*` fica
  no `node_modules` da raiz por configuração (`publicHoistPattern` no
  `pnpm-workspace.yaml`), e os tipos do React são os do 19.

### 2026-09-28 — Frente 9 (P7, parte 3): os pacotes, e o fim da P7

- **Pacotes** (`tests/pacotes.test.ts`, 12 casos): os schemas de
  autenticação, a regra de origem do lead (Google/Meta/orgânico, a plataforma
  do provedor vencendo a URL, a escolha manual sem apagar o anúncio), a
  formatação (moeda, percentual, data no fuso do negócio, máscaras), as
  iniciais por code point, o "tempo parado" do CRM e a tag de unidade. Nenhum
  defeito. `CreateAppointmentSchema`, `UpdateAppointmentSchema`, os schemas de
  procedimento, `ClientLoginSchema`, `ClientMagicLinkSchema` e
  `sourceTagFor` NÃO são usados pelo app — código morto, não testado.
- `chamarAcao` passou a falhar alto com "Server action not found" (o Next
  responde 200): os nove specs que o usam foram rodados de novo e nenhum caía
  nisso.
- **Fora de propósito**: o app nativo — `apps/native` é uma casca do
  Capacitor que abre a URL de produção num WebView, sem lógica própria além do
  web.

Com isso a varredura de cobertura (P1…P7) fecha.

### 2026-09-28 — Frente 9 (P7, parte 2): quem tem unidade fixa age só na dela

O levantamento do portal da unidade achou o buraco maior da P7: **a
abrangência do membro (§11) quase não era conferida nas actions.** Navegar
entre unidades estava trancado (o layout manda embora), mas a action pelo id
só conferia a REDE. A recepção da unidade A confirmava, cancelava e fazia
check-in no agendamento da B; dava baixa e estornava lançamento da B; abria,
listava e cancelava o plano da B; abria e renomeava o mapa de injetáveis da B;
a gerente da A desativava — e bania do login — gente da B e até admins da rede,
e desativava a unidade B. A produção tem 1 rede com 4 unidades e 5 membros de
unidade fixa: o furo era real.

- **Um portão só**: `alcancaUnidade` / `assertUnidade` (`lib/auth.ts`). Quem é
  da rede alcança todas; quem tem unidade, só a dela; registro sem unidade é da
  rede. Os helpers que já conferiam a rede (`planoDoTenant`,
  `agendamentoDoTenant`, `mapaDoTenant`, `membroDaRede`) passaram a conferir
  a unidade — as actions que passam por eles ganharam a trava juntas.
- **`conferirPecasDoAgendamento`** saiu de dentro do núcleo da agenda
  (`lib/appointments/core.ts`) e passou a servir a TODO caminho que cria ou
  move agendamento. Além da unidade, fechou furos de REDE que o levantamento
  achou: o checkout do plano, a sessão de pacote e a de plano gravavam unidade,
  profissional, cliente e procedimento que o navegador mandasse (inclusive de
  outra clínica); remarcar e trocar o profissional aceitavam profissional de
  qualquer rede; a sessão de plano não era amarrada ao plano. A conferência do
  checkout roda antes do dinheiro, para a recusa não deixar receita lançada.
- **Concluir o atendimento** (`updateAppointmentStatus` → COMPLETED) não
  conferia NADA — nem a rede — antes de baixar estoque, lançar comissão e
  pontos. Agora confere as duas. E mudar o status pela sessão confere a linha
  devolvida (RLS podia zerar o update sem erro, com o histórico gravado).
- **Leituras com recorte do chamador** (horários do dia, profissionais,
  planejamentos, mapas, histórico do produto): quem tem unidade fixa vê a dela,
  qualquer que seja o pedido.
- **Unidades**: criar e ativar/desativar é da rede; editar, a própria.
- **Procedimento**: unidades de disponibilidade e preço, insumos e ficha do
  formulário são conferidos na rede (iam direto para as tabelas de ligação).
- Também: `createProduct` (a unidade do estoque inicial — que grava despesa),
  `criarPlanoDoCliente`, `criarPlanejamentoInjetavel`, `registrarAplicacao`
  (o atendimento é do cliente), `deleteClientDocument`, a ficha e a foto do
  atendimento.

Prova: `e2e/abrangencia-unidade.spec.ts` (5 casos), numa rede `[e2e]` com
duas unidades; cada recusa tem o membro da rede como controle e a própria A
continua agindo na A. Os cinco falham no código antigo. A varredura de sobras
passou a tirar mapas e lançamentos sem cliente de rede `[e2e]` (prendiam a
unidade), e o `limpar()` da outra rede avisa quando a rede não sai.

Fica de fora, de propósito: o **cliente é da rede** (§9.2), então a ficha dele
mostra transações, documentos e planos de todas as unidades — é desenho, não
furo. CRM e inbox não têm dimensão de unidade.

### 2026-09-28 — Frente 9 (P7, parte 1): entrar, recuperar a senha e cadastrar

"Pode seguir com o P7." As telas de autenticação nunca tinham rodado num
teste (`e2e/autenticacao.spec.ts`, 5 casos, sem sessão e sem mandar e-mail:
o link vem do `generateLink` do admin).

- **"Esqueci minha senha" não funcionava.** O link apontava para
  `/auth/update-password`, que não existia — a recuperação inteira terminava
  num 404. Agora `/auth/confirm` troca o link por sessão (o `?code=` do fluxo
  PKCE, que é o que o e-mail padrão produz, ou `?token_hash=`) e segue para
  `/update-password`, a tela nova da nova senha. `next` só aceita caminho
  interno. Link usado ou inválido diz que expirou e oferece pedir outro.
- **Cadastrar um e-mail que já tem conta criava uma rede órfã.** Com a
  confirmação de e-mail ligada (é o caso aqui), o Supabase não dá erro: devolve
  um usuário disfarçado, sem identidades e com id fictício. O cadastro seguia,
  criava uma "Minha Clínica" e um membro com aquele id. Agora recusa ("Este
  e-mail já está cadastrado."), e se a criação de membro ou acesso falhar, a
  rede recém-criada é desfeita. Provado com o código antigo; a produção tem uma
  rede só e nenhuma órfã — nunca aconteceu lá.
- O pedido de reset passou a validar o e-mail com `ResetPasswordSchema`
  (existia e ninguém usava).
- Fora de propósito: cadastro NOVO pela tela (mandaria e-mail de confirmação
  de verdade) e o envio do e-mail de reset. ⚠️ Com o SMTP padrão do Supabase,
  e-mail só sai para endereços da equipe do projeto: se não houver SMTP
  próprio configurado, nem a confirmação de cadastro nem o reset chegam a
  cliente nenhum — vale conferir no painel.

### 2026-09-28 — A integração de anúncios, pela tela

"Faz os testes da integração de anúncios pela tela." Era o que a Frente 7b
deixou de fora (`e2e/anuncios-integracao.spec.ts`, 7 casos). Roda inteiro
numa rede `[e2e]` — `criarMembro` ganhou a opção `tenant` —, então a
integração da rede real nem é lida; a Graph é a falsa, que passou a responder
GET (contas, pixels, campanhas).

Coberto: a volta do OAuth com a escolha de conta e pixel; as campanhas da
conta escolhida no marketing, com o token dela; "alterar conta", que busca as
contas na Meta e inclui o pixel pendurado na CONTA (Business Manager);
desconectar; o formulário do Google Ads; quem só vê o marketing não grava,
não desconecta nem consulta a Meta; chave fora da lista não entra (Google e
Meta). A troca do `code` com o Facebook não se simula — o teste parte do que
o callback grava.

Dois achados, provados com o código antigo:
- **Quem voltava do Facebook não via a escolha da conta.** O OAuth de
  anúncios volta com `meta_step=select`, e a tela só abria a seção certa para
  o de mensagens: caía na seção do WhatsApp, com a conta a escolher escondida
  num cartão fechado.
- **Rede sem integração dava erro 500** em "escolher conta" e "buscar contas":
  as duas liam com `.single()` dentro de `ler`, e "não achei" virava
  exceção em vez de "reconecte com o Facebook".

### 2026-09-28 — Frente 7b (fim da P5): template, mídia, Instagram e os crons da Meta

"Termina a P5 primeiro." O que a Frente 7 deixou para depois agora roda
inteiro num teste (`e2e/mensagens-meta.spec.ts`, 6 casos), contra servidores
falsos em `127.0.0.1` — nada sai para a Meta nem para a uazapi.

**Uma Graph API falsa** (`e2e/apoio/graph-falsa.ts`), irmã da uazapi falsa. A
caixa oficial e a integração de anúncios aceitam `config.graphBase`, que troca
o endereço da Graph. **É costura de teste, não configuração**: fica fora das
listas de chaves que a tela grava (abaixo), então só entra direto no banco.

Achados, cada um provado com o código antigo:
- **Template com variável posicional saía com as chaves.** A Meta usa
  `{{1}}` e o sistema só preenche variável com nome (`{{nome}}`): o cliente
  recebia "Olá {{1}}". Agora o envio recusa template com variável que o
  sistema não preenche, antes de gravar e de chamar a Meta.
- **Template e mídia gravavam a mensagem sem a caixa que enviou** (§9.8.0 —
  `messages.whatsapp_number_id` existe justamente para o histórico não
  afirmar que tudo saiu pela caixa da conversa), e a conversa sem caixa nunca
  adquiria a sua nesses dois caminhos. O texto já fazia os dois.
- **A tela de integrações gravava qualquer chave e qualquer endereço.** O
  `config` da caixa e o da integração de anúncios iam para o banco como o
  navegador mandasse — inclusive `graphBase`, e uma `baseUrl` apontando
  para `127.0.0.1` ou `169.254.169.254`: o servidor faz a chamada para esse
  endereço, e aceitar um interno é dar a quem tem `settings: MANAGE` um jeito
  de o app falar com a rede de dentro (SSRF). Agora cada provedor tem sua lista
  de chaves (`CHAVES_DA_CONFIG`, `CHAVES_DO_ADS`) e a `baseUrl` tem de ser
  `https` e pública (`lib/whatsapp/endereco-publico.ts`, com teste unitário).
- **O cron da Meta ficava verde sem enviar**: `reenviarEventosPendentes`
  devolvia zeros quando a leitura da fila falhava. Agora lança (§14.1: o cron
  sai vermelho).
- **O webhook da Meta descartava a mensagem** quando a consulta da página
  falhava (`getTenantPorPagina` engolia o erro e respondia "página
  desconhecida"). Agora falha alto — a Meta reenvia.
- `getAdsConfig` remontava a config campo a campo e jogava `graphBase` fora:
  o primeiro teste do cron chegou a falar com a Meta de verdade (token falso,
  recusado). Corrigido junto.

Cobertos sem achado: Instagram assinado vira conversa na rede da página e o eco
não entra; `eventos-expirados` apaga o fato de 31 dias e deixa o de hoje;
`meta-capi` envia o evento com click id e descarta o velho e o sem click id.

`saveAdsConfig` ficou para a entrada seguinte, feita numa rede `[e2e]`.

### 2026-09-27 — Frente 8 (P6, parte 2): cargos, fichas, unidades e caixas

Cobertura do que não tinha teste (`e2e/estrutura-da-rede.spec.ts`): cargo em
uso não se apaga e o livre sai; fichas editam, desativam e, apagadas, soltam o
procedimento que as usava (o prontuário guarda cópia das perguntas); nada disso
alcança a ficha, o cargo ou a unidade de outra rede.
- **Cargo de outra rede derrubava a tela**: `updateRole`/`deleteRole` liam com
  `.single()` dentro de `ler`, e "não achei" virava erro 500 em vez de "Cargo
  não encontrado". Agora `maybeSingle`. Provado com o código antigo.
- **Caixa de WhatsApp com a unidade de outra clínica**: os caminhos que CRIAM a
  caixa gravavam o `branch_id` (rótulo) sem conferir a rede — o nome da unidade
  alheia apareceria onde a caixa aparece. A garantia foi para o banco: chave
  composta `(branch_id, tenant_id)` → `branches(id, tenant_id)`, com
  `on delete set null (branch_id)` (migration `20260927000014`).
- Fora de propósito: o perfil da clínica e o onboarding (usam a rede da sessão,
  sem id de fora — e testar mudaria a clínica real); criar conexão uazapi e
  Ads (instância paga e conta Meta reais). O "id de outra rede é recusado" da
  uazapi já é garantido por `numeroDaRede`.

### 2026-09-27 — Frente 8 (P6, parte 1): cinco furos de "o id veio do navegador"

"Pode seguir com o P6." O levantamento achou cinco furos; cada um tem teste
que falha no código antigo.

1. **Membro desativado seguia com acesso completo** — o mais grave. Nem o login
   nem o contexto conferiam `users.is_active`: desativar era uma coluna que
   nada lia. Agora o contexto barra (vai para `/login?acesso=desativado`), a
   conta é bloqueada no Auth (não renova nem entra de novo) e o cache do membro
   expira na hora (`updateTag`; o `revalidateTag 'max'` serviria o valor velho
   em mais uma requisição — vale também para trocar cargo). Ninguém desativa a
   si mesmo: o botão some da própria linha e a action recusa.
   `e2e/membro-desativado.spec.ts`.
2. **Membro preso à unidade de outra clínica**: `createTeamMember` e
   `updateTeamMember` não conferiam o `branchId` — e toda consulta que filtra
   só por `branch_id` entregaria os dados da outra unidade a ele.
   `e2e/equipe-unidade-da-rede.spec.ts`.
3. **Agendamento na agenda de outra clínica**: `createAppointmentCore` (agenda
   e comercial) só conferia o procedimento. Profissional, sala e cliente de
   outra rede agendavam; e quem tem unidade fixa agendava em qualquer outra da
   rede. `e2e/agendamento-da-rede.spec.ts`.
4. **Um id qualquer tirava o funil padrão da rede**: `setDefaultFunnel` limpava
   o padrão de todos os funis ANTES de conferir o id. Na prova com o código
   antigo a rede real ficou sem padrão por segundos e o teste devolveu.
5. **Etapa e card atravessando redes**: `createStage` aceitava funil de outra
   rede; `updateLeadStage`/`updateLead`/`createLead` aceitavam etapa de outra
   rede (o card sumia dos quadros). `e2e/crm-estrutura.spec.ts`, que cobre
   também as regras do quadro que nunca tinham teste (padrão não se arquiva nem
   apaga; funil e etapa com lead não se apagam).

### 2026-09-27 — Nenhuma tela soma nem conta: o resto do §13.1

"Resolve a questão do JavaScript primeiro." As três telas anotadas e mais três
achadas no caminho. Todo número agora vem do Postgres, e todo dinheiro de uma
regra só.

- **Relatórios** (`metrics_relatorio`, migration `20260927000011`): a tela
  buscava as linhas do período — transações (até 5000), atendimentos,
  agendamentos, comissões, movimentos, saldos, a base de clientes — e fazia ~40
  contas em JS. Cortava em 1000 linhas e, pior, tinha **dois faturamentos**:
  "por unidade", "forma de pagamento" e "por categoria" somavam por
  `created_at` e COM estorno, ao lado do KPI por `paid_at` sem estorno. Agora
  toda soma de dinheiro parte de `metrics_receitas_pagas` (o predicado de
  `metrics_core`), e as contagens que o núcleo já tem vêm dele. Diferenças
  visíveis, todas para o certo: "Novos clientes" passa a contar também o
  cadastro sem unidade (a regra do dashboard); a faixa etária usa a data em
  UTC (antes errava por um dia perto do aniversário); o consumo de insumo usa
  o custo do movimento (antes o do cadastro).
- **Procedimentos da unidade**: sessões por procedimento contadas no banco;
  o "ticket médio" da tela era a MÉDIA DOS PREÇOS DE TABELA — virou "preço
  médio" (o rótulo acompanha a conta).
- **Dashboard da unidade**, clientes para reativar: três selects sem limite
  viraram `metrics_clientes_para_reativar` (total + os três há mais tempo sem
  vir, na mesma ordem).
- **Ficha do cliente** (os dois portais) e "Total investido" do portal do
  cliente: o LTV era "preço dos atendimentos + lançamentos pagos sem
  agendamento" — contava estorno e atendimento nunca pago; o ticket dividia por
  (sessões + lançamentos). Agora `metrics_do_cliente`: LTV = o que pagou, desde
  sempre (o mesmo do dashboard); ticket = serviço dos concluídos ÷ concluídos.
- **Estoque** (unidade e rede): valor em estoque e giro do mês no banco — o
  giro era uma terceira cópia da conta, sobre linhas cortadas.
- **`lib/metrics` parou de engolir erro**: `logRpcError` registrava e o wrapper
  devolvia zero. Agora lança.
- Provado em `e2e/indicadores-cenario.spec.ts` (cada aba com valor escrito à
  mão, estorno e pendente fora de tudo) e `render-limpo` (as 8 abas e as telas
  da unidade abrem sem cair na página de erro).
- ⚠️ A função recém-criada falhava 1 em 3 chamadas: réplicas do PostgREST sem
  o schema novo. Migration que cria função termina com `notify pgrst`.
- **O "intermitente" do `planejamentos-mobile` não era tempo** (a espera já
  tinha ido a 15 s e ele caiu de novo). O teste escolhia a PRIMEIRA unidade do
  seletor, e na regressão completa ela era a `[e2e]` de outro spec rodando em
  paralelo, que a apaga no fim — o "Criar" batia em chave estrangeira. O mesmo
  valia para `filiaisAtivas()`, usado por dezenas de specs: ordena por nome e o
  `[` vem antes das letras. Agora ele só devolve unidades reais.

Regressão completa com o código final: 241 E2E passaram, 2 pulados, nenhuma
falha. Vitest 378/378, tsc e lint limpos.

### 2026-09-27 — Nenhum erro de consulta descartado; demografia no banco

"Corrige as pendências anotadas." As da entrada abaixo, e a regra inteira do
§13.1: a lista anotada era um pedaço de ~125 consultas no sistema que liam
`{ data }` sem olhar o `error`. Agora nenhuma — só sobram, com o motivo escrito
ao lado, os `tentar` do que é acessório ou do que roda DEPOIS de um efeito
externo já ter acontecido (lançar ali diria "falhou" sobre algo feito).

- `contar` em `lib/db.ts`: `const { count } = await …` descartava o erro do
  mesmo jeito que `{ data }`, e a contagem que falhou virava "0".
- **Onde o silêncio escondia dano, não só tela vazia** (achados na troca):
  - travas que LIBERAVAM quando a contagem falhava: `deleteRole` (apagava
    cargo em uso), `cancelTreatmentPlan`, `proposeTreatmentPlan`;
  - estoque: `finishSession` e os três ajustes do admin gravavam o movimento
    sobre um saldo 0 inventado quando a leitura falhava;
  - `opcoesDeVinculoDoNumero`: lista vazia → salvar desligaria todo mundo do
    número;
  - `set_user_claims` solto: membro sem rede no JWT, e a RLS depende dela;
  - reordenar funis e etapas dizia "salvo" e voltava na próxima carga;
  - layout da rede: consulta falhando parecia "onboarding não feito" e mandava
    o admin para `/setup`; Cargos mostrava o cargo sem permissão nenhuma, e
    salvar gravaria isso por cima;
  - sessão de atendimento: falha virava 404;
  - cron de estoque mínimo reenviaria o mesmo aviso a cada passada;
  - busca da extensão: "nenhum cliente" levava a cadastrar de novo;
  - portal do cliente: a unidade era buscada só pelo slug (não é único entre
    redes); agora dentro da rede da ficha do cliente.
- Conferido antes de trocar: as 229 colunas dos selects que passaram a lançar
  existem, e os 24 selects com embed foram aceitos pelo PostgREST — nenhuma
  página passa a cair por schema.
- **"Pacote adquirido" volta ao histórico do cliente**: o select não trazia
  `purchased_at`.
- **Dashboard da rede**: faixa etária, top 5 cidades, clientes e LTV por CEP
  (mapa de calor) e o giro de estoque saem de `metrics_demografia` e
  `metrics_giro_estoque` (migration `20260927000009`). Eram contados em JS
  sobre a base inteira e cortados em 1000. O LTV por CEP reaproveita
  `metrics_top_clients` — a mesma regra do dinheiro, não uma segunda cópia.

Regressão completa: 227 E2E passaram, 2 pulados. Dois intermitentes eram do
TESTE e foram corrigidos: `fase5-cliente` pedia `?tab=dados` (a ficha lê
`?aba=`) e clicava na aba depois de um `isVisible()` que não espera;
`planejamentos-mobile` estourava os 5 s da espera no bloco mais carregado.

~~**Ainda contam em JS**: sessões por procedimento, clientes inativos do
dashboard da unidade e os relatórios.~~ Resolvido na entrada acima.

### 2026-09-27 — Lint zerado no apps/web (e o que o `any` escondia)

"Corrige todos erros de lint." Eram 342 erros e 108 avisos em 105 arquivos:
215 `any`, 85 variáveis sem uso e ~100 das regras do React Compiler
(`set-state-in-effect`, `refs`, `static-components`, `purity`,
`immutability`). Agora: **zero erros, zero avisos, e nenhum `eslint-disable`**
— os 13 que existiam (10 em `components/admin`, 3 em `components/branch`)
foram resolvidos de verdade, não recolocados.

- `any` virou o tipo do que o `select` pede (linhas do Supabase) ou do que o
  código lê (payload da Meta, uazapi, Google Ads — `unknown` + interface
  mínima, sem mudar o runtime).
- As regras de efeito foram resolvidas pela forma que o React recomenda:
  estado derivado calculado no render, reset "ao mudar a prop" durante o
  render, `setState` síncrono movido para o handler, `useEffectEvent` para
  callbacks do pai, `useSyncExternalStore` para relógio e `localStorage`.
  Resposta atrasada de busca passou a ser descartada em vários painéis.

**Defeitos que a tipagem revelou, corrigidos:**
- `/admin/branches/<id>` **quebrava sempre**: pedia `users.role`, coluna que
  não existe desde os cargos dinâmicos (42703).
- A tabela de atribuição do marketing dizia "Lead" em toda linha: a etapa
  nunca vinha no select.
- Em Configurações → Integrações o `SectionCard` era declarado dentro do
  componente: a cada render do pai o formulário aberto remontava e **perdia o
  que estava digitado**.
- Resposta de uma conversa já trocada ainda era aplicada no card do inbox.
- Consultas que descartavam o erro nos financeiros e estoques passaram a `ler`.
- `is_evaluation` e o rótulo "Avaliação" (entidade extinta em 25/09) saíram.
- Portal do cliente: a etiqueta "React ✓" fixa no canto e a faixa
  "React / Taps / Step" no topo do agendamento eram diagnóstico de julho
  ("remove after debugging") e apareciam para o cliente final. Removidas.

**Anotado, não corrigido** (fora de lint; entram numa próxima frente):
- "Pacote adquirido" nunca aparece no histórico do cliente:
  `getCachedClientProfileData` não traz `purchased_at` de `client_packages`.
- Erro de consulta ainda descartado em `configuracoes.tsx`, no dashboard da
  rede (7 consultas), na sessão de atendimento (falha vira 404), na agenda da
  rede, nos relatórios, em `oportunidades-do-cliente`, `buscarOportunidades`,
  `getCampaign` e `previewAudience`.
- O dashboard da rede soma a demografia em JS sobre todos os clientes — trunca
  em 1000 (§13.1).

Regressão: 226 E2E passaram na rodada completa; o único que falhou
(`planejamentos-mobile`, espera de 5 s no bloco mais carregado) passou sozinho
e em 2 repetições com os outros de planejamento. Vitest 378/378.

### 2026-09-27 — Frente 7: a mensagem que sai, e três ações que nunca funcionaram

"Corrige os erros de lint e segue para P5." Os 10 erros de lint da frente 6
foram corrigidos antes (`33f2f5f`).

**Uma uazapi falsa para o envio rodar inteiro** (`e2e/apoio/uazapi-falsa.ts`).
A caixa de teste apontava para `https://e2e.invalido`: todo envio falhava na
rede, e o caminho de SUCESSO nunca tinha rodado num teste. Agora a caixa
`[e2e]` aponta para um servidor em `127.0.0.1`, o app faz tudo de verdade e o
teste lê o que teria saído. Nada chega a ninguém.

**Inbox** (`e2e/mensagens-saida.spec.ts`): envio pela caixa da conversa com o
token dela e o id do provedor gravado; falha do provedor fica `failed` na
conversa; edição sai pela caixa que enviou e troca o id; conversa encerrada e
janela de 24h fechada (oficial) recusam antes de gravar e de chamar o provedor.

**Automação** — uma mensagem chega pelo webhook de verdade, e a automação
responde pela caixa falsa, move o card, define o responsável, anota e marca
ganho. As quatro ações de CRM nunca tinham rodado num teste, e **duas estavam
quebradas**, provadas com o código antigo:
- **Nenhuma ação de CRM funcionava num fluxo de "mensagem recebida"** — o
  gatilho mais comum de CRM. O evento de conversa não carrega `leadId`, e o
  contexto só procurava a oportunidade no evento: mover etapa, desfecho,
  responsável e anotar terminavam sempre em "este fluxo não tem oportunidade",
  sem erro. O editor oferecia as quatro. Agora a oportunidade vem da conversa
  (a ligada a ela, senão a aberta mais recente da pessoa).
- **"Marcar como ganho/perdido" nunca achou etapa**: o node guarda `ganho` e o
  banco, `WON`. Terminava sempre em `Este funil não tem etapa de "ganho"`.

**Campanha de aniversário nunca enviou** (`e2e/campanha-aniversario.spec.ts`,
pelo cron de verdade). Tipar o cron (lint) expôs: o select não trazia
`birth_date` e a lista de aniversariantes saía sempre vazia; com a coluna,
`new Date('1990-09-27')` em São Paulo é dia 26 — iria na véspera. Corrigido,
com as janelas de dia pelos helpers de fuso e o erro da consulta não mais
descartado. Nenhuma campanha automática existe no banco hoje, então nada muda
em produção até alguém criar uma. Isolado numa unidade `[e2e]`.

**Lint**: os 19 erros de `any` dos três webhooks e do cron de campanhas
viraram tipos do que cada rota lê.

**Fica para depois** (feito na Frente 7b): envio de template e de mídia,
entrada pelo webhook da Meta (Instagram/Messenger), crons `eventos-expirados` e
`meta-capi`.

### 2026-09-27 — Frente 6: o portal do cliente, entrando como cliente

Até aqui nenhum teste entrava no portal como o cliente final
(`e2e/portal-cliente.spec.ts`, 5 casos). O profissional do teste é um membro
`[e2e]`, para o horário não cair na agenda de ninguém de verdade.

**Agendar sozinho tinha quatro furos**, todos provados com o código antigo.
`createClientAppointment` é endpoint público e confiava no que chegava:
- **unidade de outra rede**: o cliente marcava na agenda de outra clínica (a
  action vizinha, a dos horários livres, já conferia a rede — esta não);
- **procedimento inativo** (e de outra unidade da rede) aceito;
- **qualquer instante**: no passado, de madrugada, fora da grade de 30 min. A
  única guarda era o conflito com outro agendamento.
Agora a action confere o mesmo que a tela oferece: a rede é a da ficha do
cliente, o procedimento é ativo, do app e do catálogo da unidade, e o horário
tem de ser futuro e estar entre os livres de `computeAvailableSlots` — que já
desconta os ocupados. E o agendamento nasce `CLIENT_APP`: gravava `ONLINE`, o
valor do agendamento público descartado (§9.1).

**O pagamento do plano não aparecia para o cliente.** Financeiro e histórico
do portal filtravam pelo cliente do AGENDAMENTO; o checkout de plano grava sem
agendamento (6 lançamentos assim no banco hoje). Passaram a filtrar pela ficha.
As consultas de início e histórico descartavam o `error` — agora `ler`.

Coberto também: confirmar e avaliar o atendimento pela tela (uma vez só, e
outro cliente não confirma o alheio, nem pela tela nem pela action) e o perfil
gravando.

### 2026-09-27 — Frente 5: autorização — cada action e cada rota de API por si

"Faz a regressão e segue." Regressão da frente 4 verde (196 E2E, 378 Vitest,
banco sem sobra `[e2e]`); esta frente é o P3 da varredura.

**Matriz de permissões nas actions** (`e2e/permissoes-acoes.spec.ts`). Uma
action por módulo que escreve — procedimentos, equipe, automações, marketing,
fichas, clientes, configurações (número padrão e unidade), agenda, caixa,
estoque, CRM, prontuário, cargos —, chamada DIRETO pelo id, sem a tela, por
dois membros: um sem módulo nenhum e um que só VÊ tudo. O que se confere é o
banco: o registro alvo não muda.
- **Cada caso tem controle**: o admin faz a mesma chamada no fim e ela tem de
  gravar. Sem isso, dois casos passavam à toa — o status da automação era em
  maiúsculas e a ficha sem campo é recusada pela validação; os dois "não
  mudavam nada" por argumento errado, não pela permissão. O número padrão é o
  único sem controle: torná-lo padrão tiraria o padrão da caixa real.
- Provado tirando o `assertPermission` de `toggleClientStatus`: o membro sem
  módulo desativou o cliente. **A RLS não segurou** — ela recorta por rede, não
  por módulo. A trava da action é a única.
- Novo apoio `e2e/apoio/acao-direta.ts`: acha o id da action no manifesto do
  `next dev` e posta como a pessoa logada. Só argumentos JSON; action de
  `FormData` continua por `apoio/acao.ts` (capturar e reenviar).

**Rotas de API sem credencial** (`e2e/api-sem-credencial.spec.ts`). `/api/*`
é público no proxy, então cada rota se defende sozinha: os seis crons recusam
sem o `CRON_SECRET` e com um errado; as seis rotas da extensão recusam sem
Bearer, com Bearer falso e sem o módulo; o webhook da Meta recusa verify token
e assinatura errados; o oficial do WhatsApp confere o HMAC com o segredo DA
CAIXA — assinatura de outro segredo dá 401 e não cria conversa, a certa cria
(controle).
- **Furo: o OAuth da Meta não conferia permissão.** Qualquer membro logado
  (uma recepcionista) começava a conexão e o callback regravava
  `integration_configs` da rede com a conta Meta DELA e `is_active: false` —
  derrubando a integração de anúncios ou de mensagens em uso. Agora início e
  callback pedem `settings: MANAGE`, o mesmo das actions de Configurações; o
  callback confere antes de trocar o código.
- **Furo: `/api/geocode` era proxy aberto.** Sem sessão, qualquer um fazia o
  servidor disparar listas sem limite contra o Nominatim, que bane o IP acima
  de 1 consulta/s — e o IP é o do mapa de calor de toda clínica. Agora pede
  usuário operacional e aceita até 2000 itens.
- Os dois provados com o código antigo.
- Conferido e sem mudança: push, notificações do cliente e do usuário são
  recortadas pela própria pessoa da sessão e não precisam de módulo.

### 2026-09-27 — Frente 4: prontuário e LGPD; e os pendentes da frente 3

"Faz tudo, o que ficou pendente desta frente e da próxima."

**Indicadores com cenário conhecido** (`e2e/indicadores-cenario.spec.ts`).
Uma unidade `[e2e]` na rede real e uma janela em março de 2021 — antes de
qualquer dado real —, onde cada número tem valor escrito à mão: caixa, pendente,
despesa, serviço, agenda, clientes novos, comissões, séries por mês e por dia,
por unidade, rankings, comissões em detalhe, retenção, clientes novos no tempo e
funil. `relatorios-coerencia` só provava que tela e RPC concordam; este prova que
estão certos.
- **Achado:** `metrics_core.new_clients` ignorava o filtro de unidade — na
  visão de uma unidade, contava os clientes novos da REDE, enquanto o gráfico ao
  lado e a quebra por unidade contavam os da unidade. Corrigido (migration
  `20260927000008`, a mesma regra da série; `search_path` fixo junto).

**Receber o plano no atendimento** (`e2e/plano-recebimento.spec.ts`): R$ 300
em aberto → entrada de R$ 100 + 2× (o lançamento antigo zera, parcelas nascem)
→ o saldo à vista (as parcelas saem pagas). **Furo:** o agendamento enviado
junto só serve para o histórico, e qualquer um servia — o histórico de um
atendimento de outra rede ganhava "Plano recebido". Agora tem de ser uma sessão
do plano ou a avaliação que o gerou; provado com o código antigo.

**Prontuário** (`e2e/prontuario.spec.ts`): anamnese geral e ficha do
procedimento (com foto no bucket privado) pela tela do atendimento; documentos
do cliente — anexar, baixar por link assinado, excluir (linha e arquivo).
- **Três furos entre redes**, provados com o código antigo: a anamnese geral
  conferia a unidade e não o cliente (gravava a anamnese de saúde de um
  cliente de outra rede); o documento, idem; a foto subia ANTES de conferir o
  agendamento. Com arquivo no corpo o Playwright não expõe a requisição para
  reenvio — o ataque foi feito como no DevTools: `FormData.append` e o campo
  escondido adulterados na página.
- **Dois defeitos de tela**: o documento anexado **nunca aparecia** sem
  recarregar — a aba copiava a lista para `useState` uma vez e nunca mais olhava
  a nova; e o formulário se fechava chamando `onClose` DURANTE a renderização
  (o "1 Issue" do Next). E o upload só revalidava o portal da unidade, não o
  `/admin`.

**LGPD** (`e2e/lgpd-exportacao.spec.ts`): o cliente pede pelo portal
incluindo o prontuário → o pacote sai na hora SEM a parte clínica (30 dias,
PDF + JSON) → um pedido aberto por cliente, pelo índice → a clínica libera em
Configurações e o pacote é regerado COM o prontuário → o cliente baixa por
link assinado, e outro cliente, reenviando a mesma chamada, não recebe o link
→ o cron recolhe o pedido parado, e responde 401 sem o segredo.
- **Achado:** liberar o prontuário reabre o pedido; se o cliente já tinha outro
  aberto, a tela mostrava o "duplicate key" cru. Agora diz o motivo.

**Apoio:** `acao.ts` trata o corpo como bytes (latin1) — com arquivo, o
`postData()` vinha vazio; a limpeza de cliente apaga também os ARQUIVOS no
Storage (documentos e pacotes LGPD), não só as linhas.

### 2026-09-27 — Frente 3b/3c: as regras decididas e os fluxos de dinheiro testados

**3b — as três regras que o Heitor decidiu:**

- **Crédito interno desconta e trava** (migration `20260927000006`). Gatilho
  `trg_credito_interno_uso`: receita que vira paga com `INTERNAL_CREDIT` trava
  o saldo do cliente (lock), recusa sem saldo — o pagamento inteiro falha — e
  grava o uso como linha NEGATIVA com o `transaction_id`. Gatilho, e não código,
  porque receita paga nasce em cinco lugares. Estornar um pagamento feito com
  crédito devolve o crédito. A ficha mostra o sinal de cada linha.
- **Insumo faltando avisa e deixa concluir**: o saldo fica NEGATIVO (era travado
  em 0 e a falta sumia) e o modal de finalizar mostra o que faltou antes de
  fechar. De brinde, `finishSession` passou a conferir que o insumo recebido do
  navegador é da rede.
- **Sessão de pacote não é cobrada de novo**: `confirmPayment` recusa sessão de
  pacote e de plano no SERVIDOR (antes só a tela escondia o botão, e só para
  plano), e a tela esconde o botão para pacote também.

**Dois defeitos achados escrevendo os testes:**

- **Estornar o pagamento de um atendimento falhava sempre.** A contra-transação
  copiava `appointment_id`, e `financial_transactions` tem UNIQUE nele (23505).
  Ela não leva mais o agendamento.
- **A transferência de estoque nunca funcionou**: gravava a coluna `reference`,
  que não existia (PGRST204, "Não consegui registrar a transferência."). Coluna
  criada (migration `20260927000007`).

**3c — os fluxos, pela tela, pela primeira vez:**

- `atendimento-fechamento.spec.ts`: check-in → iniciar → finalizar (prontuário,
  comissão pela regra específica do procedimento, baixa com saldo −1 e o aviso)
  → pagamento (crédito sem saldo recusado na tela; Pix lança a receita e o
  `pagamento.recebido`) → e a mesma chamada reenviada para uma sessão de pacote
  não cobra.
- `checkout-de-plano.spec.ts`: "Confirmar plano" → termos em papel → entrada
  de R$ 100 + 3× → concluir: plano ACCEPTED, termos SIGNED, entrada paga, saldo
  com 3 parcelas, `plano.aceito` e `pagamento.recebido`. E três reenvios para um
  plano de outra rede. Rodado contra o código de antes da 3a: **criar termos**
  (plantava termos no prontuário alheio) e **assinar termo** (assinava termo
  alheio) falharam — eram furos reais. O **checkout** alheio já era recusado
  por acaso (a leitura das sessões conferia a rede); a conferência nova é trava
  a mais, não conserto.
- `estoque-movimentos.spec.ts`: transferência e ajuste pela tela, 4 eventos
  `estoque.movimentado`, e `estoque.abaixo_do_minimo` disparando na travessia e
  uma vez só — a primeira vez que esse gatilho roda num teste.
- `credito-interno.spec.ts`: desconto, recusa, desconto único, devolução no
  estorno, e o estorno de atendimento funcionando.
- Apoio: `apagarClientes` leva os lançamentos SEM agendamento (os do plano) e
  os planos — senão ficariam órfãos, sem `[e2e]`, contando no faturamento.

**Lacuna de produto registrada, não mexida:** nenhuma rede tem
`loyalty_configs` e não há tela que a crie — o fechamento não dá ponto nenhum.
A fidelidade está, na prática, desligada.

**Ficou para depois nesta frente:** métricas sem teste (despesas, comissões,
retenção, funil, top N), `receberDoPlano` pela tela do atendimento, e os
formatos de payload de `pagamento.*`/`estoque.*`.

### 2026-09-27 — Frente 3a: dinheiro — furos entre redes, estorno e a tela de atendimento

Ao mapear checkout, fechamento de atendimento, crédito e estoque para testá-los,
a varredura achou o furo de sempre — action que recebe um id do navegador e
grava sem conferir de que rede ele é — em mais de dez lugares. Corrigidos:

- **Financeiro:** `createTransactionAdvanced` (o "Novo lançamento") gravava na
  unidade que viesse no formulário, de qualquer rede; e quem é de unidade lançava
  na vizinha. `createTransaction`, sem chamador e sem conferência, saiu.
- **Estoque:** `adminAddStock`, `adminTransferStock`, `adminAdjustStock` e
  `adminUpdateMinStock` — para quem é da rede, produto e unidade de qualquer
  rede passavam (a trava de "fora da sua filial" só alcança gente de unidade).
  Helper `produtoEUnidadesDaRede`; e gente de unidade só transfere a partir da
  própria.
- **Crédito interno:** conferia a unidade e não o cliente.
- **Plano e checkout** (`treatment-plans.ts`): `checkoutTreatmentPlan`,
  `proposeTreatmentPlan`, `createCheckoutConsentTerms` (que também recebia o
  prontuário do navegador — agora tem de ser do cliente do plano),
  `signConsentTerm`, `marcarTermoAssinadoEmPapel`, `saveTreatmentPlan`,
  `generateEvaluationPlan` (este gravava anamnese e prontuário do cliente do
  agendamento recebido) e `getTreatmentPlanDetails`. Helpers `termoDoTenant` e
  `agendamentoDoTenant`, ao lado do `planoDoTenant` que já existia.
- **LGPD:** `processExportRequest` era export de `actions/` — endpoint público
  **sem login** que disparava a montagem do pacote de qualquer pedido. Mudou
  para `lib/lgpd/processar.ts`; só `after()` e o cron o chamam.
- **Agenda:** `getCrmSlots` e `getClientAvailableSlots` respondiam a agenda
  ocupada de qualquer unidade. `saveEvaluationComplaints`, morta e aberta, saiu.

**Estorno** (migration `20260927000005`): `estornar_transacao` passou a
recusar lançamento **não pago** (criava uma contra-transação PAGA — dinheiro
saindo por uma receita que nunca entrou) e o **próprio estorno** (a tela
oferecia "Estornar" na linha do estorno). A tela esconde o botão ali. Junto,
`search_path` fixo e EXECUTE só para o servidor.

**Tela de atendimento:** a lista de procedimentos do editor de plano filtrava
por `is_evaluation`, coluna removida em 25/09. A consulta respondia 42703, o
erro era descartado e o editor ficava **sem procedimento para escolher**. Agora
passa pelo `ler`.

**Provado com o ataque real** (`e2e/acoes-entre-redes.spec.ts`, com a nova
`apoio/outra-rede.ts`): lançamento, entrada de estoque e crédito, cada um feito
pela tela e reenviado apontando para a outra rede. Sem as correções, os três
falharam com o dado gravado lá; com elas, passam. Estorno em
`financeiro-estorno.spec.ts` (+2 recusas e o botão ausente). Os furos de plano e
checkout ganham o mesmo teste na frente 3c, junto com o fluxo de checkout.

**Achado no apoio de teste:** com uma segunda rede no banco, `tenantId()`
(`limit(1)` sem critério) e `filiaisAtivas()` (sem filtro de rede) passavam a
poder devolver a rede de teste. Corrigidos.

**Decisões do Heitor para a 3b:** crédito interno como forma de pagamento
**desconta do saldo e recusa sem saldo**; insumo faltando **avisa e deixa
concluir**, com saldo negativo em vez de zerado; sessão de **pacote não é
cobrada** de novo.

### 2026-09-27 — Frente 2: apoio de teste, varredura de sobras e portais isolados

Segunda frente do plano da varredura de cobertura: dar à suíte o que faltava
para testar alguém que não seja o admin da rede, e parar de sujar a produção.

- **Logins de teste** (`e2e/apoio/sessao.ts`): `criarMembro` com a matriz de
  cargo que o teste descrever, de rede ou de UNIDADE; `clienteComSessao`, o
  cliente final no portal; o SDR de antes virou um caso de `criarMembro`. Cada
  um devolve os cookies, o token (para o PostgREST) e o destino do login.
- **Reenvio de server action** (`e2e/apoio/acao.ts`), extraído do teste de
  oportunidade: capturar a chamada legítima e reenviá-la com outro id.
- **Varredura de sobras** (`e2e/apoio/limpeza.ts`, no `global-setup`). Na
  primeira rodada apagou **78 clientes `[e2e]`** (desde 18/09) e **366
  notificações** que falavam deles no sino da equipe de verdade — provável
  parte das "notificações frequentes e pouco claras" que o Heitor relatou. A
  causa: o `fase2-agenda` fazia `delete` no cliente sem olhar o erro, e a conta
  de fidelidade que nasce junto travava a FK; e apagava de
  `appointment_status_history`, tabela que não existe. Agora a exclusão de
  cliente/agendamento mora num lugar só, na ordem das FKs, e o teste exige
  `falhas = []`. O aviso de cancelamento sai em `after()` e chegava DEPOIS da
  limpeza — o teste agora espera por ele, o que virou também a prova de que
  cancelar avisa a equipe. Nunca toca `automations`.

**Portais isolados** (`e2e/portais-isolamento.spec.ts`, 12 casos): rota
privada sem sessão vai para o login; gente de unidade entra na própria, não na
rede nem em outra unidade, e módulo fora do cargo não abre pela URL; cargo de
rede sem módulos não abre seis telas pela URL; cliente final entra no portal
dele e não em tela nenhuma da equipe.

**Dois achados, corrigidos:**
- O dashboard da UNIDADE era a única tela de `[slug]` sem `assertPermission`
  (de propósito — toda a equipe o vê), e o layout de `[slug]` deixa o cliente
  passar: o cliente final chegava nele e a página quebrava no `tenantId` nulo.
  Não vazava nada, por acidente. Agora manda o cliente para o portal dele.
- **Layout e página renderizam em paralelo**: o `redirect` do layout de
  `/admin` decidia a resposta, mas o dashboard da rede rodava as consultas dele
  mesmo assim, para quem estava sendo mandado embora. Recebeu a mesma trava do
  layout. Regra registrada no CLAUDE.md §6.

### 2026-09-27 — Varredura de cobertura, e a RLS do prontuário que não conferia a rede

O Heitor pediu uma varredura completa do que não é coberto por teste. O mapa
inteiro (actions, lib, telas, rotas, banco, pacotes) e o plano em frentes estão
em `C:\Users\heito\.claude\plans\blz-agora-faz-uma-fluffy-blanket.md`; o resumo
é:

- **Vitest** (25 arquivos, 378 testes) cobre `lib/` puro; nenhum importa
  `actions/` nem handler de `app/api`.
- **E2E** (~55 specs) roda quase sempre como admin da rede. Zero cobertura em:
  checkout de plano, fechamento de atendimento e comissão, prontuário/LGPD,
  portal do cliente final, envio de mensagem (toda saída), webhooks oficial e
  Meta, três crons, portal da filial, `/api/ext/*`, extensão e app nativo.
- **Nenhum teste falava com o banco como usuário** — todos com `service_role`,
  que passa por cima da RLS. Sem CI; o E2E roda contra o banco da produção
  (decisão do Heitor: continuar assim, com varredura de sobras — frente 2).

Ordem decidida: **segurança primeiro**, depois os testes em frentes (dinheiro,
prontuário/LGPD, autorização, portal do cliente, mensagens, CRM, resto).

**Frente 1 — o que a varredura achou no banco, e foi corrigido:**

- As policies de `medical_records`, `medical_record_entries`,
  `anamnesis_data`, `consent_terms`, `record_photos`, `loyalty_accounts` (as
  quatro) e `loyalty_transactions` só exigiam `role <> 'CLIENT'`. **Funcionário
  logado de qualquer rede lia e escrevia o prontuário e os pontos de todas**,
  direto no PostgREST com a anon key. Uma rede só no banco hoje, então sem
  vítima — seria vazamento no dia da segunda clínica. As tabelas não têm
  `tenant_id`; a rede sai da cadeia até o cliente, por quatro helpers em
  `private` (em função, e não em subquery, para não reaplicar a RLS de
  `clients` a cada linha). `USING` e `WITH CHECK`.
- `lead_tags_da_rede`, `eventos_resumo_do_catalogo` e `mark_notification_read`
  eram SECURITY DEFINER e executáveis por `anon` — sem login, lia-se as tags de
  leads e a contagem de eventos de qualquer rede pelo id. Revogadas; os
  chamadores já usavam o cliente de serviço.
- `grant usage on schema private to authenticated`: várias policies já chamavam
  `private.*` sem esse USAGE, e só funcionavam porque a regra permissiva ao
  lado bastava.

**Provado como o atacante faria:** `e2e/rls-isolamento.spec.ts` cria uma
SEGUNDA rede `[e2e]` inteira (unidade, profissional, cliente, atendimento,
prontuário, ficha, foto, termo, pontos) e tenta ler, alterar, apagar e plantar
com o **token de um membro da rede real**. Rodou antes da migration e falhou
(leu o prontuário da outra rede); depois, passa. Controle: o mesmo membro lê o
prontuário `[e2e]` da própria rede. A alteração tentada é sempre válida (coluna
certa, tipo certo) e o teste exige `error` nulo nela — senão "0 linhas" poderia
ser só um erro de coluna.

Conferido e **não** era problema: `set_claim`, `set_client_claims`,
`set_user_claims`, `buscar_clientes`, `cliente_por_telefone` (EXECUTE já
revogado); nenhuma tabela pública com RLS desligada.

**Avisos que sobraram no advisor do Supabase** (não mexidos): funções de
gatilho marcadas como executáveis (não são chamáveis fora de gatilho),
`search_path` mutável nas `metrics_*` e em `estornar_transacao`, proteção
contra senha vazada desligada no Auth, e `client_documents`/`forms` com RLS sem
policy (só o cliente de serviço as lê — intencional).

**Sobra de teste achada:** 78 clientes `[e2e] Cliente agenda …` desde
2026-09-18, deixados pelo `fase2-agenda` — entra na varredura de sobras da
frente 2.

Migration `20260927000004`, aplicada pelo MCP. Regressão: 83 E2E das telas que
leem prontuário, fidelidade, eventos e tags.

### 2026-09-27 — A oportunidade de outro dono também não se mexe pelo id

Continuação da entrada abaixo, pelo outro lado. O funil já recusava mover o
card alheio (`updateLead`, `updateLeadStage`, `deleteLead` filtram pelo dono),
mas cinco actions recebiam o id de uma oportunidade sem conferir de quem era:

- `definirSituacaoOportunidade` — marcar ganha/perdida/reaberta pelo inbox;
- `openLeadConversation` e `createConversationForLead` — abrir, e até CRIAR,
  a conversa do card;
- `createCrmAppointment` — agendar a partir dele (grava o cliente no card);
- `addClient` com `_leadId` — cadastrar cliente a partir dele.

E duas gravavam numa **conversa** recebida pelo id, fora de `actions/inbox.ts`
e por isso fora da rodada anterior: `createCrmAppointment`
(`input.conversationId`) e `addClient` / `cadastrarClienteRapido`
(`_conversationId`). Todas passam agora por `leadAoAlcance`
(`lib/crm/alcance.ts`, a regra do funil: sua ou sem dono) e `conversaAoAlcance`.

Os dois portões passaram a exigir `crm: VIEW`: `addClient` pede
`clients: MANAGE`, e sem isso quem cadastra cliente mexeria em card e conversa
sem ter CRM nenhum.

**Provado com o ataque de verdade:** a SDR marca a oportunidade dela como ganha
pelo painel; o teste captura essa chamada e a reenvia trocando o id pelo da
oportunidade do admin. Com o portão desligado, a do admin vira ganha; com ele,
continua em aberto — e a dela, o controle, vira ganha nos dois casos
(`e2e/crm-alcance-por-id.spec.ts`). Nenhuma rota de `app/api` além dos webhooks
e do cron lê oportunidade ou conversa.

### 2026-09-27 — A conversa escondida da lista também não abre pelo id

As regras de alcance do inbox — o dono do CRM ("só os meus") e as caixas do
cargo — escondiam a conversa da LISTA, mas abrir por id só conferia a rede.
`/admin/inbox?c=<id>` põe a conversa como selecionada mesmo fora da lista, e a
tela chama `getMessages` na hora: a porta estava escondida, não trancada. É o
defeito que o §11 descreve ("filtrar só na renderização deixa o registro
acessível pelo id").

- **`lib/inbox/alcance.ts`**: `alcanceDoDono` e `caixasDoAlcance` saíram de
  `actions/inbox.ts` para cá, junto com o portão `conversaAoAlcance` /
  `mensagemAoAlcance`. Fora do `'use server'` de propósito: exportado de lá, o
  portão seria ele mesmo um endpoint dizendo "existe e você não pode ver".
- **Todas as actions que recebem id de conversa ou mensagem passam pelo
  portão** — ler mensagens e mídia, o card, criar oportunidade, editar o
  contato, responder (texto, anexo, template), editar mensagem, marcar como
  lida, mudar a situação, listar templates e o histórico do contato
  (`getContactEvents`). Fora do alcance, a resposta é a de conversa inexistente.
- A regra que confere uma linha já lida (`passaNoAlcanceDoDono`,
  `passaNasCaixas`) é pura, em `lib/inbox/visibilidade.ts`, e a mesma serve o
  atalho das outras threads — antes eram duas cópias.
- **Achados no caminho:** `getMessages` e `getMessageMediaUrl` não pediam nem
  `crm: VIEW`; e `markConversationRead` marcava as mensagens como lidas só pelo
  id da conversa, sem `tenant_id` — um id de outra rede mexia nas mensagens de
  lá. Os três corrigidos.

**Provado que o teste pega o furo:** com o portão desligado, o E2E novo falha
com o texto da conversa escondida na resposta da server action; com ele, passa.
O teste olha a RESPOSTA, não a tela — a tela não desenha conversa fora da lista,
com ou sem o furo. Casos em `inbox-caixas-do-cargo.spec.ts` (caixas, com o
controle de que a permitida abre) e `inbox-visibilidade.spec.ts` (dono, pela
pessoa). Vitest `tests/inbox-alcance.test.ts` para a regra pura.

### 2026-09-27 — O cargo escolhe quais números vê no inbox (e o renomear que não gravava)

Ligar SDRs a um número decidia por onde elas enviavam, não o que viam. Sobre
restringir a visão ao número de cada uma: "não deve ser fixo, pode ser uma
configuração feita nos cargos".

- **`tenant_roles.inbox_caixas`**: `todas` (padrão — nenhum cargo mudou de
  visão na migração) ou `minhas`. Fica na **linha do CRM da matriz**, porque o
  inbox é do CRM, e salva com "Salvar acessos" como o resto do cargo.
- **"Só as da pessoa"** mostra as conversas dos números a que ela está ligada.
  Sem número ligado, nenhuma de WhatsApp — o erro na outra direção seria o
  vazamento. Instagram e Messenger não têm caixa e passam sempre.
- **Por cargo, não por rede** (como `inbox_visibilidade`): na mesma clínica a
  recepção vê tudo e a SDR vê o número dela.
- **Soma-se ao escopo do CRM.** Com "só os meus leads", as duas regras valem.
- Um helper só, `caixasDoAlcance`, para a lista e para o atalho das outras
  threads — o atalho não pode abrir a thread de um número que a lista esconde.
  Erro ao ler o cargo mostra nada.

**Achado no caminho: renomear cargo nunca gravou.** `tenant_roles` não tinha
policy de UPDATE; pela sessão o `update` atingia zero linhas sem erro, e a tela
fechava o campo como se tivesse salvo. Apareceu porque gravar `inbox_caixas`
confere a linha devolvida. Policy nova no molde da de DELETE (rede, própria
rede, nunca cargo de sistema), `updateRole` passou a conferir a linha e o
cartão de renomear passou a mostrar o erro.

~~Em aberto: as regras de alcance filtravam só a LISTA, não a leitura por id.~~
Fechado na entrada seguinte.

Migrations `20260927000002` (coluna) e `20260927000003` (policy), aplicadas
pelo MCP. E2E `inbox-caixas-do-cargo.spec.ts`: número dela sim, o outro não e
Instagram sempre; sem número, nenhum WhatsApp; "todas" vê tudo; a escolha
grava pela tela; renomear grava.

### 2026-09-27 — Um número de WhatsApp, várias pessoas falando por ele

"Hoje um número já pode ser atribuído a alguém da equipe, mas quero que possa
ser atribuído a várias pessoas. A clínica pode ter apenas um número de
atendimento, mas ligar ele a 3 SDRs e as 3 atenderem por ele." Era exatamente o
caso da clínica única que o modelo não cobria: `whatsapp_numbers.user_id` dava
uma pessoa por número.

- **Tabela de junção `whatsapp_number_users`**, não um `uuid[]` no número:
  continua valendo **uma pessoa, um número** (`unique (user_id)`), e índice
  nenhum proíbe o mesmo id em dois arrays. Sem essa trava, "por onde ela
  responde" viraria desempate de novo.
- **Mesma rede garantida pelo banco:** as duas chaves estrangeiras são
  compostas com `tenant_id`. Antes a action gravava o `user_id` que recebesse,
  sem conferir se a pessoa era da rede — endpoint público, id de fora (§9.8.0).
- **Uma transação só** (`definir_vinculos_do_numero`): nome, unidade e pessoas
  são duas tabelas, e falhar nas pessoas depois de gravar o nome deixaria a tela
  dizendo "erro" com metade salva. O E2E confere que o nome NÃO fica.
- **A escolha de saída não mudou de regra**, só de pergunta: "o número dele" é
  o número cuja lista o contém (`userIds.includes`).
- **Na tela**, "Quem fala por ele" virou selos removíveis + o seletor múltiplo
  de sempre. Quem já fala por outro número aparece com o nome dele ("· em
  Comercial"), e salvar assim é recusado dizendo quem e onde.
- `whatsapp_numbers.user_id` ficou no banco como LEGADO (ninguém lia nem escrevia;
  não havia nenhum vínculo gravado). **Saiu em 2026-09-28** (migration
  `20260928000010`). (`conversations.tags`
  ficou: é semente, ver 2026-09-28.)

Migration `20260927000001`, aplicada pelo MCP. E2E: três casos novos em
`whatsapp-numeros-modelagem.spec.ts` (várias pessoas; uma pessoa, um número, sem
salvar metade; pessoa de outra rede — este pula no dev, que tem uma rede só) e
um em `whatsapp-numeros-tela.spec.ts` (escolher duas pessoas pela tela).

### 2026-09-27 — No celular, o card do contato abre puxando o cabeçalho

"Em uma conversa do inbox, em vez de clicar no ícone, arrastar a parte superior
para baixo abre as opções. Coloque uma setinha para indicar que pode ser
expandido." O botão com o ícone de pessoa saiu; no lugar dele, uma seta para
baixo ao lado da situação.

- **Puxar o cabeçalho para baixo** revela a folha de cima para baixo, seguindo
  o dedo; soltar depois de 64px completa, antes disso ela volta. Menos de 8px é
  toque — o voltar e a situação continuam clicáveis.
- **Puxar a barra "Contato" para cima fecha**, e o ✕ dela virou uma seta para
  cima: o caminho de volta tem de parecer o mesmo gesto ao contrário.
- **A seta continua sendo botão.** O gesto é atalho; quem só toca (ou usa
  leitor de tela, que ganhou `aria-expanded`) abre do mesmo jeito, e a folha
  desce igual (`@starting-style`).
- É `clip-path`, não `translate`: transladada para cima a folha passaria por
  cima da topbar. E o cabeçalho leva `touch-action: none` — sem isso o Chrome
  do Android lê "puxar para baixo no topo" como atualizar a página.

`e2e/inbox-cabecalho-mobile.spec.ts` ganhou o caso: puxão curto não abre,
puxão longo abre, puxar a barra para cima fecha.

### 2026-09-26 — A fila volta a ser de conversas

A fila por pessoa (entrada "A fila do inbox é de PESSOAS", abaixo) durou um dia.
O Heitor abriu um caso real — a mesma pessoa no WhatsApp e no Instagram — e
achou confuso: a linha única escondia em qual conversa o clique cairia, e chegar
à outra dependia do atalho do painel. "Prefiro que cada conversa apareça na
fila."

Voltou a ser uma linha por conversa: não lidas, espera e canal de cada uma. O
que se acrescentou foi o **nome da caixa na linha**, quando a rede fala por mais
de um número — sem ele, a mesma pessoa em duas caixas do WhatsApp seriam duas
linhas idênticas.

**O resto da frente fica**, porque não depende da fila: a oportunidade, as tags e
o histórico continuam sendo da pessoa, o painel continua mostrando as outras
conversas dela, e a visibilidade com escopo OWN continua seguindo a pessoa. A
pessoa une as conversas no PAINEL, não na fila.

Saíram `agruparPorPessoa`/`canaisDaLinha` e os testes deles.
`inbox-lista-por-conversa` confere as duas linhas, a caixa em cada uma e que o
clique abre a conversa daquela linha — olhando só a área de mensagens, porque a
prévia da lista tem o mesmo texto e passaria com a conversa errada aberta.

### 2026-09-26 — Com "só os próprios leads", o inbox segue a pessoa (ou a conversa)

Fecha o que ficou de fora na entrada abaixo. Com escopo OWN no CRM, cada thread
aparecia conforme a oportunidade ligada a ELA — e com várias threads por pessoa
isso vazava e escondia ao mesmo tempo: a thread nova da unidade, sem
oportunidade, aparecia para qualquer SDR, mesmo a pessoa sendo de outro; e se
outro SDR abrisse negócio nela, sumia para quem já negociava com a pessoa.

A recomendação foi seguir a pessoa. O Heitor aprovou e pediu que fosse
**configurável pela clínica**: `tenants.inbox_visibilidade`, na aba Cargos
(logo abaixo da matriz, porque refina o escopo "só os meus" que se escolhe
nela), com `roles: MANAGE`. O padrão é "pela pessoa".

- **Pela pessoa:** tem oportunidade sua → todas as threads dela; só de outros
  donos → nenhuma; nenhuma oportunidade → todo mundo. Com isso o handoff
  funciona também para cargos OWN, o que antes exigia escopo ALL.
- **Pela conversa:** o comportamento de antes, intacto.

A regra mora num lugar só (`alcanceDoDono`), para a lista e os atalhos das
outras threads não divergirem. Quem fica escondido é conta do banco
(`contatos_ocultos_do_dono`, executável só pela service role), porque a versão
em JavaScript precisava ler todos os leads com dono — e a partir de 1000 a
pessoa de outro SDR voltaria a aparecer em silêncio.

**O teste é o primeiro da suíte que entra como alguém que NÃO é admin.**
`e2e/apoio/sessao.ts` cria um cargo com CRM em OWN, um membro e a sessão dele
pelo mesmo magic link do setup. Sem isso nenhuma regra de alcance pode ser
provada: como admin, a tela abre de qualquer jeito. `inbox-visibilidade` confere
os dois modos, com uma pessoa sem oportunidade como controle, e a tela gravando
a escolha.

### 2026-09-26 — A oportunidade é da pessoa (e o cadastro manual ganha uma)

Quinto e último passo da ordem combinada para o contato separado da conversa.

`leads.conversation_id` é singular, e prendia o card na thread onde ele NASCEU.
No handoff — o lead entra pelo número do marketing, a unidade assume por outro —,
quem abria a thread da unidade via "nenhuma oportunidade" para a pessoa que
estava atendendo, o filtro de funil do inbox não a achava pela conversa viva, e
o card do quadro mostrava a atividade da conversa que já tinha parado.

Agora a dona é `leads.contato_id` (NOT NULL). `conversation_id` fica, com o
sentido que sempre teve na prática: a thread de origem. Passaram a ler pela
pessoa a lista do inbox (dono, etapa e funil), o card do contato, o histórico,
a checagem de duplicata ao abrir oportunidade e a propagação de nome e telefone.
O card do quadro mostra a última mensagem em QUALQUER thread da pessoa e a
espera mais antiga entre elas (`lib/crm/atividade-da-pessoa.ts`), e o clique
nele abre a thread mais recente da pessoa, não a de origem.

**E um furo que não tinha aparecido:** `createLead`, o cadastro manual em
Oportunidades, nunca gravou `conversation_id`. Desde 2026-09-17 todo lead
criado por lá nasceria sem pessoa — fora do card do contato, fora dos filtros
do inbox. Só não aconteceu porque ninguém criou lead por lá desde então (0 de 25
sem conversa, medido antes).

Por isso o dono vem de **gatilho** (`trg_oportunidade_ganha_contato`), como a
pessoa da conversa: a da thread de origem, senão a do telefone (só dígitos, o
formato do webhook), senão uma nova. Quando essa pessoa escreve depois pelo
WhatsApp, a thread cai nela. O gatilho da conversa também passou a somar os
aliases quando a thread nasce com dono definido — `openLeadConversation` agora
cria assim, e sem isso a invariante `contact_aliases ⊆ identifiers` quebraria.

`on delete restrict`: pessoa com oportunidade não se apaga.

**O que ficou de fora, de propósito:** com escopo OWN, a visibilidade das threads
no inbox continuava sendo por `conversations.lead_id` (a thread). Mudar isso
muda quem vê o quê — foi levado ao Heitor e resolvido na entrada acima.

`oportunidade-da-pessoa` confere os dois casos: o card do marketing aparece na
thread da unidade, e o lead sem conversa ganha pessoa que o webhook reencontra.

### 2026-09-26 — As tags vão para a pessoa; a atribuição fica (e por quê)

Quarto passo do contato separado da conversa — o primeiro em que um campo de fato
sai de `conversations`.

**As tags moraram no lugar errado desde sempre**, e o próprio código dizia:
`conversations.tags` tinha o comentário "Tags do CONTATO: descrevem a pessoa, não
o negócio". Ficavam ali por falta de lugar. Com vários números deixou de ser só
feio — a mesma pessoa tinha DUAS listas, e marcar "botox" atendendo pela recepção
não aparecia para quem abria a thread do marketing.

Agora são de `contacts`. `conversations.tags` sobrevive como **semente**: escrita
uma vez no nascimento da thread (é de onde vêm as tags derivadas da origem), lida
pelo gatilho que a leva à pessoa, nunca lida pelo app. Sai numa migration própria
depois do soak, como as linhas de `integration_configs`.

**A atribuição do anúncio NÃO mudou de casa**, e o plano dizia que mudaria. Ao
olhar o que o dado significa, ela é da THREAD: `marcarAnuncioNaConversa` a
reescreve quando a pessoa volta por outro anúncio, ou seja, ela aponta para o
último anúncio *daquele* retorno. O que seria do contato é a PRIMEIRA origem — e
isso é um dado novo, não uma mudança de casa. Coluna que ninguém lê apodrece, e
por isso não entrou.

**Mas a atribuição tinha um defeito que os múltiplos números criaram.** Três
lugares procuravam "o anúncio deste cliente" na conversa MAIS RECENTE dele — dois
gatilhos do banco e `lib/ads/atribuicao.ts`. Com uma conversa por pessoa dava no
mesmo; com várias, a mais recente é a do atendimento, que não tem anúncio nenhum.
Resultado: `on_transaction_paid` mandava a compra para a API de Conversões da Meta
com `ad_id` nulo — **ROI da campanha menor do que é, e nada no sistema acusando**.
Passou a procurar a mais recente QUE TENHA anúncio, o que é melhor também no caso
de uma thread só.

**E um defeito meu, grave, que só o teste pegou.** A primeira versão do gatilho
declarava uma variável plpgsql chamada `tags` — e `contacts.tags` é coluna. No
`update`, a referência ficava ambígua (`42702`), o gatilho levantava, **o INSERT
da conversa falhava e a mensagem do cliente era descartada**. E só no ramo de
quem já tem contato, que é exatamente o caso que esta frente existe para
suportar. Sem efeito real: com uma caixa ativa, quem escreve de novo encontra a
conversa existente e nunca chega a esse ramo. As colunas do `update` agora são
qualificadas (`c.tags`) para isso não poder voltar calado.

`contato-tags-da-pessoa` confere as duas coisas: a tag marcada vale nas duas
threads, e a busca por tag encontra a pessoa.

**E a suíte voltou a caber.** `automacoes-anel` reprovava em toda rodada completa
e consumiu até os 300s que eu havia lhe dado. O diagnóstico anterior estava
errado: as automações já eram montadas no banco. A causa é que ele é o primeiro
teste (ordem alfabética) a abrir `/admin/clients/[id]`, e pagava a primeira
compilação de uma página pesada **dentro** do próprio limite, com o dev server
disputado. O preparo e o aquecimento da rota foram para `beforeAll`, que tem
orçamento próprio. A suíte caiu de 12,3 para 7,4 minutos, e 136 de 136 passam.

### 2026-09-26 — A fila do inbox é de PESSOAS (e um defeito real no motor)

> **Desfeito no mesmo dia** — ver "A fila volta a ser de conversas", acima. A
> correção do motor, no fim desta entrada, continua valendo.

Terceiro passo do contato separado da conversa.

A mesma pessoa falando com duas caixas ocupava **duas linhas** na fila,
competindo consigo mesma por atenção. Agora é uma linha: as não lidas somam, a
espera mostrada é a **mais antiga** das threads (a que dói — a mais recente
esconderia o atendimento parado há dois dias), os ícones de canal aparecem um
por canal distinto, e um "2 conversas" avisa que há histórico em outro lugar
antes de abrir. Clicar abre a thread de atividade mais recente; se alguma já
estiver aberta, fica nela.

**Mudei de ideia sobre uma coisa que eu tinha prometido.** Eu havia descrito a
lista por pessoa com as mensagens INTERCALADAS das threads. Não fiz, e acho que
o intercalado está errado: as threads são separadas de verdade no celular do
cliente, com notificação e janela de 24h próprias. Um histórico misturado
mostraria uma conversa que não existe do lado dele — e responder "como
combinamos ontem" na thread errada é pior que um clique a mais. Ficou **pessoa
como unidade de navegação, thread como unidade de conversa**.

O agrupamento é função pura em `lib/inbox/lista.ts`, com 10 testes de unidade:
os erros dele (somar não lidas errado, esconder a espera mais antiga, fundir
pessoas diferentes) não dão erro nenhum na tela, só um número errado. O filtro
continua por thread e o agrupamento vem depois — inverter esconderia a pessoa
cuja thread relevante passou no filtro só porque a principal dela não passou.

**E o defeito de verdade, que apareceu de lado.** Depois de eu subir o orçamento
de `automacoes-anel`, a suíte acusou `automacoes-tempo` com
`acao.notificar_equipe` **duas vezes** no traço — e ele passava sozinho. Não era
lentidão: `retomarPendentes` selecionava os runs prontos e executava **sem
reivindicar a linha**. Duas passagens concorrentes do cron pegavam o mesmo run e
rodavam os passos dele duas vezes. Num aviso é ruído; numa ação de mensagem é o
**cliente recebendo a mesma coisa duas vezes**.

E isso é alcançável em produção: o serviço roda de 5 em 5 minutos, e uma
passagem com fila grande passa disso.

A correção é um compare-and-swap em `tentativas`, que já era incrementado antes
de executar — quem escreve primeiro leva. É o mesmo idioma que `dispararAgendas`,
vinte linhas abaixo, já usava para `ultimo_disparo_agenda`: só `retomarPendentes`
estava sem. `automacoes-cron-concorrente` dispara duas passagens em paralelo e
confere o traço; conferi que ele reprova com a trava removida.

Duas coisas que esse teste ensinou, e ficaram nos comentários dele: contar
notificações não mede execução (`notificar_equipe` cria uma por destinatário —
oito avisos eram uma execução com oito interessados), e um grafo escrito à mão
com `proximos` em vez de `ligacoes` faz o motor quebrar e o teste passar mesmo
assim, medindo um motor parado.

134 de 134 E2E e 381 unitários — a suíte inteira verde pela primeira vez nesta
sequência.

### 2026-09-26 — O cruzamento: quem assume o atendimento alcança a outra thread

Segundo passo do contato separado da conversa, e o primeiro que se vê na tela.

O cenário é o que o Heitor descreveu: o lead entra pelo número de marketing,
alguém qualifica e agenda numa unidade, a unidade assume por **outro** número. Do
lado do cliente são duas conversas — então aqui também são —, e quem abria a
segunda não via nada da primeira. Exatamente no momento em que ler o histórico é
o que mais importa.

`getConversationCard` passou a devolver `outrasThreads`, e o painel do inbox as
mostra na seção do **contato**, não na das oportunidades: é sobre a pessoa. Cada
linha diz onde foi (o rótulo da caixa, ou o canal quando não há caixa), quando
foi, se está encerrada e quantas não lidas — a contagem é o único elemento
preenchido em `--brand`, que é hierarquia por preenchimento no tamanho de uma
lista. Clicar abre aquela thread, e de lá o atalho aponta de volta: é cruzamento,
não link de mão única.

**Respeita o `ownerFilter` do CRM**, igual à lista do inbox. Com escopo OWN, a
thread de um lead de outra pessoa continua invisível — abrir exceção ali seria
furar, por uma tela, a regra que vale na tela ao lado. Rede que quer o handoff
funcionando usa escopo ALL, que é o padrão. Thread sem oportunidade aparece para
todo mundo, pela mesma razão que a lista já usa: "contato que ainda não virou
card fica no bolo comum".

E o bloco **não aparece** quando a pessoa tem uma thread só, que é a maioria:
seção vazia com título ocupa espaço para não dizer nada. `contato-cruza-threads`
confere as duas coisas — o atalho no handoff e a ausência dele no caso comum.

131 de 131 E2E e 371 unitários.

### 2026-09-26 — A conversa deixa de ser o registro do contato (espinha)

Saiu de uma conversa em que o Heitor foi reformulando o desenho, e eu errei duas
vezes antes de chegar: primeiro propus número por pessoa (`user_id` na caixa),
depois propus compartimentar o acesso por caixa e por unidade. As duas estavam
erradas pelo mesmo motivo — eu estava desenhando o fluxo de **uma** clínica
dentro de um produto multitenant. Ele cortou: *"não é uma questão de caixa, é uma
questão de liberdade"*, e depois apontou a saída: *"conversa deixa de ser o
registro do contato. Um contato, do mesmo jeito que pode ter mais de uma
oportunidade, pode ter mais de uma conversa."*

**O problema que nenhuma das minhas propostas resolvia.** `conversations` era as
duas coisas — a THREAD e a PESSOA. Com vários números o dedup passou a incluir a
caixa (de propósito: no celular do cliente são duas conversas mesmo), então a
mesma pessoa falando com duas caixas virava **duas fichas de contato**: dois
nomes, duas listas de tags, duas atribuições de anúncio. E
`leads.conversation_id` é singular, logo o card ficava preso numa delas enquanto
o atendimento acontecia na outra.

O buraco aparece exatamente no cenário que ele descreveu: lead entra pelo número
de marketing, a SDR qualifica e agenda numa unidade, a unidade assume por outro
número. É o momento em que ler o histórico é o que mais importa. **E já
acontecia antes** — entre Instagram e WhatsApp a mesma pessoa sempre foram duas
conversas. Os múltiplos números só transformaram um caso raro em rotina.

**O momento era agora, e não se repete.** Medido antes de escrever qualquer
coisa: 61 conversas, 61 pessoas distintas, **zero** pares com identificador em
comum. A migração é 1:1, sem uma única decisão de fusão. Isso acabaria no
primeiro handoff com dois números no ar, quando migrar passaria a exigir
julgamento caso a caso.

A migration **para** se a premissa não valer, em vez de adivinhar: um bloco que
levanta exceção se houver conversas com alias cruzado. Escrever a lógica de
agrupamento agora seria pior — código não exercitado rodando numa migration.

**A ligação é feita por GATILHO, e isso foi uma correção de rumo no meio.** A
primeira versão ligava no TypeScript, em cada um dos três pontos que criam
conversa. Escrevi o módulo, liguei os três, e percebi o vão: os dois pontos do
CRM não são exercitados por nenhum teste, então um deles desligado passaria em
branco e a coluna nasceria certa e apodreceria. Movi para
`trg_conversa_ganha_contato` (+ `trg_contato_aprende`), pelo mesmo argumento que
já pôs `pagamento.*` e `estoque.*` em gatilho: *"esses fatos nascem em cinco ou
seis lugares do código e instrumentar um a um é garantir esquecer o próximo"*.

O módulo TypeScript foi apagado inteiro, e o código de aplicação ficou com
**uma** mudança: um comentário que estava errado. De brinde, o gatilho é mais
seguro que a versão em código — confirmei empiricamente que o contato criado por
ele é desfeito junto quando o insert da conversa colide no `23505`, enquanto a
versão em TypeScript exigia cuidado manual com a ordem.

**Nenhum leitor mudou.** Nome, telefone e tags continuam saindo da conversa,
exatamente como antes. A espinha existe para a pessoa ser joinável; os campos
saem de lá um por vez, e cada um só quando já houver quem leia do contato.

**Uma asserção minha estava errada e a suíte provou.** `contato-espinha` tinha
uma quarta verificação — "nenhuma pessoa sem thread" — que passava isolada e
reprovava na suíte inteira. Não era invariante: cinco specs apagavam a conversa
que criaram sem saber que o gatilho havia criado um contato. Higiene de teste
disfarçada de invariante. A asserção saiu (em produção conversa não se apaga, e
órfão não faz mal; o que faz mal é pessoa duplicada, que é outra asserção), e a
higiene virou `apagarConversas()` em `e2e/apoio/banco.ts` — um lugar só, para o
próximo spec não precisar lembrar do próximo item.

128 de 129 E2E e 371 unitários. O vermelho é `automacoes-anel`, que estoura o
orçamento dele sob carga da suíte e passa isolado em 35s.

### 2026-09-26 — Vários números de WhatsApp: a tela, a escapatória e os templates

Fecha o que a fundação (entrada abaixo) tinha deixado em aberto.

**O passo irreversível foi dado.** Os dois índices únicos antigos de
`conversations` saíram, e os quatro parciais por caixa ficaram sozinhos. É o que
destrava a coisa que o sistema não sabia fazer: o **mesmo telefone falando com
duas caixas são duas conversas**. E são duas porque **do lado do cliente são
duas** — dois contatos no celular dele, dois históricos, duas janelas de 24h.
Juntar aqui o que está separado lá é o tipo de simplificação que só aparece no
atendimento. `e2e/whatsapp-duas-caixas-entrada.spec.ts` é o teste central da
frente, e ele só podia existir depois do drop.

**A tela.** O cartão de integrações deixou de ser um formulário e virou uma
lista: rótulo, telefone, provedor, estado, quem fala por ela e a unidade. Cada
linha diz o que precisa ser decidido ali, e o selo de **padrão** é o único
preenchido em `--brand` — hierarquia por preenchimento, no tamanho certo para
uma lista. O formulário de conexão só aparece para quem ainda não tem nada ou
clicou em "adicionar número"; sem essa distinção, "adicionar" reabriria o
formulário da primeira caixa preenchido e salvar sobrescreveria ela.

Rede com número no ar e **nenhum padrão** ganha um aviso explícito, porque é
estado que ela precisa resolver: `escolherNumeroDeSaida` devolve `null` em vez
de chutar, e tudo que o sistema inicia para de sair. Eleger um sozinho ali seria
o `data[0]` de volta com outro nome.

**A escapatória, que é a parte honesta da decisão "sempre o do usuário".** O
aviso aparece no composer **antes de digitar**, em vermelho, nomeando os dois
números: "você fala pelo Comercial, e este atendimento veio pelo Recepção; o
cliente nunca falou com o seu". Ao lado dele, um clique para responder pela
caixa da conversa. Não é um recuo da regra — o padrão continua sendo o número do
usuário —, é o que impede a decisão de virar uma parede: sem isso, quem tem
número próprio ficaria impedido de responder qualquer conversa que não tenha
nascido nele. A escolha viaja até `enviarNaConversa` (`pelaCaixaDaConversa`) e
**zera ao trocar de conversa**, senão a próxima sairia pela caixa errada sem
ninguém ter pedido e sem o aviso, que some quando ela está ligada.

Quem é a caixa do usuário é resolvido no SERVIDOR (`canaisConectados` ganhou
`numeroDoUsuario`): a tela precisa saber por onde ELE fala, não de quem é cada
caixa da rede. Mandar os vínculos todos para o navegador seria expor a estrutura
da equipe para responder uma pergunta sobre uma pessoa só.

**Templates por WABA.** `message_templates` ganhou `waba_id`, com backfill
**antes** de trocar a constraint — com a coluna nula, `unique (tenant, waba_id,
name, language)` não restringe nada (NULL nunca é igual a NULL) e a garantia de
nome único se perderia em silêncio. O escopo é por WABA e **não por número**:
dois números podem compartilhar a mesma conta de negócio, e escopar por número
duplicaria o catálogo aqui e faria submeter o mesmo nome duas vezes à Meta, que
recusa por colisão.

O filtro é **estrito**: oferecer um template que não existe na conta que vai
enviar dá 404 na Meta, no clique, sem explicar nada — lista vazia é melhor
resposta que erro no clique. E `sendTemplateMessage` confere a WABA por conta
própria, porque é um export `'use server'`: a tela filtra, mas o endpoint é
público.

**O que sobra, e por quê:** `delete from integration_configs where provider in
('uazapi','official')`. Nada mais lê aquelas linhas, mas elas são a única cópia
das credenciais fora da tabela nova — e apagá-las agora tiraria a rede de
segurança exatamente no momento em que ela é mais provável de ser necessária. O
plano já condicionava esse passo a um período de uso; é o único item que
continua esperando por isso.

### 2026-09-26 — Vários números de WhatsApp: a fundação (fases 1 a 3)

Pedido do Heitor: "quero poder adicionar mais números de whatsapp".

A rede tinha UM número, e isso não era configuração — estava soldado em
`integration_configs.unique (tenant_id, provider)`. Todo o sistema perguntava
"qual o WhatsApp desta rede?" em vez de "qual DESTES", e `getWhatsAppConfig`
desempatava com `order by updated_at desc` + `data[0]`.

**Três defeitos que já existiam** e que ninguém via porque só havia um número:

| Onde | O que acontecia com dois números |
|---|---|
| `webhooks/whatsapp/route.ts` | extraía o `phone_number_id`, descobria a rede por ele e **jogava o número fora** para recarregar "a config da rede" — o HMAC era conferido com o `appSecret` de outra caixa, e toda entrega do segundo app cairia em 401 |
| `webhooks/uazapi` → `tratarConexao` | atualizava por `(tenant_id, provider)`: o evento de conexão de uma caixa reescrevia `is_active` e `connectedPhone` da OUTRA |
| `uazapi-connection.ts` | `upsert` com `onConflict: 'tenant_id,provider'` — criar a segunda instância APAGAVA a primeira do banco enquanto ela seguia sendo cobrada |

**A modelagem.** Tabela nova `whatsapp_numbers`, não relaxamento da constraint
antiga: `meta_ads`, `google_ads` e `meta_messaging` são legitimamente um por
rede, e é aquela `unique` que os protege. Duas garantias moram em índice único
parcial, porque garantia de app vale enquanto todo mundo passar pela action:
**um padrão por rede** e **um número por usuário**. As duas existem para matar a
mesma coisa — a escolha silenciosa.

A migração elege como padrão exatamente a linha que o desempate antigo
escolhia (`is_active desc, updated_at desc`). Eleger outra faria a rede passar a
falar por um número diferente no dia da migração, sem ninguém ter pedido.

**As decisões do Heitor, que são as travas do desenho:**

1. Unidade no número é **rótulo**, não escopo: `conversations.branch_id` continua
   nascendo nulo, e a unidade vira tag depois. Não entra em RLS nem na escolha
   de por onde sai.
2. **Cada número tem seu provedor.** uazapi e oficial convivem, e
   `desativarOutroProvedorWhatsApp` — que derrubava um para ativar o outro —
   foi deletado junto com `lib/whatsapp/ativacao.ts`.
3. **Um padrão por rede**, por onde sai tudo que o sistema inicia. As automações
   não mudaram uma linha: elas já chamavam com `remetente.id = null`, e isso
   agora cai no padrão por construção.
4. **O usuário com número próprio fala SEMPRE por ele** — inclusive respondendo
   uma conversa que chegou por outra caixa.

**A decisão 4 tem um custo real, e o trabalho foi fazê-lo aparecer.** O cliente
recebe de um número que não conhece, abre-se uma thread nova no celular dele, a
resposta volta como conversa nova, e a janela de 24h daquela conversa não vale
para a caixa nova. Então:

- **a janela é medida contra a caixa que VAI ENVIAR**, nunca contra a conversa
  (`ultimoInboundNaCaixa`). Usar `conv.last_inbound_at` ali faria o sistema achar
  que pode mandar texto livre, gravar a mensagem, e só então a Meta recusar com
  um 400 genérico — o "enviado" mentiroso que `enviarNaConversa` existe para não
  produzir;
- a falha **diz por quê**: "Janela fechada no seu número (Ana comercial): este
  contato nunca falou com ele";
- `messages` ganhou `whatsapp_number_id` próprio, senão o histórico afirmaria que
  tudo saiu pela caixa da conversa — mentira exatamente no caso que mais importa
  auditar;
- `conversations.whatsapp_number_id` **nunca é sobrescrito**: a conversa só
  adquire caixa no primeiro envio bem-sucedido, se ainda não tiver uma.

**A exceção à regra 4 é a edição de mensagem**, que sai obrigatoriamente pela
caixa que enviou: editar por outra linha é 404 no provedor.

**O escalar morreu.** `canaisConectados` devolvia `provedorWhatsApp: string|null`
— um valor de REDE que a tela usava para decidir a janela de 24h e o botão de
editar de CADA conversa. Com dois provedores convivendo, ele faria os dois
mentirem em metade delas. Virou `numeros[]`, e a conversa passou a carregar
`numero_provider` (resolvido em segunda consulta mapeada em memória, nunca por
embed do PostgREST, pelo motivo que `actions/inbox.ts` já documenta).

**O ponto mais perigoso da frente**: as seis funções de `uazapi-connection.ts`
são exports de um arquivo `'use server'` — endpoints públicos. Eram seguras por
acidente (o tenant vinha da sessão, a linha era achada por tenant); passando a
receber um `numeroId`, o id é controlado por quem chama. Todas agora passam por
`numeroDaRede()`, que confirma a posse. Sem isso, qualquer usuário autenticado
de qualquer rede puxaria o QR code — e desconectaria, e apagaria a instância
paga — de outra clínica.

O guard "uma conexão gerenciada por rede" saiu (é a trava que a decisão 2
remove), mas ele também servia de idempotência: sem nada no lugar, cada clique
em "criar" nasce uma instância **cobrada**. Entrou `UAZAPI_MAX_POR_REDE`
(padrão 5). E a ordem de criação foi invertida — linha primeiro, instância
depois, credencial por último —, o que faz falha no meio deixar uma linha
identificável em vez de uma instância órfã anônima.

**O que ficou em aberto, e é deliberado:** os dois índices únicos antigos de
`conversations` (`uniq_conversations_tenant_channel_external` e
`..._phone`) **continuam de pé**. Os quatro novos, parciais por caixa, já estão
criados ao lado. Dropar os antigos é o único passo irreversível da frente —
depois que existirem duplicatas legítimas por caixa, recriá-los exige fundir
conversas à mão — e é o que falta para o mesmo telefone poder ter duas conversas
em duas caixas. Até lá o comportamento é bit a bit o de hoje, que é o critério de
aceite destas fases: **118 de 119 testes E2E passam sem alteração**, e o único
vermelho é `automacoes-anel`, que estoura o orçamento dele sob carga da suíte e
passa isolado em 34s.

Também faltam a tela de lista de números e os templates por WABA.

`e2e/whatsapp-numeros-modelagem.spec.ts` confere no BANCO que dois padrões e
dois números para o mesmo usuário são recusados — garantia de app vale enquanto
todo mundo passar pela action; um `update` direto fura.
`e2e/whatsapp-caixa-na-entrada.spec.ts` prova o carimbo ponta a ponta.
`tests/numero-de-saida.test.ts` tranca a precedência como função pura, e a
asserção que mais importa ali é "duas caixas ativas e nenhum padrão devolvem
`null` e não escolhem uma" — é ela que impede alguém de "consertar" um bug
futuro reintroduzindo o `data[0]`.

**Uma regressão que precisou ser MIGRADA, não consertada:**
`e2e/whatsapp-modo-oficial.spec.ts` lia e restaurava `integration_configs`. A
correção preguiçosa seria reapontar para a tabela velha; o certo era apontar
para `whatsapp_numbers`. Ele chegou a deixar valores `[e2e]` na caixa oficial
real justamente porque o `finally` restaurava a tabela errada — restaurar a
errada é pior que falhar, porque a asserção quebra e a configuração real fica
suja sem ninguém ver.

### 2026-09-25 — WhatsApp oficial: a clínica escolhe como o número chega

Pedido do Heitor: "o cliente possa escolher se quer conectar com coexistência
(explicando o que significa) ou pela Cloud API (explicando o que significa)".

São dois caminhos para o mesmo número, e o que os separa não é técnico para
quem opera — é **o que acontece com o aplicativo que está no celular hoje**:

| | Coexistência | Cloud API |
|---|---|---|
| Aplicativo no celular | continua atendendo pelo mesmo número | **para** de funcionar com ele |
| Conversas que já existem | vêm para o sistema na conexão | ficam no aplicativo |
| Quem atende | equipe no celular **e** no Inbox | só o Inbox |
| Voltar atrás | nada mudou, nada a desfazer | exige desfazer a migração na Meta |

A escolha fica **antes dos campos de credencial**, porque decide o que a pessoa
vai perder antes de ela começar a colar token. E o "atenção" da Cloud API está
em vermelho, na tela — não atrás de um link: é decisão que não se desfaz
clicando.

Os textos moram em `lib/whatsapp/modo-oficial.ts`, fora do componente. O
que importa nesse ajuste é a explicação, e ela precisa sobreviver a qualquer
refação da tela de integrações.

**O que este ajuste NÃO faz, e é honesto dizer** (resolvido em 2026-09-30 — ver
"WhatsApp pelo cadastro incorporado da Meta"): o Embedded Signup da Meta —
onde a escolha vira parâmetro do onboarding — não existe ainda, porque o app da
Meta não existe (está em "Em aberto" desde sempre). Hoje a conexão oficial é
credencial colada à mão, e o modo registra a decisão e diz à clínica o que
esperar. Quando o app existir, é neste ponto que o parâmetro entra.

`e2e/whatsapp-modo-oficial.spec.ts` confere as três coisas: os dois modos
aparecem com a explicação de cada um, a escolha sobrevive ao salvamento (senão
é enfeite) e quem já configurou reabre no modo que escolheu. Ele mexe na
configuração real da rede e devolve o estado anterior no `finally`.

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

- **Os apps da plataforma no ar** (2026-10-06):
  - os CNAMEs `admin` e `suporte` para os serviços novos do Railway;
  - no Supabase (Auth → URL Configuration), os dois hosts nas Redirect URLs;
  - quando ligar o Asaas, o webhook em `https://admin.bellarisos.com/api/webhooks/asaas`;
  - `PLATAFORMA_ADMIN_EMAIL` vai no serviço do SISTEMA, e o primeiro login é
    em admin.bellarisos.com.
- **Build novo do app Android** (sessão em cookie httpOnly, `CookieManager.flush`):
  testar fechar o app, matar o processo e reabrir logado.
- **Cloudflare Access** (fora do escopo por decisão dele, 2026-10-06): DNS do
  `bellarisos.com` no Cloudflare (copiar TODOS os registros antes, MX e TXT
  inclusive; `app` em "DNS only"), Zero Trust grátis com os e-mails da
  equipe na frente de `admin` e `suporte`, bypass para `/api/webhooks/asaas`,
  `/api/cron/*`, `/api/health` e `/api/interno/*`, e conferir o
  `Cf-Access-Jwt-Assertion` no `proxyDaPlataforma` (senão a borda do Railway
  é um atalho).
- **CSP na clínica** (`apps/web`): começar em Report-Only (lá há o SDK da Meta,
  a mídia da uazapi e mais) — a dos hosts da plataforma já é estrita.

- ~~App da Meta não existe~~ **existe e é Tech Provider** (2026-09-30), com o
  cadastro incorporado no ar (v4, `config_id` em `META_ES_CONFIG_ID`). Falta:
  a primeira conexão REAL de um número (só provada com a Meta falsa), assinar
  no painel os campos `messages`, `history`, `smb_app_state_sync` e
  `smb_message_echoes`, conferir `app.bellarisos.com` nos domínios
  permitidos do app (sem isso a janela não abre), e o App Review.
  Instagram e Messenger seguem verificados só com payload simulado.
- ~~`META_VERIFY_TOKEN` não está no Railway~~ **configurado em 2026-09-30**
  (Tech Provider): a rota do WhatsApp aceita o token do app no handshake e o
  segredo do app na assinatura. URL e token colados no painel pelo Heitor no
  mesmo dia (o handshake fechou em produção).
- **`wabaId`**: a caixa conectada pelo cadastro incorporado já nasce com ele;
  só a de credencial colada à mão depende de alguém preenchê-lo (sem ele o
  "enviar para aprovação" de Templates fica desabilitado).
- **Nenhum número de WhatsApp real foi pareado.** A uazapi foi provada por sonda
  (instância, webhook, proxy, QR, exclusão), mas enviar e receber de verdade só
  com celular na mão.
- **App Review da Meta** (`pages_messaging`, `instagram_manage_messages`).
- Perguntas abertas com o suporte da uazapi: o proxy `internal` é dedicado por
  instância ou compartilhado? `DELETE /instance` para a cobrança na hora?

### Próximas fases já combinadas

- **Busca universal, fase 2 — ações** (decisão do Heitor, 2026-10-03: a
  primeira fase só acha). "Novo agendamento", "Cadastrar cliente" e, no
  cliente achado, "Agendar"/"Vender", cada uma reaproveitando o modal que já
  existe — o que pede uma porta de entrada por URL em cada modal.

### Suporte — o que depende do Heitor

- **Virar o primeiro admin da plataforma** (sem script desde 2026-10-03): pôr
  `PLATAFORMA_ADMIN_EMAIL` no Railway com um e-mail que **não** seja de
  membro de rede (ex.: `heitor+admin@…`), ir em "Esqueci minha senha" com ele,
  definir a senha pelo e-mail, entrar e cadastrar o autenticador. Cai no
  `/sistema`; a equipe de suporte se cadastra em `/sistema/equipe`.
- **Asaas**: criar a conta (sandbox primeiro), gerar a chave de API e pôr no
  Railway `ASAAS_API_KEY`, `ASAAS_AMBIENTE` (`sandbox`/`producao`) e
  `ASAAS_WEBHOOK_TOKEN` (32+ caracteres). No painel do Asaas, criar o webhook
  para `https://app.bellarisos.com/api/webhooks/asaas`, envio **sequencial**,
  eventos de cobrança e de assinatura, com o mesmo token. Depois, cadastrar os
  planos em `/sistema/planos` e ligar a cobrança de cada rede no detalhe dela.
- **A rede real de hoje** está `active`, sem plano nem assinatura: não é
  cobrada nem bloqueada até alguém definir o plano e ligar a cobrança.
- **(Opcional) ligar o hook de token**: Supabase → Authentication → Hooks →
  Custom Access Token → `public.suporte_hook_do_token`. Nada depende dele.
- **Vale uma rodada completa do E2E**: `jwt_claim`, `buildContext`, o proxy e
  o emissor de eventos mudaram — é o centro do sistema. Os vizinhos passaram.
- **Risco aceito, que continua**: dentro da janela ativa o atendente pode
  escrever pelo PostgREST o que a RLS deixa ao membro (menos o clínico, a
  credencial e o aparelho), e isso não entra no registro de acesso — o plano
  já previa; a mitigação seria exigir um cabeçalho que só o servidor manda.
- **Depois**: impersonar o cliente final do portal; e-mail transacional
  (chamado respondido, acesso do suporte); push para o suporte; host próprio
  para trabalhar lado a lado; gente de unidade autorizar outros. Na cobrança:
  nota fiscal do Asaas, cupom, limite por plano, cobrança anual e a clínica
  trocar o próprio plano.

### Dívida técnica conhecida

- ~~**Comissões, fases 2 e 3**~~ **concluídas em 2026-09-30** (ver a linha do
  tempo). O que ficou de fora de propósito:
  - ~~não há `comissao.liberada` nem `comissao.paga` na corrente de eventos~~ **feito**;
  - ~~fechamento pago não se estorna pela tela~~ **feito**;
  - ~~não há venda de pacote no sistema~~ **feito**: catálogo e venda de pacote (ver a linha do tempo).

  ~~A suíte completa depois das três fases ainda não rodou~~ **rodou verde
  em 2026-09-30** (421/421, depois de comissões, pacotes, pré-pago, desconto,
  crédito na agenda e parcelas).

- ~~Modais "caixa fixa com z-index"~~ **resolvido em 2026-09-30**: os 27
  viraram `<JanelaModal>` (ver a linha do tempo).
- ~~A ficha do cliente lê `installments`~~ **resolvido**: lê o vencimento do
  lançamento; a política de `installments` virou só leitura.
- **E2E**: 76 specs ainda rodam um por vez (usam a rede real, a sessão
  padrão ou cron). Cada um migrado para rede própria vai para o paralelo
  (`e2e/grupos.ts`) — trabalho aos poucos, spec a spec. ~~A varredura apaga
  todo [e2e]~~ **resolvido**: só o de mais de uma hora, e as duas metades
  rodam juntas no CI. ~~A primeira completa com as metades juntas ainda não
  rodou~~ **rodou em 2026-10-05**, verde (ver a linha do tempo).
- ~~O cron de produção roda contra o mesmo banco do E2E~~ **investigado**: ver
  a linha do tempo. Seguro pelas reivindicações; a janela que havia (LGPD)
  foi fechada.
- ~~Cron do Railway sem nova tentativa~~ **resolvido**: repete erro de borda.

- **Contato separado da conversa — o que sobrou** (a ordem combinada terminou
  em 2026-09-26):
  - ~~`conversations.tags` sai depois do soak~~ **fica** (2026-09-28): é a
    semente das tags da pessoa, e o app não a lê;
  - ~~no modo "pela conversa", a lista de leads do dono cortada em 1000~~
    **resolvido em 2026-09-28** (inbox paginado).
- ~~**Dois E2E pulavam sempre na completa**~~ **resolvido em 2026-09-29**
  (a completa deu 331 verdes e 2 pulados). Os dois dependiam de dado que o
  banco não tem:
  - `automacoes-ensaio` precisava de um `cliente.criado` da rede real na
    corrente, e nunca havia (a limpeza apaga os eventos dos clientes `[e2e]`, e
    a corrente guarda 30 dias). Agora roda numa rede `[e2e]` com membro
    próprio e grava o fato ele mesmo — o motor não varre a corrente, então o
    fato gravado direto não dispara nada;
  - `whatsapp-numeros-modelagem` › "número de uma rede não aceita pessoa de
    outra" procurava um usuário de outra rede, e o banco só tem uma quando
    nenhum spec está com a sua `[e2e]` de pé. A prova de isolamento nunca
    rodava; agora a pessoa de fora vem de `criarOutraRede`.
  Regra que fica: teste não pula por falta de dado que ele mesmo pode criar.

- ~~Hidratação em `/admin/inbox`, chave de lista no estoque, e o
  lançamento que sumia da lista.~~ **Resolvidos em 2026-09-25** — ver a entrada
  da linha do tempo.
- **O sistema nunca foi usado por uma clínica de verdade.** Nenhuma sessão de
  celular, um navegador logado, clientes demo, nenhum número pareado no
  WhatsApp oficial. Tudo que se sabe vem de testes escritos por quem escreveu o
  código — e teste só prova o que alguém pensou em perguntar.

### Antes do primeiro lançamento

- **Apagar TODOS os dados de demonstração** (decisão do Heitor, 2026-09-29):
  ficam no banco até o desenvolvimento terminar, e saem de uma vez antes de a
  primeira clínica entrar. Não é pendência de agora — não apagar antes. Inclui:
  - "Carla Mendes (demo)" (2 conversas, 1 oportunidade, telefone DDD 00),
    criada em 2026-09-26 para ver o inbox com duas conversas da mesma pessoa;
  - o que `supabase/seed_demo.sql` e `supabase/seed_demo_inbox.sql` criam;
  - clientes, conversas, oportunidades e agendamentos criados testando à mão.

### Decidido, e registrado para não voltar à discussão

- **Botão de ação tem 38px e seletor tem 34px, e fica assim** (2026-09-25):
  "pode manter, dá um destaque leve, eu gosto". A diferença é hierarquia — a
  ação enfatizada é mais alta que o filtro —, não descuido.

### Próxima frente candidata

Nada combinado. Termos e contratos, comissões, pacotes, pré-pago, desconto,
agendar com crédito e parcelas estão feitos e com a suíte completa verde
(2026-09-30); o cadastro incorporado da Meta (Tech Provider) está no ar desde
o mesmo dia. O que mais pesa agora: a primeira conexão real de um número pela
Meta, o App Review e o uso por uma clínica de verdade.

---

## 6. Rodar o projeto

```bash
pnpm install                 # uma vez, na raiz: cobre os 8 workspaces
pnpm dev --filter=web        # http://localhost:3000
pnpm typecheck               # tsc --noEmit em todos os pacotes
pnpm test                    # Vitest
pnpm --filter web test:e2e   # Playwright (sobe o dev sozinho)
pnpm --filter web test:e2e:afetados  # só a área alterada — o de cada etapa
pnpm --filter web test:e2e:completa  # tudo, contra o build (no GitHub, só à mão: gh workflow run e2e.yml)
pnpm build --filter=web
```

**A completa no GitHub Actions** precisa, uma vez, no repositório:
Settings → Environments → **New environment** `e2e` → *Deployment branches
and tags*: **Selected branches** → `main`; e, dentro dele, três
**Environment secrets** com os mesmos valores do `apps/web/.env.local`:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Depois, Actions → E2E → *Run workflow* roda na
hora, sem esperar um push.
O runner é **fixo em `ubuntu-24.04`** (não `ubuntu-latest`, que vira Ubuntu 26
em 2026-10-19): o `playwright install --with-deps` depende da distro, e trocar
de versão é decisão. As actions estão nas majors que rodam no Node 24
(2026-09-29).

O `.env.local` de `apps/web` precisa das chaves do Supabase, uazapi, Meta, VAPID
e `CRON_SECRET` — ver CLAUDE.md §12. O E2E não pede nenhuma chave nova.

**Mudança de schema** é aplicada por SQL direto (MCP do Supabase), com arquivo de
paridade em `supabase/migrations/`. O banco é a fonte de verdade: inspecionar o
schema real antes de qualquer DDL, e rodar `NOTIFY pgrst, 'reload schema'` **uma
vez no fim do lote**.
