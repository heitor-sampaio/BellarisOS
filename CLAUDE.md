# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. O que é este projeto

BellarisOS é o **ERP + CRM** de clínicas de estética — a ferramenta em que a
clínica opera o dia inteiro: agenda, prontuário, clientes, conversas, estoque,
comercial e financeiro. Não é um sistema financeiro com agenda em volta; o
financeiro é uma parte, não o centro.

**O tamanho real do cliente é uma clínica só.** Multiunidade existe no modelo
(tudo carrega `tenantId` + `branchId`, e o portal da rede consolida), mas é a
exceção: rede grande costuma ser franquia, e franquia já chega com o sistema
dela. Na dúvida de projeto, otimize para a clínica única — sem tornar a segunda
unidade impossível.

É composto por três superfícies:

- **Portal Web Admin** (`/admin`) — visão consolidada da rede inteira
- **Portal Web Filial** (`/[slug]`) — operação isolada de cada unidade
- **App Mobile** (Expo, iOS + Android) — app único com dois fluxos distintos por tipo de usuário:
  - *Fluxo Operacional*: admins, gerentes, profissionais (gestão completa pelo celular)
  - *Fluxo Cliente*: clientes finais da clínica (agendamento self-service, histórico, pontos)

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Web Framework | Next.js 16 (App Router) |
| Mobile Framework | Expo (React Native) |
| Linguagem | TypeScript (strict) em todos os packages |
| Estilo Web | Tailwind CSS + shadcn/ui |
| Estilo Mobile | NativeWind + componentes customizados |
| Banco | PostgreSQL via Supabase |
| Acesso ao banco | Cliente Supabase (PostgREST) + `lib/db.ts` |
| Auth | Supabase Auth (JWT + RLS) |
| Storage | Supabase Storage (fotos de prontuário) |
| Cache / Filas | Upstash Redis + BullMQ |
| Pagamentos | Pagar.me (assinaturas da rede) |
| WhatsApp | uazapi (não oficial) + Cloud API da Meta (oficial) |
| Push Notifications | Expo Push Notifications |
| Deploy Web | Railway (Docker) |
| Deploy Mobile | EAS Build (Expo Application Services) |
| Monorepo | Turborepo |

---

## 3. Estrutura de pastas

```
estetica-os/                          (raiz do monorepo)
├── apps/
│   ├── web/                          Next.js — portais web
│   │   ├── app/
│   │   │   ├── (auth)/               login, cadastro, recuperação de senha
│   │   │   ├── admin/                portal da rede (NETWORK_ADMIN)
│   │   │   │   ├── dashboard/
│   │   │   │   ├── branches/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   ├── [slug]/               portal da filial
│   │   │   │   ├── dashboard/
│   │   │   │   ├── agenda/
│   │   │   │   ├── clients/
│   │   │   │   ├── procedures/
│   │   │   │   ├── stock/
│   │   │   │   ├── financial/
│   │   │   │   └── settings/
│   │   │   └── [slug]/cliente/       portal do cliente final (agendamento self-service)
│   │   ├── components/
│   │   │   ├── ui/                   shadcn/ui (não editar diretamente)
│   │   │   ├── shared/               componentes reutilizáveis entre portais
│   │   │   ├── admin/                exclusivos do portal admin
│   │   │   └── branch/               exclusivos do portal de filial
│   │   ├── lib/
│   │   │   ├── supabase/             clients (server, client, middleware)
│   │   │   ├── db.ts                 gravar / ler / tentar (§13.1)
│   │   │   ├── auth.ts               helpers de autenticação e permissão
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   └── actions/                  Server Actions (Next.js)
│   │
│   └── mobile/                       Expo — app iOS + Android
│       ├── app/                      Expo Router (file-based)
│       │   ├── (auth)/               login do usuário operacional e do cliente
│       │   ├── (operational)/        fluxo operacional (admin, gerente, profissional)
│       │   │   ├── dashboard/
│       │   │   ├── agenda/
│       │   │   ├── clients/
│       │   │   ├── stock/
│       │   │   └── financial/
│       │   └── (client)/             fluxo do cliente final
│       │       ├── home/
│       │       ├── schedule/         agendamento self-service
│       │       ├── history/
│       │       └── loyalty/
│       ├── components/
│       ├── hooks/
│       └── lib/
│           ├── supabase.ts           cliente Supabase para mobile
│           └── auth.ts
│
├── packages/
│   ├── db/                           schema Prisma — LEGADO, ninguém importa
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── index.ts
│   ├── types/                        interfaces TypeScript compartilhadas
│   │   └── index.ts                  AppointmentWithClient, JwtClaims, etc.
│   ├── validators/                   schemas Zod (mesma validação web + mobile)
│   │   └── index.ts
│   └── utils/                        helpers compartilhados
│       └── index.ts                  formatBRL, formatDate, maskCPF, etc.
│
├── supabase/
│   ├── migrations/                   migrations SQL (RLS, functions, triggers)
│   └── seed.sql
│
└── CLAUDE.md
```

---

## 4. Arquitetura multi-tenant

### Regra de ouro

> Todo dado operacional carrega `tenantId` + `branchId`.
> Nunca busque dados sem filtrar por pelo menos um dos dois.
> Clientes finais (`role: CLIENT`) só enxergam os próprios dados via `clientId`.

### Como o isolamento funciona

1. Usuário autentica via Supabase Auth
2. JWT contém claims customizados: `tenant_id`, `branch_id`, `role`, `client_id`
3. Middleware do Next.js (web) ou contexto do app (mobile) lê esses claims
4. Toda query **sempre** filtra por `tenant_id` e/ou `branch_id`
5. RLS do Postgres é a segunda linha de defesa

### Claims do JWT

```typescript
// packages/types/index.ts
interface JwtClaims {
  tenant_id: string | null    // null apenas para role CLIENT
  branch_id: string | null    // null para NETWORK_ADMIN e CLIENT
  role: UserRole
  client_id: string | null    // preenchido apenas para role CLIENT
}
```

### Helper de contexto (web — Server Actions e Route Handlers)

```typescript
// apps/web/lib/auth.ts
export async function getTenantContext() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const claims = user.app_metadata as JwtClaims
  return {
    userId: user.id,
    tenantId: claims.tenant_id,
    branchId: claims.branch_id,
    role: claims.role,
    clientId: claims.client_id,
    isNetworkAdmin: claims.role === 'NETWORK_ADMIN',
    isClient: claims.role === 'CLIENT',
  }
}
```

---

## 5. Dois tipos de usuário — diferenças críticas

