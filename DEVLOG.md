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
  documentos e dados; desativar/reativar; crédito interno.
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
