# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. O que é este projeto

EstéticaOS é um SaaS B2B para redes de clínicas de estética (2–5 filiais).
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
| Web Framework | Next.js 14 (App Router) |
| Mobile Framework | Expo (React Native) |
| Linguagem | TypeScript (strict) em todos os packages |
| Estilo Web | Tailwind CSS + shadcn/ui |
| Estilo Mobile | NativeWind + componentes customizados |
| Banco | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | Supabase Auth (JWT + RLS) |
| Storage | Supabase Storage (fotos de prontuário) |
| Cache / Filas | Upstash Redis + BullMQ |
| Pagamentos | Pagar.me (assinaturas da rede) |
| WhatsApp | Z-API ou Evolution API |
| Push Notifications | Expo Push Notifications |
| Deploy Web | Vercel |
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
│   │   │   └── schedule/             agendamento online público
│   │   │       └── [slug]/
│   │   ├── components/
│   │   │   ├── ui/                   shadcn/ui (não editar diretamente)
│   │   │   ├── shared/               componentes reutilizáveis entre portais
│   │   │   ├── admin/                exclusivos do portal admin
│   │   │   └── branch/               exclusivos do portal de filial
│   │   ├── lib/
│   │   │   ├── supabase/             clients (server, client, middleware)
│   │   │   ├── prisma.ts             singleton do Prisma client
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
│   ├── db/                           schema Prisma + migrations
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
4. Prisma **sempre** recebe `tenantId` e/ou `branchId` como filtro obrigatório
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
| `/schedule/[slug]` | Público | Sem autenticação |