| Aspecto | Usuário Operacional | Cliente Final |
|---|---|---|
| Model no banco | `User` | `Client` |
| Role no JWT | NETWORK_ADMIN, BRANCH_ADMIN, RECEPTIONIST, PROFESSIONAL, FINANCIAL | CLIENT |
| `tenant_id` no JWT | Preenchido | `null` |
| `client_id` no JWT | `null` | Preenchido |
| Login | E-mail + senha | CPF + senha ou magic link |
| Plataformas | Web + App Mobile (operacional) | App Mobile (cliente) |
| Acesso ao banco | Filtra por `tenantId` / `branchId` | Filtra por `clientId` |

### Vinculação Cliente → Conta no App

Quando um cliente cria conta no app:
1. Informa CPF no cadastro
2. Sistema busca `Client` pelo `tenantId` (da clínica que enviou o convite/QR Code) + `document` (CPF)
3. Se encontrar: vincula o `authId` ao `Client.authId` e preenche `appAccountCreatedAt`
4. Se não encontrar: cria novo `Client` com `authId` preenchido
5. JWT do cliente recebe `client_id` e `role: CLIENT`

---

## 6. Roteamento e portais

### Web

| Rota | Portal | Acesso |
|---|---|---|
| `/admin/*` | Rede | NETWORK_ADMIN |
| `/[slug]/*` | Filial | BRANCH_ADMIN, RECEPTIONIST, PROFESSIONAL, FINANCIAL |
| `/[slug]/cliente/*` | Cliente final | CLIENT (autenticado) |

**Não existe agendamento público sem login.** Só há dois caminhos para criar um
agendamento: a equipe autenticada, ou o próprio cliente pelo portal/app — e
neste caso apenas para procedimentos marcados como `visible_on_client_app`
(self-service). Decisão de produto de 2026-09-09.

Redirect pós-login:
```
NETWORK_ADMIN  → /admin/dashboard
outros         → /[branch.slug]/dashboard
```

### Portal não é filial

O `slug` que um componente recebe é a **filial do registro**; o portal é **onde a
pessoa está**. Confundir os dois foi o que fazia o `/admin` jogar quem clicava em
"+ Agendar" para dentro de uma unidade.

- Navegação em componente que roda nos dois portais vem de
  `apps/web/lib/rotas.ts` (`ehPortalDaRede`, `rotaNoPortal` e os atalhos
  `rotaCliente`, `rotaAgenda`, `rotaAtendimento`, `rotaInbox`, `rotaCheckout`…),
  que decide pelo `usePathname()`. Nunca monte `/${slug}/…` à mão nesses
  componentes — em componente exclusivo de um portal, à vontade.
- **Telas iguais têm o mesmo sufixo nos dois portais** (`/admin/estoque` e
  `/[slug]/estoque`), senão cada helper precisaria de um `if`. Caminho antigo
  vira `redirect()` de uma linha, como em `app/[slug]/stock/page.tsx`.
- Tela que existe na unidade e é útil à rede ganha a versão em `/admin`, com o
  corpo em `app/_shared/` (pasta privada: o `_` a mantém fora do roteamento) e
  as duas páginas finas — a da unidade resolve a filial pelo slug, a da rede
  pelo próprio registro. Ver `sessao-de-atendimento.tsx`, `checkout-de-plano.tsx`.
- Drill-down da rede (“ver esta unidade”) é `?unidade=<id|slug>` na tela da
  rede, não link para o portal da filial. A única saída de portal que sobra é o
  card “Abrir unidade” no dashboard, onde entrar nela é a intenção.
- **Toda `page.tsx` chama `assertPermission` por si**, mesmo com o layout já
  conferindo: o layout protege a navegação, não a URL.

### Mobile

O app usa Expo Router com grupos de rotas:

```
(auth)/          → tela de login (decide o fluxo pelo role após autenticar)
(operational)/   → fluxo admin/profissional
(client)/        → fluxo do cliente final
```

Após login, o app verifica o `role` do JWT e redireciona para o grupo correto.

---

## 7. Packages compartilhados

### `packages/types`
```typescript
export type { JwtClaims, UserRole } from './auth'
export type { AppointmentWithClient, AppointmentWithDetails } from './appointment'
export type { ClientWithLoyalty } from './client'
// ... demais tipos do domínio
```

### `packages/validators`
Schemas Zod usados tanto no web (Server Actions) quanto no mobile (validação de formulários):
```typescript
export { CreateAppointmentSchema } from './appointment'
export { CreateClientSchema } from './client'
export { LoginSchema, ClientLoginSchema } from './auth'
// ...
```

### `packages/utils`
```typescript
export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR').format(date)

export const maskCPF = (cpf: string) =>
  cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
```

---

## 8. Convenções de código

### Nomenclatura

```
Arquivos:          kebab-case         (appointment-card.tsx)
Componentes:       PascalCase         (AppointmentCard)
Hooks:             camelCase + use    (useAppointments)
Server Actions:    camelCase + verbo  (createAppointment)
Tipos/Interfaces:  PascalCase         (AppointmentWithClient)
Constantes:        SCREAMING_SNAKE    (MAX_BRANCH_COUNT)
Variáveis/funções: camelCase
```

### Estrutura de um Server Action (web)

```typescript
'use server'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { CreateAppointmentSchema } from '@estetica-os/validators'

export async function createAppointment(input: unknown) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  const data = CreateAppointmentSchema.parse(input)

  const admin = createAdminClient()

  // branch_id SEMPRE vem do contexto — nunca do input do cliente.
  // `gravar` devolve a linha ou PARA o fluxo: não existe escrita que
  // falha em silêncio (ver §13.1).
  const appointment = await gravar(
    admin.from('appointments')
      .insert({ ...data, tenant_id: ctx.tenantId, branch_id: ctx.branchId })
      .select()
      .single(),
    'criar o agendamento',
  )

  revalidatePath(`/${ctx.branch?.slug}/agenda`)
  return appointment
}
```

### Queries — filtro obrigatório

```typescript
// ✅ Usuário operacional — filtrar por branch_id
const clients = await ler(
  admin.from('clients').select('*').eq('branch_id', ctx.branchId),
  'listar os clientes da unidade',
)

// ✅ Network Admin — filtrar por tenant_id
const branches = await ler(
  admin.from('branches').select('*').eq('tenant_id', ctx.tenantId),
  'listar as unidades da rede',
)

// ✅ Cliente final — filtrar por client_id
const appointments = await ler(
  admin.from('appointments').select('*').eq('client_id', ctx.clientId),
  'listar os agendamentos do cliente',
)

// ❌ NUNCA — sem filtro
const clients = await admin.from('clients').select('*')
```

---

## 9. Módulos do sistema

