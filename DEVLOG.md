# DEVLOG — EstéticaOS

Registro cronológico de decisões, bloqueios e entregas. Uma entrada por sessão de trabalho.

---

## 2026-06-20 — Supabase MCP: Projeto provisionado ✅

### Projeto
- **Nome:** estetica-os
- **ID:** `tljoelsndawvfvifepqo`
- **Região:** sa-east-1 (São Paulo)
- **URL:** https://tljoelsndawvfvifepqo.supabase.co
- **Dashboard:** https://supabase.com/dashboard/project/tljoelsndawvfvifepqo

### O que foi feito via MCP
- [x] Projeto criado (free tier)
- [x] Schema completo aplicado (33 tabelas + 11 enums)
- [x] JWT custom claims functions (`set_user_claims`, `set_client_claims`)
- [x] RLS policies para todas as tabelas
- [x] Seed de dev: tenant `lumiere-dev`, branch `centro`, loyalty config
- [x] `.env.local` criado com URL e anon key

### Pendente (manual)
- [ ] Preencher `DATABASE_URL` e `DIRECT_URL` com a senha do banco
  → Dashboard > Project Settings > Database > Connection string
- [ ] Preencher `SUPABASE_SERVICE_ROLE_KEY`
  → Dashboard > Project Settings > API > service_role
- [ ] Criar primeiro usuário admin
  → Dashboard > Authentication > Users > Add user
  → Rodar: `select public.set_user_claims('<auth_id>', '00000000-0000-0000-0000-000000000001', null, 'NETWORK_ADMIN');`

---

## 2026-06-20 — Sprint 1: Fundação ✅

### Contexto
Início do projeto do zero. Apenas o schema.prisma, PRD e CLAUDE.md existiam.

### Decisões

**Monorepo:** Turborepo + pnpm workspaces. Estrutura `apps/` (web, mobile) + `packages/` (db, types, validators, utils).

**pnpm 11:** Requer `allowBuilds` explícito em `pnpm-workspace.yaml` para Prisma, esbuild, sharp, unrs-resolver.

**Auth:** Supabase Auth com custom JWT claims (`tenant_id`, `branch_id`, `role`, `client_id`). Functions SQL `set_user_claims` e `set_client_claims` chamadas manualmente ao criar usuários/vincular clientes.

**Packages em dev:** tsconfig do web aponta `paths` para os arquivos `src/` dos packages (evita build prévio em dev). Em produção o Turborepo builda os packages antes.

**React 19 Server Actions:** `useActionState` requer `(prevState, formData)` na assinatura da action, não só `(formData)`.

**Design system:** Todos os tokens CSS do Lumière (cores, tipo, raios, sombras, espaçamento, layout) vivem em `apps/web/app/globals.css`. Skill `/lumiere-design` é a referência canônica para componentes novos.

### O que foi feito
- [x] Monorepo root (Turborepo + pnpm + turbo.json + tsconfig.base.json + .gitignore)
- [x] `packages/types` — JwtClaims, TenantContext, UserRole, tipos de domínio
- [x] `packages/validators` — LoginSchema, ClientLoginSchema, CreateAppointmentSchema, CreateClientSchema, CreateProcedureSchema, CompleteAppointmentSchema
- [x] `packages/utils` — formatBRL, formatDate, maskCPF, maskPhone, CLIENT_TAGS
- [x] `packages/db` — Prisma schema (copiado), client singleton, seed de dev
- [x] `apps/web` (Next.js 16, Tailwind v4) — todas as dependências instaladas
- [x] `apps/web/app/globals.css` — tokens Lumière completos + componentes base CSS
- [x] Supabase clients (server, browser, middleware) com tipos explícitos
- [x] `lib/auth.ts` — getTenantContext, assertRole, assertBranchAccess, getRedirectPath
- [x] `middleware.ts` — proteção de rotas + refresh de sessão
- [x] `(auth)/login` — tela de login operacional com design Lumière
- [x] `(auth)/reset-password` — recuperação de senha
- [x] Layout `/admin` — sidebar + topbar + proteção NETWORK_ADMIN
- [x] Layout `/[slug]` — sidebar por filial + validação de acesso à filial correta
- [x] `NavItem`, `BranchSidebar`, `AdminSidebar`, `Topbar` — componentes Lumière
- [x] Migrations SQL: functions JWT claims + RLS policies completas
- [x] `.env.local.example` para onboarding de devs
- [x] TypeScript sem erros (`tsc --noEmit` limpo)

### Bloqueios resolvidos
- pnpm 11 `allowBuilds` — documentado acima.
- React 19 `useActionState` signature — documentado acima.

---

## Próxima sessão — Sprint 2: Core Operacional Web

**Foco:** Módulo Clientes → Módulo Procedimentos → Módulo Agenda

**Pré-requisito para rodar o app:**
1. Criar projeto Supabase (local com `supabase start` ou remoto)
2. Copiar `.env.local.example` → `.env.local` e preencher
3. `pnpm db:migrate` para rodar as migrations Prisma
4. `supabase db push` para aplicar as migrations SQL (RLS + JWT claims)
5. `pnpm dev --filter=web`
