# DEVLOG — BellarisOS

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
- [x] Seed de dev: tenant `bellaris-dev`, branch `centro`, loyalty config
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

**Design system:** Todos os tokens CSS do BellarisOS (cores, tipo, raios, sombras, espaçamento, layout) vivem em `apps/web/app/globals.css`. Skill `/lumiere-design` é a referência canônica para componentes novos.

### O que foi feito
- [x] Monorepo root (Turborepo + pnpm + turbo.json + tsconfig.base.json + .gitignore)
- [x] `packages/types` — JwtClaims, TenantContext, UserRole, tipos de domínio
- [x] `packages/validators` — LoginSchema, ClientLoginSchema, CreateAppointmentSchema, CreateClientSchema, CreateProcedureSchema, CompleteAppointmentSchema
- [x] `packages/utils` — formatBRL, formatDate, maskCPF, maskPhone, CLIENT_TAGS
- [x] `packages/db` — Prisma schema (copiado), client singleton, seed de dev
- [x] `apps/web` (Next.js 16, Tailwind v4) — todas as dependências instaladas
- [x] `apps/web/app/globals.css` — tokens BellarisOS completos + componentes base CSS
- [x] Supabase clients (server, browser, middleware) com tipos explícitos
- [x] `lib/auth.ts` — getTenantContext, assertRole, assertBranchAccess, getRedirectPath
- [x] `middleware.ts` — proteção de rotas + refresh de sessão
- [x] `(auth)/login` — tela de login operacional com design BellarisOS
- [x] `(auth)/reset-password` — recuperação de senha
- [x] Layout `/admin` — sidebar + topbar + proteção NETWORK_ADMIN
- [x] Layout `/[slug]` — sidebar por filial + validação de acesso à filial correta
- [x] `NavItem`, `BranchSidebar`, `AdminSidebar`, `Topbar` — componentes BellarisOS
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

---

> ⚠️ **Hiato de 2026-06-20 a 2026-09-17.** Nada foi registrado aqui nesse
> período, e foi quando a maior parte do sistema nasceu: inbox omnichannel,
> CRM, permissões dinâmicas, LGPD, indicadores, planos de tratamento, mapa de
> injetáveis. **Para o estado recente, `git log --oneline` é a fonte** — cada
> commit carrega o raciocínio na mensagem. O projeto Supabase citado na entrada
> de 20/06 (`tljoelsndawvfvifepqo`) foi aposentado; o ativo é
> `tagetlgivjbwhfscofjs`, e o produto passou a se chamar BellarisOS.

---

## 2026-09-18 — O admin opera tudo pelo `/admin`, testes, permissão por relatório, fim do caixa ✅

### Contexto

Dois defeitos vindos do mesmo lugar (criar plano pelo `/admin` falhava por falta
de unidade; a agenda da rede era só leitura) expuseram o padrão: o portal da
rede mostrava o consolidado e não deixava agir, forçando o admin a entrar no
portal de uma unidade — o que o CLAUDE.md §6 proíbe. **Não era permissão nem
RLS: era interface.**

### Entregue (um commit por frente; o raciocínio está em cada mensagem)

| Commit | O quê |
|---|---|
| `79c69cb` | Agendar só com nome e telefone — cliente nasce no ato |
| `9ee1263` `685a5f1` | Agendar e conduzir o atendimento pela agenda da rede |
| `8d88ba3` `3023a7b` | Dinheiro pela rede; gravações que iam para a unidade errada |
| `aeb6e39` | Permissões do admin no banco, abrangência valendo na hora |
| `439b4cc` | Ações que existiam no back-end e não tinham porta em portal nenhum |
| `fa3348c` | `/[slug]/settings` de verdade; procedimento só pela rede |
| `6743eba` | Suíte automatizada: 151 unitários (Vitest) + 31 E2E (Playwright) |
| `963b77d` | Painel comercial vira aba de Relatórios |
| `3d9189f` | Cada aba de Relatórios vira permissão do cargo (`role_report_tabs`) |
| `6f6a7d1` | **Caixa de abrir/fechar removido** |
| `ea1f556` `2a2adda` | Seção Planejamento no menu: Tratamentos + Injetáveis |

### Decisões de produto (do Heitor, nesta sessão)

- **O produto é ERP + CRM de clínica**, não um financeiro com agenda em volta, e
  **o cliente típico tem UMA unidade** — multiunidade segue no modelo, mas é
  exceção (rede grande costuma ser franquia, que já tem sistema). CLAUDE.md §1
  reescrito.
- **Procedimento e configuração são dados da REDE.** A unidade vê o catálogo;
  criar, editar e remover exige abrangência de rede.
- **Caixa removido.** Menos de 1% dos recebimentos é em dinheiro; o fechamento
  existe para contar a gaveta, e não há gaveta. `cash_registers` e
  `cash_register_id` ficam no banco com o histórico, sem escrita nova. O módulo
  `cashier` sobrevive significando RECEBER na recepção.
- **Relatórios por aba.** `reports: VIEW` abre a tela; `role_report_tabs` diz
  quais abas o cargo enxerga. Cargos existentes começaram **sem nenhuma** —
  precisam ser liberados um a um em Configurações → Cargos.

### Banco

Migrations aplicadas via MCP, com paridade em `supabase/migrations/`:
`20260918000001` (`cliente_por_telefone`), `…02` (`buscar_clientes`),
`…03` (permissões do cargo Admin da rede), `…04` (`role_report_tabs`).

### Pendências

- **`estetica-os-prd.md` está desatualizado**: descreve "SaaS para redes de 2–5
  filiais" e caixa com abertura/fechamento diário.
- **Fidelidade** continua sem módulo (só saldo read-only no portal do cliente).
- Da frente do inbox: app da Meta não existe, nenhum número real pareado,
  `META_VERIFY_TOKEN` fora do Railway.
- **Prisma está morto** no repo (`lib/prisma.ts` sem consumidor) e o CLAUDE.md
  §2/§8 ainda o descreve como ORM.