### 9.1 Agenda
- Status: `SCHEDULED → CONFIRMED → IN_PROGRESS → COMPLETED → CANCELLED | NO_SHOW`
- Campos de timestamp por transição: `confirmedAt`, `startedAt`, `completedAt`, `cancelledAt`
- Campo `source`: `INTERNAL` (equipe pelo web/app), `CLIENT_APP` (cliente pelo portal, só procedimentos `visible_on_client_app`), `COMMERCIAL` (extensão do time comercial). `ONLINE` é legado do agendamento público, que foi descartado — não usar em código novo.
- **Todo agendamento tem procedimento.** A "avaliação" era a exceção que
  permitia marcar sem escolher um — ela deixou de ser entidade em 2026-09-25 e
  virou um procedimento como outro qualquer, com a ficha que precisar. Não há
  mais `is_evaluation` em lugar nenhum: se o atendimento é uma avaliação,
  isso está no procedimento escolhido.
- O funil comercial passou a ser medido por `source = COMMERCIAL`, que é
  o que a métrica de "avaliações agendadas × comparecimento" sempre quis saber.
- `clientNotes`: observações que o cliente envia ao agendar pelo app
- `roomId`: sala/cabine opcional — uma sala não pode ter dois agendamentos simultâneos (validar no action)
- `cancellationReason`: obrigatório ao cancelar para rastreabilidade
- Ao marcar `COMPLETED`: disparar consumo de estoque + transação financeira + comissão + pontos de fidelidade. **Hoje isso é sequencial e deveria ser atômico** — ver §10.

### 9.2 Clientes / CRM
- CPF (`document`) único por `tenantId` — constraint `@@unique([tenantId, document])`
- `authId` em `Client` é opcional — preenchido apenas quando o cliente cria conta no app
- `LoyaltyAccount` criada automaticamente no primeiro cadastro
- `firstAppLoginBonus` em `LoyaltyConfig`: pontos creditados no primeiro login do cliente no app
- `LoyaltyConfig.scopePerBranch`: `false` = pontos consolidados em toda a rede
- Tags como `String[]` — constantes em `packages/utils/client-tags.ts`
- `InternalCredit`: saldo de crédito do cliente na filial (gerado por estorno); usado como método de pagamento `INTERNAL_CREDIT`
- `LgpdRequest`: pedido de acesso aos dados pelo titular. Só `type: "export"`
  está implementado — a exclusão continua fora de escopo por conflitar com a
  guarda legal de prontuário e de registros fiscais. Fluxo: o cliente solicita
  em `/[slug]/cliente/perfil`, `actions/lgpd.ts` grava o pedido e processa em
  `after()` (não há fila no projeto); `/api/cron/lgpd-exports` recolhe o que
  ficar para trás. O pacote sai em PDF (legível) + JSON (portabilidade) no
  bucket privado `lgpd-exports`, com download por signed URL e validade de
  30 dias. Um pedido em aberto por cliente, garantido por índice único parcial.
- **Prontuário no pacote depende de liberação**: `include_medical` marca o que o
  titular pediu e `medical_status` (`not_requested | pending | approved |
  denied`) registra a decisão de quem tem `medical_records: MANAGE`, na aba
  LGPD de `/admin/settings`. Aprovar recoloca o pedido em `pending` e o pacote
  é regerado com a parte clínica.

### 9.3 Procedimentos
- `branchId: null` = catálogo base da rede (criado pelo NETWORK_ADMIN)
- `visibleOnClientApp`: controla se o procedimento aparece para o cliente agendar pelo app
- `ProcedurePriceHistory`: criada automaticamente ao alterar `price` de um procedimento
- `ProcedureProduct`: insumos consumidos por execução — base do consumo automático de estoque