Redirect pós-login:
```
NETWORK_ADMIN  → /admin/dashboard
outros         → /[branch.slug]/dashboard
```

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
import { getTenantContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { CreateAppointmentSchema } from '@estetica-os/validators'

export async function createAppointment(input: unknown) {
  const ctx = await getTenantContext()
  const data = CreateAppointmentSchema.parse(input)

  // branchId SEMPRE vem do contexto — nunca do input do cliente
  const appointment = await prisma.appointment.create({
    data: { ...data, branchId: ctx.branchId! },
  })

  revalidatePath(`/${ctx.branch?.slug}/agenda`)
  return appointment
}
```

### Queries Prisma — filtro obrigatório

```typescript
// ✅ Usuário operacional — filtrar por branchId
const clients = await prisma.client.findMany({
  where: { branchId: ctx.branchId },
})

// ✅ Network Admin — filtrar por tenantId
const branches = await prisma.branch.findMany({
  where: { tenantId: ctx.tenantId },
})

// ✅ Cliente final — filtrar por clientId
const appointments = await prisma.appointment.findMany({
  where: { clientId: ctx.clientId },
})

// ❌ NUNCA — sem filtro
const clients = await prisma.client.findMany()
```

---

## 9. Módulos do sistema

### 9.1 Agenda
- Status: `SCHEDULED → CONFIRMED → IN_PROGRESS → COMPLETED → CANCELLED | NO_SHOW`
- Campos de timestamp por transição: `confirmedAt`, `startedAt`, `completedAt`, `cancelledAt`
- Campo `source`: `INTERNAL` (web/app operacional), `ONLINE` (link público), `CLIENT_APP` (app do cliente)
- `clientNotes`: observações que o cliente envia ao agendar pelo app
- `roomId`: sala/cabine opcional — uma sala não pode ter dois agendamentos simultâneos (validar no action)
- `cancellationReason`: obrigatório ao cancelar para rastreabilidade
- Ao marcar `COMPLETED`: disparar consumo de estoque + `FinancialTransaction` + `Commission` + pontos de fidelidade (tudo em `prisma.$transaction`)

### 9.2 Clientes / CRM
- CPF (`document`) único por `tenantId` — constraint `@@unique([tenantId, document])`
- `authId` em `Client` é opcional — preenchido apenas quando o cliente cria conta no app
- `LoyaltyAccount` criada automaticamente no primeiro cadastro
- `firstAppLoginBonus` em `LoyaltyConfig`: pontos creditados no primeiro login do cliente no app
- `LoyaltyConfig.scopePerBranch`: `false` = pontos consolidados em toda a rede
- Tags como `String[]` — constantes em `packages/utils/client-tags.ts`
- `InternalCredit`: saldo de crédito do cliente na filial (gerado por estorno); usado como método de pagamento `INTERNAL_CREDIT`
- `LgpdRequest`: solicitação de exportação ou exclusão de dados (`type: "export" | "delete"`); processar de forma assíncrona

### 9.3 Procedimentos
- `branchId: null` = catálogo base da rede (criado pelo NETWORK_ADMIN)
- `visibleOnClientApp`: controla se o procedimento aparece para o cliente agendar pelo app
- `ProcedurePriceHistory`: criada automaticamente ao alterar `price` de um procedimento
- `ProcedureProduct`: insumos consumidos por execução — base do consumo automático de estoque

Query correta para buscar procedimentos de uma filial:
```typescript
const procedures = await prisma.procedure.findMany({
  where: {
    tenantId: ctx.tenantId,
    isActive: true,
    OR: [
      { branchId: null },           // catálogo base da rede
      { branchId: ctx.branchId },   // procedimentos locais da filial
    ],
  },
})
```

### 9.4 Prontuário
- `MedicalRecord`: 1 por cliente
- `MedicalRecordEntry`: 1 por `Appointment` concluído (`appointmentId @unique`)
- `AnamnesisData`: JSON livre por entrada — a estrutura do formulário varia por categoria de procedimento
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
- `CashRegister` deve estar aberto para receber lançamentos (validar no action)
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
- Notificações operacionais: novo agendamento, cancelamento, estoque mínimo
- Notificações para cliente: confirmação, lembrete 24h antes, promoções
- Fallback de notificação WhatsApp para quando push falhar (Z-API / Evolution API)

---

## 10. Fluxo de conclusão de atendimento

Executar em `prisma.$transaction`:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Atualizar status do agendamento
  await tx.appointment.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } })

  // 2. Criar entrada no prontuário
  await tx.medicalRecordEntry.create({ data: { ... } })

  // 3. Baixar estoque
  for (const item of procedure.products) {
    await tx.stockMovement.create({ data: { type: 'PROCEDURE_USAGE', quantity: -item.quantity, ... } })
    await tx.product.update({ where: { id: item.productId }, data: { currentStock: { decrement: item.quantity } } })
  }

  // 4. Criar transação financeira
  await tx.financialTransaction.create({ data: { type: 'INCOME', ... } })

  // 5. Criar comissão
  await tx.commission.create({ data: { ... } })

  // 6. Atualizar sessão de pacote (se aplicável)
  if (packageSessionId) {
    await tx.packageSession.update({ where: { id: packageSessionId }, data: { status: 'USED', usedAt: new Date() } })
  }

  // 7. Creditar pontos de fidelidade
  await tx.loyaltyTransaction.create({ data: { points: calcPoints(price), ... } })
})
```

---

## 11. Permissões por módulo

| Módulo | NETWORK_ADMIN | BRANCH_ADMIN | RECEPTIONIST | PROFESSIONAL | FINANCIAL | CLIENT |
|---|---|---|---|---|---|---|
| Dashboard rede | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gerenciar filiais | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Agenda (todos) | ✅ | ✅ | ✅ | Própria | ❌ | ❌ |
| Agenda (própria) | — | — | — | ✅ | ❌ | Ver/Criar |
| Clientes | ✅ | ✅ | ✅ | Ver | ❌ | Próprio |
| Prontuário | ✅ | ✅ | ❌ | Próprios | ❌ | ❌ |
| Procedimentos | ✅ | ✅ | Ver | Ver | ❌ | Ver (app) |
| Estoque | ✅ | ✅ | Ver | ❌ | Ver | ❌ |
| Financeiro | ✅ | ✅ | Caixa | Comissões | ✅ | ❌ |
| Pontos / Pacotes | ✅ | ✅ | Ver | ❌ | ❌ | Próprios |
| Configurações | ✅ | Filial | ❌ | ❌ | ❌ | ❌ |

```typescript
// lib/auth.ts
export function assertRole(ctx: TenantContext, allowed: UserRole[]) {
  if (!allowed.includes(ctx.role)) throw new Error('Forbidden')
}
```

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

# WhatsApp
ZAPI_INSTANCE_ID=
ZAPI_TOKEN=

# App
NEXT_PUBLIC_APP_URL=https://app.esteticaos.com.br
NEXT_PUBLIC_SCHEDULE_URL=https://agenda.esteticaos.com.br

# Mobile (Expo — em app.config.ts)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 13. Design System — Lumière ("Rosé Vivo")

> **OBRIGATÓRIO:** Antes de construir qualquer componente visual, invoque a skill `/lumiere-design`.
> Ela contém tokens, componentes primitivos e guidelines completos da linguagem visual do projeto.
> Nunca introduza cores, tipografia ou sombras fora do que está definido nos tokens da skill.

A linguagem visual é **"Rosé Vivo"**: fundo nude quente, cards brancos com borda (sem sombra), cantos arredondados generosos e rosé saturado (`#c34d6b`) como único acento de marca.

Princípios inegociáveis:
- **Hierarquia por preenchimento** — o elemento mais importante de um grupo é preenchido em `--brand` (rosé). Todo o resto fica branco com borda.
- **Tipografia única** — Hanken Grotesk em todo o sistema. Títulos e números em `800` com tracking negativo; overlines em `700` uppercase.
- **Ícones** — Lucide, linha, `currentColor`. O `✦` é motivo de marca, não ícone funcional.
- **Sombras apenas em elementos de marca** — botão primário, KPI hero, nav ativo. Superfícies neutras usam borda, nunca sombra.
- **Sem gradientes de fundo** — único gradiente permitido é o card "Pacote ativo" (`--brand` → `--brand-deep`).
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

## 14. O que nunca fazer

```
❌ Query Prisma sem filtro de tenantId, branchId ou clientId
❌ Expor SUPABASE_SERVICE_ROLE_KEY no client-side ou no mobile
❌ Atualizar currentStock diretamente sem criar StockMovement
❌ Criar FinancialTransaction fora de um Appointment concluído sem justificativa
❌ Usar branchId ou tenantId hardcoded — sempre vir do contexto de autenticação
❌ Deixar cliente (role CLIENT) acessar prontuário, financeiro ou dados de outros clientes
❌ Deletar registros financeiros ou de prontuário — usar soft delete ou flags
❌ Criar lógica de negócio duplicada no web e no mobile — extrair para packages/
❌ Alterar price de um procedimento sem criar ProcedurePriceHistory
❌ Processar LgpdRequest de exclusão de forma síncrona — sempre via fila (BullMQ)
❌ Construir componente visual sem invocar /lumiere-design primeiro
❌ Introduzir cores, fontes ou sombras fora dos tokens da skill /lumiere-design
```

---

## 15. Comandos úteis

```bash
# Dev
pnpm dev                            # inicia todos os apps
pnpm dev --filter=web               # só o web
pnpm dev --filter=mobile            # só o mobile (Expo)

# Banco
pnpm db:migrate                     # roda migrations pendentes
pnpm db:studio                      # Prisma Studio
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
```

---

*EstéticaOS — CLAUDE.md v1.2 | Junho 2026*