Query correta para buscar procedimentos de uma filial — o catálogo base da
rede (`branch_id` nulo) MAIS o que é local da unidade:
```typescript
const procedures = await ler(
  admin.from('procedures')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${ctx.branchId}`),
  'listar os procedimentos da unidade',
)
```

### 9.4 Prontuário
- `MedicalRecord`: 1 por cliente
- `MedicalRecordEntry`: 1 por `Appointment` concluído (`appointmentId @unique`)
- **A ficha do procedimento é UMA**, montada no construtor
  (Configurações → Fichas, tabela `forms`) e ligada ao procedimento por
  `procedures.form_id`. As respostas ficam em
  `medical_record_entries.form_data`.
  - Eram DUAS — "de anamnese" e "de atendimento" —, com o mesmo construtor, os
    mesmos campos possíveis e o mesmo momento de preenchimento. Quem cadastrava
    um procedimento tinha de escolher em qual das duas pôr cada pergunta, e a
    escolha não mudava nada. Unificadas em 2026-09-25.
  - **Não confundir com `medical_records.general_anamnesis`**: aquilo é o
    questionário de saúde do CLIENTE, preenchido uma vez, que alimenta o termo
    de consentimento e o planejamento. Esse continua existindo e é outra coisa.
- `RecordPhoto.source`: `"web"` ou `"mobile"` — rastrear de onde veio o upload
- `RecordPhoto.type`: `"before"`, `"after"`, ou `"during"`
- `ConsentTerm.signedVia`: `"web"` ou `"mobile"`
- Cliente NÃO acessa o prontuário pelo app — apenas histórico de procedimentos

### 9.5 Estoque
- `currentStock` nunca atualizado diretamente — sempre via `StockMovement` em transação
- `StockMovement.balanceAfter`: saldo snapshot no momento da movimentação (imutável)
- `StockTransfer` requer confirmação da filial destino (status `PENDING → CONFIRMED | CANCELLED`)
- `ProductBatch`: rastreia lote e validade por produto; produtos com validade vencida devem ser sinalizados antes do uso

### 9.6 Financeiro
- **Não existe caixa de abrir e fechar.** Foi removido em 2026-09-18: quase
  nada é recebido em dinheiro vivo (a rede opera em Pix e cartão), e a
  conferência que o fechamento existia para fazer — contar a gaveta e comparar
  com o esperado — não tinha gaveta para contar. A auditoria do dia é a própria
  tela do financeiro: período, unidade e forma de pagamento.
  A tabela `cash_registers` e a coluna `financial_transactions.cash_register_id`
  continuam no banco com o histórico do que já passou por lá; nada novo é
  escrito nelas. Registro financeiro não se apaga.
- O módulo `cashier` **sobreviveu com outro significado**: RECEBER o pagamento
  do atendimento e do plano, na recepção. Não abre tela nenhuma por si só — o
  financeiro da unidade e o da rede pedem `financial`. `podeReceber` (cashier OU
  financial) continua sendo o gate de quem fecha uma venda.
- `FinancialTransaction` criada automaticamente ao concluir `Appointment`
- `Installment`: parcelas de uma transação (ex: parcelamento no cartão) — rastrear `isPaid` + `paidAt` por parcela
- Formas de pagamento: `CASH`, `PIX`, `DEBIT_CARD`, `CREDIT_CARD`, `INTERNAL_CREDIT`
- Estorno: cancelar a receita e gerar `InternalCredit` ao cliente (nunca deletar a transação)

### 9.7 Comissões
- Buscar `CommissionRule` específica (profissional + procedimento); fallback para regra geral (`procedureId: null`)
- `periodRef` formato: `"YYYY-MM"`
- Comissão de pacotes: calculada na sessão executada, não na venda do pacote

### 9.8 Push Notifications (mobile)
- `PushToken` armazena o token Expo do dispositivo com `platform: "ios" | "android"`
- Pode estar vinculado a `userId` (usuário operacional) ou `clientId` (cliente final) — nunca aos dois ao mesmo tempo
- **Quem recebe uma notificação operacional são as PARTES INTERESSADAS no
  fato**, e a lista não é escrita à mão por evento: sai de
  `lib/notifications/interessados.ts`, por dois eixos que o sistema já
  conhece.
  - **Envolvido direto** — a pessoa de quem o fato é. O profissional do
    agendamento recebe porque a agenda é dele, com permissão ou sem.
  - **Responsável** — quem tem `MANAGE` no módulo que governa o fato e
    alcança a unidade onde ele aconteceu (a própria, ou a rede com
    `branch_id` nulo). É a abrangência do §11, não uma regra nova.
  - `VIEW` **não entra**: ver o módulo é poder consultar, não responder
    pelo que acontece nele. Quem só olha não precisa ser interrompido.
  - **Quem causou o fato sai da lista.** Sino avisando a pessoa do que ela
    acabou de fazer é ruído, e ruído treina a ignorar o sino.
  - A exceção é o **check-in**: ali a parte interessada é uma só, quem vai
    atender. Avisar a gerência de cada chegada seria um sino tocando o dia
    inteiro.
- Notificações operacionais: novo agendamento, cancelamento, remarcação,
  check-in e estoque abaixo do mínimo
- Notificações para cliente: confirmação, lembrete 24h antes, promoções
- Fallback de notificação WhatsApp para quando push falhar (uazapi ou API oficial, conforme o que a rede tiver conectado)

---

### 9.9 Eventos de domínio e automações

Toda ação relevante do sistema vira um fato em `domain_events` — 42 eventos
nomeados pela **intenção** (`agendamento.nao_compareceu`), catálogo tipado em
`packages/types/src/eventos.ts`. As automações assinam essa corrente.

- **O emissor mora em `lib/events/`, fora de `actions/`.** Todo export de um
  arquivo `'use server'` vira endpoint público, e um gravador exposto assim
  deixaria qualquer cliente forjar a corrente que dispara as automações. Vale
  igual para o motor: em `actions/automacoes.ts` só entra LEITURA.
- **Acrescentar nome ao catálogo sem emissor quebra o teste** — de propósito:
  catálogo prometendo evento que ninguém emite faz a automação ser montada e
  nunca disparar.
- **Retenção de 30 dias.** A corrente é uma janela, não arquivo: automação que
  precise olhar mais para trás consulta o dado de negócio.
- **Eventos clínicos não carregam conteúdo clínico**, e o contexto da automação
  também não hidrata prontuário. A automação avisa que a ficha chegou; quem
  precisa do conteúdo abre o prontuário, com a permissão que ele exige.
- `pagamento.*` e `estoque.*` saem de GATILHO no banco (`origem: 'banco'`, sem
  ator), porque esses fatos nascem em cinco ou seis lugares do código e
  instrumentar um a um é garantir esquecer o próximo.
- **Campanha ≠ automação.** Campanha é disparo em massa por público; automação
  é reação a um fato. São dois produtos, e nada migra de um para o outro.
- **A fila do motor é `automation_runs`**, no Postgres — não há broker no
  projeto. O disparo é imediato (`after()`); o cron recolhe o que espera, o que
  falhou e o que é de tempo.
- **O gatilho de tempo tem duas famílias**: intervalo (`minutos`, `horas`, conta
  a partir do último disparo) e relógio (`diaria`/`semanal`/`mensal`, num
  horário do dia). Cada uma usa o seu campo — `intervalo` ou `hora` — e o outro
  não vai para o grafo. **O piso do intervalo é `INTERVALO_MINIMO_MIN` (5 min),
  que é o ritmo do cron**: prometer menos é prometer o que o relógio não
  entrega. Quem controla a repetição é `automations.ultimo_disparo_agenda`, e a
  marca é gravada ANTES de executar, conferindo quantas linhas mudou.
- **Cada salvamento deixa um retrato em `automation_versions`** (os últimos 30).
  Voltar para uma versão **carrega** o fluxo dela no editor e não grava nada —
  salvar continua sendo explícito, e o retrato de onde se veio permanece. O
  histórico é append-only: restaurar gera a versão seguinte, nunca apaga.
- **Três travas contra o anel**: origem `'automacao'`, `profundidade` com teto
  de 3, e índice único `(automation_id, evento_id)`. Ação de automação que
  emite evento **passa a profundidade adiante** — sem isso, um grafo em anel
  manda mensagem ao cliente em laço.
- **Tudo se propaga.** O contexto da execução carrega o payload do gatilho
  (`evento.dados.*`) e **o que cada passo deixou** (`passos.<nome do passo>.*`);
  qualquer node à frente lê os dois, em condição ou em `{{variável}}`.
  - O **nome do passo** (`NoDoGrafo.nome`) é a chave — por isso ele é único no
    grafo e a validação recusa nome repetido ou referência a passo que não é
    antecessor. Renomear depois de citar quebra a referência, e é o validador
    que avisa.
  - **O que cada node produz se declara em `DADOS_DO_NO`**, e o que cada evento
    carrega em `CAMPOS_DO_EVENTO` (`packages/types`). Node ou evento sem
    entrada ali funciona, mas fica invisível para quem monta o fluxo — que é o
    mesmo erro mudo do gatilho que nunca dispara.
  - A tela soma a essas listas os campos **vistos no último fato real**
    (`amostraDoEvento`): `dados` tem índice livre e nenhum catálogo cobre tudo.
  - **Renomear um passo reescreve quem o citava** (`renomearPasso`). A troca é
    por segmento inteiro: renomear "Mandar mensagem" não pode mexer no que cita
    "Mandar mensagem 2".
- **Campo de condição aceita EXPRESSÃO**, não só caminho — decisão do Heitor em
  2026-09-24, que abriu o "condição é construtor, não linguagem" original. A
  lista de campos continua sendo o caminho normal da tela; a expressão é a saída
  para o que ela não cobre.
  - `lib/automacoes/expressao.ts` é o avaliador: analisador próprio, **sem
    `eval` e sem `new Function`**. O texto vem do banco e roda no servidor
    dentro do motor — ali um `new Function` seria execução remota de código a um
    `update` de distância. Funções só as da lista fechada; `__proto__`,
    `constructor` e `prototype` não são navegáveis.
  - **Expressão quebrada devolve vazio, não derruba o run** — parar um fluxo no
    meio dos efeitos por um erro de digitação seria pior. Quem reclama é o
    validador, antes de ativar.
  - Toda leitura de campo passa por `valorDoCampo`, e toda hidratação por
    `caminhosDoCampo`: ler à mão com `lerCaminho` volta a ignorar expressões, e
    o texto sai vazio sem nada explicar.

---

## 10. Fluxo de conclusão de atendimento

> **Atenção:** este é o desenho ALVO, não o que está no código. Hoje as sete
> gravações acontecem em sequência (cada uma falha alto, mas falhar a quarta
> deixa as três primeiras gravadas). O caminho já provado no estorno é o mesmo
> que serve aqui: o TypeScript calcula (pontos, comissão, insumos) e **uma
> função do Postgres grava tudo dentro de uma transação**, sem duplicar regra
> de negócio no banco. É a próxima frente candidata (DEVLOG §5).

Os sete passos, na ordem, e o que cada um precisa deixar gravado:

| # | O que grava | Onde |
|---|---|---|
| 1 | status `COMPLETED` + `completed_at` | `appointments` |
| 2 | entrada do prontuário (1 por atendimento, `appointment_id` único) | `medical_record_entries` |
| 3 | baixa de cada insumo do procedimento, com `balance_after` | `stock_movements` + `products` |
| 4 | a receita do atendimento | `financial_transactions` |
| 5 | a comissão do profissional | `commissions` |
| 6 | a sessão do pacote, se houver | `package_sessions` |
| 7 | os pontos de fidelidade | `loyalty_transactions` |

A ordem importa: o estoque baixa antes do financeiro porque insumo faltando é
motivo para o atendimento não fechar, e descobrir isso depois de lançar a
receita deixa dinheiro registrado para um atendimento que não aconteceu.

---

## 11. Permissões por módulo

Não existem mais cargos fixos. Cada rede cria seus próprios cargos (`tenant_roles`)
e monta a matriz em Configurações → Cargos. A autorização tem **três eixos**:

| Eixo | Onde mora | O que decide |
|---|---|---|
| **Módulo × nível** | `role_permissions.level` (`NONE`/`VIEW`/`MANAGE`) | até onde o cargo mexe |
| **Escopo** | `role_permissions.scope` (`OWN`/`ALL`) | em quais registros |
| **Abrangência** | `users.branch_id` (`null` = rede) | em quais unidades |

Escopo e abrangência são coisas diferentes: o escopo é do **cargo**, a abrangência
é do **membro**. Um mesmo cargo "Profissional" serve para alguém de uma filial e
para alguém da rede.

Os 15 módulos: `agenda`, `clients`, `medical_records`, `procedures`, `stock`,
`financial`, `cashier`, `crm`, `marketing`, `reports`, `team`, `forms`, `roles`,
`settings`, `automations`. Nem todo módulo distingue os três níveis — `MODULE_LEVELS`
(`lib/permissions.ts`) declara o que cada um aceita, e a tela de cargos só
oferece esses. O escopo aparece apenas em `SCOPED_MODULES`: `agenda`,
`medical_records`, `financial`, `crm` e `reports` (em `reports` o escopo é "só
a minha unidade" × "a rede inteira", não "os meus registros").

**Relatórios tem um eixo a mais**: `reports: VIEW` abre a tela, e
`role_report_tabs` diz QUAIS abas o cargo enxerga — o time comercial vê o funil
sem ver o faturamento. Sem nenhuma aba marcada, o módulo vale NONE
(`buildContext`): a entrada some do menu em vez de abrir uma tela vazia. Ler com
`podeVerRelatorio(ctx, aba)` / `assertRelatorio`.

```typescript
// lib/auth.ts — os quatro helpers de autorização
assertPermission(ctx, 'agenda', 'MANAGE')                    // barra (throw)
assertAnyPermission(ctx, ['settings', 'roles', 'forms'], 'MANAGE')  // tela multi-módulo
can(ctx, 'medical_records', 'VIEW')                          // esconde UI
ownerFilter(ctx, 'agenda')                                   // internalUserId | null → filtro da query
```

Regras:
- **Nunca** decida acesso por nome de cargo (`ctx.role === 'NETWORK_ADMIN'`).
  Para "só quem é da rede", use a abrangência: `ctx.branchId === null`.
- Toda leitura de módulo escopável passa `ownerFilter` para dentro da query.
  Filtrar só na renderização deixa o registro acessível pelo id.
- `provides_services` significa apenas: aparece como profissional na agenda e
  recebe comissão. Não é permissão e não deriva escopo.

---

## 12. Variáveis de ambiente

```bash
# Banco
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # apenas server-side

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_REST_TOKEN=

# Pagamentos
PAGARME_API_KEY=

# WhatsApp não oficial (uazapi). A API oficial não usa env: as credenciais de
# cada rede ficam em integration_configs.
UAZAPI_BASE_URL=https://bellarisos.uazapi.com
UAZAPI_ADMIN_TOKEN=
UAZAPI_MAX_INSTANCIAS=0            # 0 = sem teto
UAZAPI_PROXY_TEMPLATE=             # vazio = proxy gerenciado pela própria uazapi

# App
NEXT_PUBLIC_APP_URL=https://app.esteticaos.com.br
# (NEXT_PUBLIC_SCHEDULE_URL existia para o agendamento público, descartado — não é lida por nenhum código)

# Mobile (Expo — em app.config.ts)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 13. Design System — BellarisOS ("Rosé Vivo")

> **OBRIGATÓRIO:** Antes de construir qualquer componente visual, invoque a skill `/lumiere-design`.
> Ela contém tokens, componentes primitivos e guidelines completos da linguagem visual do projeto.
> Nunca introduza cores, tipografia ou sombras fora do que está definido nos tokens da skill.

A linguagem visual é **"Rosé Vivo"**: fundo off-white neutro (`#f8f8f8`), cards brancos com borda (sem sombra), cantos arredondados contidos (card 12px, campo 10px) e rosé saturado (`#c34d6b`) como único acento de marca. O fundo era nude rosado até 2026-09-24 — o rosa ali competia com o acento; o calor ficou nas bordas e divisórias, que seguem nude.

Princípios inegociáveis:
- **Hierarquia por preenchimento** — o elemento mais importante de um grupo é preenchido em `--brand` (rosé). Todo o resto fica branco com borda. Vale em toda tela que mostra um grupo de números: seis KPIs iguais não têm hierarquia nenhuma, e o olho não sabe onde pousar.
- **Nada de cor, sombra, raio ou tamanho de fonte escrito à mão** — todo valor vem de `var(--token)`. A paleta fechou em 2026-09-24 com `--danger`, `--info`, a escala categórica `--cat-1…6`, `--shadow-overlay`, `--shadow-popover` e `--gradient-brand`: antes faltava como pintar um erro, e a falta produziu 143 tons inventados e 587 usos da paleta do Tailwind. Cor de marca de terceiro (Facebook, Instagram, WhatsApp, Google) é a única exceção.
- **Tipografia única** — Hanken Grotesk em todo o sistema. Títulos e números em `800` com tracking negativo; overlines em `700` uppercase.
- **Ícones** — Lucide, linha, `currentColor`. O `✦` é motivo de marca, não ícone funcional.
- **Sombras apenas em elementos de marca** — botão primário, KPI hero, nav ativo. Superfícies neutras usam borda, nunca sombra. O que **flutua** sobre a página é a exceção e tem token: `--shadow-overlay` (modal, drawer) e `--shadow-popover` (dropdown, tooltip).
- **Sem gradientes de fundo** — único gradiente permitido é o card "Pacote ativo" (`--brand` → `--brand-deep`).
- **Seletor: a forma vem da FUNÇÃO**, não do gosto de quem escreve a tela.
  - escolha exclusiva, 2 a 5 opções curtas e **fixas** → `<SegSelect>` (vira
    dropdown sozinho no celular);
  - opções vindas de **dados**, ou mais de 5, ou longas → `.filtro-select`;
  - **liga/desliga** de um filtro só → `.filtro-toggle` + `aria-pressed`;
  - filtro que **acumula** (tag, marcador) → `.chip-filtro` + `aria-pressed`.
    Se é exclusivo, não é chip: a pílula solta promete que dá para marcar duas.
  - **Seletor de texto não leva ícone** — o rótulo já diz, e o ícone repetido
    cinco vezes na mesma barra vira ruído. O toggle pode levar: ali o ícone é
    o assunto que se liga.
  - Lista mestre-detalhe — tela com a lista de um lado e o detalhe do item
    escolhido do outro, como o Inbox e Clientes — e passo de wizard **não são
    seletores** e seguem as próprias regras.
- **Seletor tem UMA altura: `--altura-controle` (34px).** Vale para
  `<SegSelect>`, `.filtro-select`, `.filtro-toggle` e o campo de busca de uma
  barra de filtros, para que a barra feche numa linha só. O `<SegSelect>` tinha
  uma variante `compacto` que cada tela escolhia, e era por isso que o seletor
  de período do dashboard era mais alto que o de unidade da agenda. **A tela não
  escolhe tamanho de seletor** — se precisar de outro, o problema é a tela.
- **A aparência do seletor mora no CSS, não no `style` inline.** Foi o inline
  que permitiu quatro desenhos da mesma coisa: `style` vence classe, então um
  padding esquecido ali desfaz a padronização inteira sem erro nenhum.
- Em **painel estreito** (o de filtros do inbox tem 288px) o segmentado
  quebraria em duas linhas e deixaria de ler como um controle só: ali a escolha
  exclusiva vira `.filtro-select` de largura cheia (`.painel-de-filtros`).
- **Barra de rolagem em área de CONTEÚDO é ruído** — some, a rolagem fica
  (`scrollbar-width: none` mais `::-webkit-scrollbar`). O que avisa
  que há mais é o conteúdo cortado na borda: o card pela metade no fim da
  coluna, a aba cortada na lateral. Vale para as colunas do funil
  (`.crm-coluna-cards`), a rolagem lateral do quadro e as barras de aba.
  A exceção é o modal (`.modal-body`), onde a barra é fina e rosé.
- **Sobreposição no celular começa EMBAIXO da topbar**, nunca em
  `inset: 0`: `top: calc(var(--topbar-h) + env(safe-area-inset-top, 0px))`.
  A topbar desenha por cima dos primeiros 68px do documento, e o que costuma
  ficar escondido ali é o cabeçalho da folha — que é onde mora o botão de
  fechar. Foi o que deixou o card do contato do inbox sem saída no celular.
- **Popover ancorado num gatilho que fica à direita vira o lado no celular.**
  `left: 0` de um gatilho encostado na borda direita nasce metade fora da
  tela, e o que fica de fora não tem rolagem que o alcance. O `<SegSelect>`
  já decide o lado sozinho (mede o gatilho); painel escrito à mão precisa de
  `left: auto; right: 0` e um teto de largura em `vw`.
- **Campo de busca tem fundo branco** (`.campo-busca`), diferente dos demais
  campos, que usam `--bg-app`. A busca vive numa barra de filtros sobre o fundo
  do app; com o mesmo tom do fundo ela sumia na superfície em vez de convidar
  a digitar. O critério do que é busca é o ÍCONE DE LUPA, não o placeholder.
- **Copy em pt-BR**, sentence case, moeda no formato `R$ 1.240`, percentuais com vírgula (`12,4%`).

### Bibliotecas de UI (integração com o design system)

#### Web
- Componentes: shadcn/ui + Tailwind — estilizar com os tokens da skill `/lumiere-design`
- Formulários: `react-hook-form` + schemas do `@estetica-os/validators`
- Toasts: `sonner`
- Tabelas: `@tanstack/react-table`
- Calendário: `@fullcalendar/react`
- Datas: `date-fns` com locale `pt-BR`
- Moeda: `formatBRL` de `@estetica-os/utils`

#### Mobile
- Componentes base: NativeWind (Tailwind para React Native)
- Navegação: Expo Router
- Formulários: `react-hook-form` + schemas do `@estetica-os/validators` (mesmos do web)
- Datas: `date-fns` com locale `pt-BR`
- Câmera: `expo-camera` (fotos de prontuário)
- Imagens: `expo-image`

---

## 13.1 Indicadores — fonte única

> **OBRIGATÓRIO:** todo número exibido (KPI, gráfico, ranking, taxa, média) vem
> de `apps/web/lib/metrics/`. Nenhuma tela soma, conta ou divide por conta própria.

- **Agregação no Postgres**, nunca em JavaScript. As funções `metrics_*`
  (migrations `20260909000001..2`) fazem a conta no banco. Somar em JS o
  resultado de um `select` significa somar no máximo 1000 linhas — o teto do
  PostgREST — e subcontar em silêncio quando a base cresce.
- **Fuso**: janelas de período por `apps/web/lib/datetime.ts`
  (`startOfDayTZ`, `startOfMonthTZ`, `dayKeyTZ`…), nunca `new Date(y, m, d)`
  nem `startOfMonth()` do date-fns. O container roda com `TZ=America/Sao_Paulo`,
  mas os helpers não dependem do fuso do processo.
- **Período** por `resolvePeriod()`: o período anterior tem a mesma duração
  decorrida do atual. Comparar mês parcial com mês anterior inteiro faz todo
  delta nascer negativo.
- **Sem base de comparação, sem delta.** `delta()` retorna `null`; a UI mostra
  "sem dados anteriores". Nunca "▲ 100%" a partir do zero.
- **Nenhuma tela soma dinheiro.** Receita, despesa, ticket e as séries dos
  gráficos vêm de `getCore` / `getSeries` (`lib/metrics/`). Repetir a
  definição num `filter().reduce()` cria uma segunda cópia da regra, e duas
  cópias divergem — é questão de quando. Foi assim que a tela de relatórios
  mostrou **R$ 5.200 no cartão e R$ 5.450 na legenda do gráfico logo abaixo**:
  o KPI excluía o estorno e o gráfico, não.
  - O eixo do caixa é `paid_at`, nunca `created_at`. Filtrar a lista por
    `created_at` e somar dali põe a parcela criada em agosto e paga em
    setembro no mês errado — e o checkout de plano cria exatamente isso.
  - **O rótulo acompanha a conta.** "Ticket médio" é `serviceRevenue ÷
    atendimentos concluídos` em toda tela; se a conta for outra, o nome tem
    de ser outro. `e2e/relatorios-coerencia.spec.ts` compara tela, gráfico e
    banco para que a divergência não volte em silêncio.
- **Definições canônicas** (uma só por indicador):
  - `revenueCash` — recebido (INCOME pago, eixo em `paid_at`)
  - `revenuePending` — a receber
  - `serviceRevenue` — preço dos atendimentos concluídos (eixo em `scheduled_at`)
  - `ticketMedio` = `serviceRevenue ÷ atendimentos concluídos` — **numerador e
    denominador do mesmo conjunto**
  - `occupancy` = minutos agendados ÷ capacidade (`occupancyPct()`)
  - `retenção` = clientes atendidos no período que **já tinham sido atendidos
    antes dele** ÷ atendidos no período (`getRetention`). Não confundir com
    recorrência dentro da janela, que em períodos curtos dá zero por construção.
- **Zero é um dado, não ausência de dado.** Em métricas de anúncio, `0 ||
  undefined` transformava "zero clique no link" em "Indisponível" e escondia
  justamente a campanha problemática. Só use `undefined` quando a origem
  realmente não devolveu o campo.
- **Médias de referência são ponderadas** pela grandeza que as sustenta (ROI e
  CPA por investimento, CTR por impressões). Média simples por campanha deixa
  uma campanha de R$ 5 ditar a régua de todas as outras.
- **Estorno** sai dos dois lados: a transação marcada `notes='Estornada'` e a
  contra-transação `category='Estorno'`. Contar só uma faz o estorno bater duas
  vezes no resultado.
- **Receita e despesa simétricas**: se a receita exige `is_paid`, a despesa
  também. Senão o "lucro" mistura caixa de um lado com competência do outro.
- **Percentual de percentual não existe**: variação de margem é em **p.p.**
- **Janela DECORRIDA é do delta; LISTA usa o fim do período.**
  `resolvePeriod` devolve `to` (o quanto do período já passou, para
  comparar com o anterior de mesmo tamanho) e `fullTo` (o fim do período).
  Fechar uma lista em `to` é corrida de relógio: o `created_at` vem
  do Postgres, que está **à frente** do relógio do app — medi 0,2s contra o
  Supabase —, então o lançamento feito neste segundo nasce no futuro e some da
  tela que acabou de criá-lo. Preso em
  `e2e/financeiro-lancamento-aparece.spec.ts`.
- **Erro de query nunca é descartado — e isso vale no sistema inteiro, não só
  aqui.** `lib/db.ts` dá os três jeitos de terminar uma consulta, e nenhum é o
  silêncio: `gravar` (escreve, ou para o fluxo), `ler` (lê, ou para o fluxo) e
  `tentar` (registra e segue — só para o que é acessório, com o motivo escrito
  ao lado). `await admin.from(x).update(…)` solto não entra mais: ali o erro
  não chega nem a existir para o código.
  - Quem chama uma action que grava **tem de olhar o `{ error }`**. Fazer a
    gravação falhar alto e a tela engolir o resultado troca um silêncio por
    outro, mais caro de achar.
  - Sem checar `error`, drift de schema vira "R$ 0,00" silencioso em vez de
    falha visível. Foi assim que a lista de clientes do `/admin` passou meses
    com "última visita" em branco: `appointments` não tem `tenant_id`, o
    Postgres respondia 42703 e ninguém via.

Dados de demonstração para conferir os números na mão: `supabase/seed_demo.sql`
(idempotente; os valores esperados estão no cabeçalho do arquivo).

---

## 14. O que nunca fazer

```
❌ Query sem filtro de tenant_id, branch_id ou client_id
❌ Expor SUPABASE_SERVICE_ROLE_KEY no client-side ou no mobile
❌ Atualizar currentStock diretamente sem criar StockMovement
❌ Criar FinancialTransaction fora de um Appointment concluído sem justificativa
❌ Usar branchId ou tenantId hardcoded — sempre vir do contexto de autenticação
❌ Deixar cliente (role CLIENT) acessar prontuário, financeiro ou dados de outros clientes
❌ Deletar registros financeiros ou de prontuário — usar soft delete ou flags
❌ Criar lógica de negócio duplicada no web e no mobile — extrair para packages/
❌ Alterar price de um procedimento sem criar ProcedurePriceHistory
❌ Gerar exportação de LGPD dentro do request — usar after() + o cron de retomada
❌ Entregar pacote de LGPD com consulta que falhou em silêncio — no export, erro aborta
❌ Construir componente visual sem invocar /lumiere-design primeiro
❌ Usar o slug do registro para decidir portal (é lib/rotas quem decide)
❌ page.tsx sem assertPermission próprio, confiando no layout
❌ Somar/contar indicador na tela em vez de usar lib/metrics (trunca em 1000 linhas)
❌ Montar janela de período com new Date(y, m, d) ou startOfMonth() do date-fns
❌ Comparar período parcial com período anterior inteiro
❌ Descartar o error de uma query (vira R$ 0,00 silencioso) — use gravar/ler/tentar
❌ Fechar LISTA de período em "agora" (resolvePeriod.to) — use fullTo, o fim do período
❌ Tirar inicial de nome com nome[0] ou charAt(0) — use iniciaisDoNome (quebra em emoji)
❌ map() que devolve <> sem chave (a key no filho de dentro não conta)
❌ Criar agendamento sem procedure_id (a avaliação era a exceção e não existe mais)
❌ Confundir a ficha do PROCEDIMENTO (forms/form_data) com a anamnese GERAL do cliente
❌ Chamar action que grava e ignorar o { error } que ela devolve
❌ Escrever no banco fora de transação quando duas gravações precisam valer juntas
❌ Introduzir cores, fontes ou sombras fora dos tokens da skill /lumiere-design
❌ Escrever cor/sombra/raio/tamanho de fonte à mão em vez de var(--token)
❌ Escolher o tamanho de um seletor na tela (a altura é --altura-controle, e só)
❌ Pôr aparência de seletor no style inline — ele vence a classe e desfaz o padrão
❌ Abrir folha/overlay no celular em inset: 0 (fica atrás da topbar, sem fechar)
❌ Deixar barra de rolagem à mostra em área de conteúdo (só o modal a tem)
❌ Usar a paleta do Tailwind (red-600, green-600…) — o sistema tem a sua
❌ Encerrar uma entrega sem atualizar o DEVLOG e a memória (§16)
❌ Avaliar expressão de automação com eval/new Function (o texto vem do banco)
```

---

## 14.1 Jobs agendados (cron)

São **dois serviços** no Railway, com ritmos diferentes, e os dois rodam o
mesmo `node /app/cron.mjs` da mesma imagem. O script chama as rotas
`/api/cron/*` do app com o `CRON_SECRET` e sai com código 1 se alguma falhar —
assim a execução aparece vermelha no painel em vez de falhar em silêncio.

| Serviço | Ritmo | `CRON_JOBS` |
|---|---|---|
| **Notification Cron** | `0 * * * *` (hora em hora) | vazio = o padrão (`notification-campaigns`, `lgpd-exports`, `meta-capi`, `eventos-expirados`, `estoque-minimo`) |
| **Automations Cron** | `*/5 * * * *` (5 min) | `automacoes` |

O segundo existe porque **granularidade de uma hora não serve a automação**:
"esperar 30 minutos e mandar" viraria "em até 1h30". E os jobs do primeiro
varrem a base inteira — rodá-los de cinco em cinco minutos seria carga sem
motivo. Por isso a lista de jobs é escolhida por env (`CRON_JOBS`), e não um
script por serviço: o `railway.toml` da raiz fixa o Dockerfile para todos, e
cada ritmo novo faria o Dockerfile crescer.

**Para adicionar um job:** criar `apps/web/app/api/cron/<nome>/route.ts`
(protegida por `CRON_SECRET`) e acrescentar o nome ao `PADRAO` do script — ou
ao `CRON_JOBS` do serviço que deve chamá-lo.

Três detalhes de infraestrutura que não são óbvios e já custaram tempo:

- O serviço usa o **Dockerfile principal**, e `scripts/cron.mjs` é copiado para
  `/app/cron.mjs` no estágio runner. Não adianta criar um Dockerfile próprio: o
  `railway.toml` da raiz fixa `dockerfilePath = "Dockerfile"` e sobrescreve o
  que for configurado no serviço.
- Config-as-code **por serviço** foi depreciada pelo Railway — `railwayConfigFile`
  é recusado. Não há como dar um `railway.<algo>.toml` só para o cron.
- Start command **não é aplicado** a serviço cuja fonte é imagem pública. Com
  uma imagem como `alpine:3`, o container sobe o shell padrão, sai na hora e
  não executa nada, sem log e sem erro. A fonte precisa ser o repositório.

Para validar sem esperar uma hora: trocar o schedule para `*/5 * * * *`, criar
uma pendência real, conferir os logs do deployment e **restaurar `0 * * * *`**.

---

## 15. Comandos úteis

```bash
# Dev
pnpm dev                            # inicia todos os apps
pnpm dev --filter=web               # só o web
pnpm dev --filter=mobile            # só o mobile (Expo)

# Banco
pnpm db:migrate                     # roda migrations pendentes
pnpm db:studio                      # Prisma Studio (só leitura do schema legado)
pnpm db:seed                        # popula banco com dados de dev
pnpm db:reset                       # reseta banco (dev only)

# Supabase
supabase start                      # inicia Supabase local
supabase db push                    # aplica migrations SQL
supabase gen types typescript       # gera tipos do schema

# Mobile
eas build --platform ios            # build iOS via EAS
eas build --platform android        # build Android via EAS
eas submit                          # submete para as stores

# Qualidade
pnpm lint                           # ESLint em todos os packages
pnpm typecheck                      # tsc --noEmit em todos os packages
pnpm test                           # Vitest
pnpm --filter web test:e2e          # Playwright (sobe o dev sozinho)
```

---

## 16. Registrar o que foi feito

> **Toda entrega termina em três lugares: o código, o `DEVLOG.md` e a memória.**
> Vale para feature nova e para edição do que já existe — decisão do Heitor em
> 2026-09-18.

Uma entrega só está pronta quando:

1. **O commit está na `main`**, com o raciocínio na mensagem (por que, não só o
   quê). É o registro mais detalhado e o único que nunca se perde.
2. **O `DEVLOG.md` reflete o estado atual.** Ele é o panorama: se a mudança
   alterou o que o sistema faz, o que uma decisão de produto passou a ser, ou o
   que está em aberto, o texto correspondente muda junto. Frente grande ganha
   entrada na linha do tempo; ajuste pequeno normalmente só corrige a seção de
   estado ou risca uma pendência. **Não deixar acumular para o fim** — foi assim
   que ele ficou três meses parado.
3. **A memória do Claude foi atualizada** (`memory/bellaris.md`, arquivo único).
   Lá vai o que não cabe no repositório: preferências de trabalho do Heitor,
   armadilhas de ambiente, o que é falso de propósito no banco de teste, e onde
   o trabalho parou.

O que vai em cada lugar, quando há dúvida: **o repositório documenta o sistema**
(CLAUDE.md o que é regra permanente, DEVLOG o que aconteceu e o que falta); **a
memória documenta o contexto de trabalhar neste projeto com esta pessoa nesta
máquina**. Regra de negócio nova é CLAUDE.md. Entrega é DEVLOG. "O dev server
morre por memória nesta máquina" é memória.

---

*BellarisOS — CLAUDE.md v1.5 | 25 de setembro de 2026*
