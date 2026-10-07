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
- **Portal do cliente final** (`/[slug]/cliente`) — agendamento self-service, histórico, financeiro, LGPD
- **App Android** (`apps/native`) — o MESMO portal web dentro de um Capacitor, com push nativo. Não há
  app com código próprio, nem iOS: tela nova é tela web.

E a PLATAFORMA — a equipe do BellarisOS — em dois apps próprios, cada um no seu
host, fora da clínica (2026-10-06): o **sistema** (`apps/sistema`,
admin.bellarisos.com: o ADMIN administra, o GERENTE só vê) e o **suporte** (`apps/suporte`,
suporte.bellarisos.com). Regras em `docs/regras/plataforma.md`.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Web Framework | Next.js 16.3.4 (App Router) — ver a nota abaixo da tabela |
| App | Capacitor (Android), casca do portal web |
| Linguagem | TypeScript (strict) em todos os packages |
| Estilo Web | Tailwind CSS + shadcn/ui |
| Banco | PostgreSQL via Supabase |
| Acesso ao banco | Cliente Supabase (PostgREST) + `lib/db.ts` |
| Auth | Supabase Auth (JWT + RLS) |
| Storage | Supabase Storage (fotos de prontuário) |
| Filas | Postgres (`automation_runs`) + `after()` + cron — sem broker |
| Pagamentos | Asaas (assinaturas das redes — §6, "Administração do sistema") |
| WhatsApp | uazapi (não oficial) + Cloud API da Meta (oficial) |
| Push Notifications | Web Push (VAPID) no navegador + FCM no app Android |
| Deploy Web | Railway (Docker) |
| Deploy do app | `npx cap sync` + build do Android |
| Monorepo | Turborepo |

---

⚠️ **Next fixado em 16.3.4, e não sobe sozinho.** Abaixo de 16.3.0 o router
travava a action que um `router.refresh()` atropelava (formulário eterno em
"Criando…", com o registro gravado — vercel/next.js#86151, corrigido no PR
#95391). A partir de 16.3.5 o `router.refresh()` deixa de buscar a página nova
em página com streaming (#99028). Subir de versão exige a suíte contra o BUILD
(`test:e2e:completa` ou o GitHub Actions): nenhum dos dois aparece no `next dev`.

## 3. Estrutura de pastas

```
estetica-os/                          (raiz do monorepo)
├── apps/
│   ├── web/                          a CLÍNICA (app.bellarisos.com): Next.js
│   │   ├── app/                      (auth)/, admin/ (rede), [slug]/ (unidade),
│   │   │                             [slug]/cliente/ (cliente final), api/, _shared/
│   │   ├── components/               shared/, admin/, branch/, client-portal/
│   │   ├── lib/                      auth.ts, permissions, metrics/, … (e os shims do núcleo)
│   │   └── actions/                  Server Actions
│   ├── sistema/                      a ADMINISTRAÇÃO da plataforma (admin.*, ADMIN; GERENTE vê)
│   ├── suporte/                      o ATENDIMENTO da plataforma (suporte.*)
│   └── native/                       Capacitor — casca Android da clínica
├── packages/
│   ├── nucleo/                       o que os três apps dividem (§7)
│   ├── types/  validators/  utils/
├── supabase/migrations/              SQL (RLS, funções, gatilhos)
├── docs/regras/                      as regras de cada módulo (índice no §9)
├── Dockerfile                        UMA imagem; o app sai de BELLARIS_APP (docs/regras/infra.md)
├── DEVLOG.md
└── CLAUDE.md
```

---

## 4. Arquitetura multi-tenant

### Regra de ouro

> Todo dado operacional carrega `tenantId` + `branchId`.
> Nunca busque dados sem filtrar por pelo menos um dos dois.
> Clientes finais (`role: CLIENT`) só enxergam os próprios dados via `clientId`.

### Como o isolamento funciona

⚠️ **A sessão mora só no servidor** (2026-10-06): todo cookie do Supabase passa
por `opcoesDoCookieDeSessao` (`lib/supabase/cookie-de-sessao.ts`: httpOnly,
lax, sem domínio). O navegador não lê nem renova a sessão — o cliente de
`lib/supabase/client.ts` serve só ao Realtime e pega o ACCESS token em
`/api/auth/token` (nunca o refresh). Login, saída e "quem sou eu" são do
servidor. Prova: `e2e/sessao-httponly.spec.ts`.

1. Usuário autentica via Supabase Auth
2. JWT contém claims customizados: `tenant_id`, `branch_id`, `role`, `client_id`
3. Middleware do Next.js (web) ou contexto do app (mobile) lê esses claims
4. Toda query **sempre** filtra por `tenant_id` e/ou `branch_id`
5. RLS do Postgres é a segunda linha de defesa

⚠️ **A RLS só vale se conferir a REDE.** A anon key está no bundle do
navegador: qualquer funcionário logado fala direto com o PostgREST, sem passar
pelo app. Até 2026-09-27 o prontuário e a fidelidade só exigiam
`role <> 'CLIENT'` — funcionário de qualquer rede lia e escrevia os de todas.
- Tabela sem `tenant_id` confere a rede pela cadeia até o cliente, com os
  helpers `private.cliente_da_minha_rede`, `prontuario_da_minha_rede`,
  `entrada_da_minha_rede`, `conta_de_pontos_da_minha_rede`
  (migration `20260927000004`). Policy nova usa `USING` **e** `WITH CHECK` —
  sem o CHECK dá para plantar linha no cliente de outra rede.
- Função `security definer` em `public` que recebe a rede por parâmetro é
  endpoint aberto: `revoke execute … from public, anon, authenticated` e
  `grant … to service_role`.
- A prova é `e2e/rls-isolamento.spec.ts`, que fala com o banco **com o token de
  um membro**. Teste com `service_role` não prova RLS nenhuma.
- **Credencial não tem política nenhuma.** `integration_configs`,
  `whatsapp_numbers` e `whatsapp_number_users` têm RLS ligada e ZERO políticas
  (migration `20260928000005`): a sessão não lê nem escreve, só o servidor
  (service role). Até 2026-09-28 conferiam só a rede, e um SDR lia o token da
  Meta pela chave pública. Tela que precise de algo dali pelo navegador não
  reabre a tabela: expõe só as colunas sem segredo, numa view ou função.
  Prova: `e2e/credenciais-fora-da-sessao.spec.ts`.
- **Realtime de tela que mostra dado com escopo assina um SINAL, não a tabela.**
  O quadro de oportunidades assina `crm_quadro_sinais` (uma linha por rede,
  marcada por gatilho em leads, etapas e funis) e recarrega pelo servidor, que
  aplica o alcance. Assinar `leads` exigiria abrir a leitura pela sessão — e a
  linha inteira iria pelo websocket a quem o "só os meus" esconde. Prova:
  `e2e/quadro-tempo-real.spec.ts` (membro da rede e de unidade).
- ⚠️ Política que compara `auth.jwt() ->> 'x'` está ERRADA: as claims moram em
  `app_metadata` — use `jwt_claim('x')`. A de `leads` era assim e nunca valeu.
  (Sobram cinco assim — `appointment_history`, `branch_product_stock`,
  `crm_stages`, `lead_procedures`, `treatment_plan_items` —, permissivas e
  mortas: dão sempre falso, não abrem nada.)
- ⚠️ **No Realtime, o nulo da claim chega como o TEXTO `"null"`**
  (`realtime.subscription.claims`: `"branch_id": "null"`). `jwt_claim` trata o
  texto `'null'` como nulo (migration `20261005000001`). Sem isso,
  `can_access_branch` fazia `'null'::uuid` para todo membro da rede, e o
  Realtime DESCARTA o lote inteiro de mudanças em que uma política estoura —
  para todos os inscritos. Política ou função nova que leia claim sem passar
  por `jwt_claim` (ou que faça `::uuid` de uma) traz isso de volta.

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

### Contexto no servidor

`getTenantContext()` (`lib/auth.ts`) monta o contexto de toda página e action
a partir dos claims (`app_metadata`) e do membro no banco. O modelo de uma
action e das consultas com filtro está em `docs/regras/convencoes.md`.

---

## 5. Dois tipos de usuário — diferenças críticas

| Aspecto | Usuário Operacional | Cliente Final |
|---|---|---|
| Model no banco | `User` | `Client` |
| Role no JWT | NETWORK_ADMIN, BRANCH_ADMIN, RECEPTIONIST, PROFESSIONAL, FINANCIAL | CLIENT |
| `tenant_id` no JWT | Preenchido | `null` |
| `client_id` no JWT | `null` | Preenchido |
| Login | E-mail + senha | E-mail + senha (a inicial é o CPF; a clínica cria o acesso no cadastro) |
| Plataformas | Web + app Android | Portal do cliente (web + app Android) |
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
  conferindo: o layout protege a navegação, não a URL. E mais: **layout e
  página renderizam em PARALELO** — o `redirect` do layout decide a resposta,
  mas o código da página roda mesmo assim, com as consultas dela. Página sem
  módulo (os dashboards) repete a trava do layout.
- O layout de `[slug]` deixa o CLIENTE passar (é por ele que se chega a
  `/[slug]/cliente`): tela de equipe em `[slug]` sem `assertPermission` é tela
  aberta ao cliente final. Prova em `e2e/portais-isolamento.spec.ts`.
- **Rota PÚBLICA se declara em `lib/supabase/middleware.ts`**, não só deixando
  de chamar `getTenantContext`. O proxy manda para `/login` tudo que
  não estiver na lista — a página pode não pedir sessão e mesmo assim nunca ser
  vista. Hoje são: `/`, `/privacidade`, `/verificar*` (conferir documento
  assinado), `/assinar/*` (o link de assinatura), `/schedule*` e
  `/api/*`, mais as telas de autenticação.
  - Quem precisa disso: o que é lido por quem **ainda não entrou** ou **nunca
    vai entrar**. A política de privacidade é o caso típico — e loja de
    aplicativo exige uma URL pública para publicar o app.
  - `/auth/confirm` também é pública: é a volta do link de e-mail do
    Supabase, e é ela que ABRE a sessão (troca `?code=` ou `?token_hash=`,
    e segue para `next`, só caminho interno). A recuperação de senha passa
    por ela até `/update-password`. Prova: `e2e/autenticacao.spec.ts`.
  - ⚠️ Com confirmação de e-mail ligada, `signUp` de e-mail já cadastrado NÃO
    dá erro — devolve usuário sem `identities` e com id fictício. Quem cria
    coisa depois do `signUp` confere `identities.length` antes.
  - `e2e/privacidade-publica.spec.ts` confere sem sessão
    (`storageState` vazio), que é o único jeito de a regressão aparecer:
    logado, a página abre de qualquer forma.
- ⚠️ **Endereço público nunca sai de `req.url` / `req.nextUrl.origin`.** O
  servidor standalone (o do Docker) monta os dois a partir do `HOSTNAME` em
  que escuta (`0.0.0.0`), não do domínio acessado: até 2026-09-28
  `/auth/confirm` mandava para `https://0.0.0.0:8080/login` em produção — todo
  link de e-mail e o retorno do OAuth da Meta quebrados. Redirect absoluto e
  `redirect_uri` usam `origemPublica` / `urlPublica` (`lib/origem.ts`). No
  `next dev` não aparece: só a suíte contra o build pega.
- ⚠️ **Por isso toda rota de `/api/*` se defende sozinha** — o proxy não barra
  nenhuma. Cron pelo `CRON_SECRET`, webhook pela assinatura ou token do
  provedor, e o resto por
  sessão **e permissão** (`getTenantContext` + `can`). Foi o que faltou no
  `/api/geocode` (proxy aberto) e no OAuth da Meta (qualquer membro trocava a
  conta ligada à rede). Rota nova entra em `e2e/api-sem-credencial.spec.ts`.

### Busca universal (topbar, 2026-10-03)

Em `docs/regras/busca.md`.

### Plataforma e suporte (apps próprios desde 2026-10-06)

Em `docs/regras/plataforma.md`: os apps `sistema` e `suporte` (outros hosts),
as assinaturas pelo Asaas, a rede bloqueada, o "entrar como" entre origens, o
cache entre processos e os chamados. ⚠️ A clínica RECUSA a marca da
plataforma. Mexeu em `buildContext`, `jwt_claim`, no proxy ou nos destinos de
login, leia antes: o portão da rede bloqueada e a sessão de suporte moram ali.

### App (Android)

O app é o portal web num Capacitor: as rotas são as mesmas, e o login decide o
portal pelo contexto (rede, unidade ou cliente final). O que é nativo é pouco —
push (FCM), barra de status e o `CookieManager.flush()` ao pausar
(`MainActivity`): a sessão é o cookie httpOnly do WebView, não um espelho nas
Preferences (saiu em 2026-10-06, com o refresh token legível pelo JS). Só HTTPS (`cleartext: false`); para desenvolver contra `http`
local, liberar só na cópia local.

---

## 7. Packages compartilhados

- `packages/types` — os tipos do domínio (`JwtClaims`, `AppointmentWithClient`,
  o catálogo de eventos…).
- `packages/validators` — só os schemas de autenticação; schema novo entra
  quando tiver quem o importe.
- `packages/utils` — `formatBRL`, `formatDate`, `maskCPF`.
- **`packages/nucleo`** (2026-10-06) — o código que a clínica, o sistema e o
  suporte DIVIDEM, na mesma árvore do `apps/web` (`src/lib/…`,
  `src/components/…`): `db`, os clientes do Supabase e o cookie da sessão,
  `origem`, `notify`/`push`, `redes/*` (situação, cache, leitura da
  assinatura), `suporte/*`, `plataforma/{contexto,destino,auditoria}` e os
  componentes comuns (`seg-select`, `realtime-refresher`, `busca-na-url`).
  - O `apps/web` mantém shims no caminho antigo (`lib/db.ts` =
    `export * from '@estetica-os/nucleo/lib/db'`): importar de `@/lib/db`
    continua certo. Arquivo NOVO compartilhado nasce direto no núcleo.
  - O núcleo não importa de app nenhum (`@/` ali dentro resolveria para o
    app que compila): `tests/nucleo-sem-app.test.ts` trava.
  - O que fala com o Asaas NÃO é núcleo (`lib/redes/cobranca.ts`): a clínica
    não carrega a cobrança.

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

### Server Action e consulta

O modelo (contexto → `assertPermission` → zod → `gravar`/`ler`, `branch_id`
do contexto e nunca do input) e os filtros obrigatórios por quem consulta
(unidade, rede, cliente final) estão em `docs/regras/convencoes.md` — leia
antes da primeira action ou consulta numa sessão.

---

## 9. Módulos do sistema

**As regras de cada módulo moram em `docs/regras/`, um arquivo por área.** O
CLAUDE.md passou de 160 mil caracteres e é carregado inteiro em toda sessão;
em 2026-10-06 ficou aqui só o que vale para o sistema inteiro. O texto das
regras não mudou, só de lugar, e os números de seção se mantiveram: quem no
código ou no DEVLOG cita "CLAUDE.md §9.7" acha a seção pela tabela.

> **OBRIGATÓRIO:** antes de mexer numa área, leia o arquivo dela INTEIRO —
> inclusive o "O que nunca fazer aqui" do fim. A mudança tocou duas áreas,
> leia as duas. O gatilho é o que você vai abrir: arquivo, tabela, função ou
> tela da coluna da direita.

| Arquivo (`docs/regras/`) | Seções | Ler antes de mexer em |
|---|---|---|
| `atendimento.md` | §9.1 Agenda, §9.3 Procedimentos, §9.4 Prontuário, §9.5 Estoque, §10 Conclusão do atendimento | `appointments`, `lib/appointments/`, `createAppointmentCore`, `procedures`, `medical_records*`, `forms`, `stock_*`, `product_batches`, `lib/estoque/`, `finishSession`, `concluir_atendimento`, agenda, sessão de atendimento |
| `crm-inbox.md` | §9.2 Clientes / CRM (com LGPD), §9.2.1 Contato, conversa, oportunidade e cliente | `clients`, `contacts`, `conversations`, `leads`, `lead_events`, `lib/inbox/`, `lib/crm/`, `lib/contatos/`, `inbox_pagina`, `actions/inbox.ts`, `actions/lgpd.ts`, inbox, quadro de oportunidades, ficha do cliente |
| `fidelidade.md` | §9.2.2 Fidelidade | `loyalty_*`, `lib/fidelidade/`, `confirmar_pagamento_do_atendimento`, pontos, vouchers, recompensas |
| `vendas-financeiro.md` | §9.3.1 Pacotes, §9.3.2 Pré-pago, §9.6 Financeiro | `service_packages*`, `client_packages`, `package_sessions`, `procedure_sales*`, `financial_transactions`, `internal_credits`, `estornar_transacao`, `lib/checkout/`, `lib/vendas/`, `lib/pacotes/`, `lib/creditos/`, `actions/pre-pago.ts`, `actions/financial.ts`, checkout do plano, "Vender", desconto, parcelas |
| `comissoes.md` | §9.7 Comissões | `commission_*`, `commissions`, `payment_fees`, `lib/comissoes/`, `comissao_*`, Financeiro → Comissões |
| `documentos.md` | §9.4.1 Termos e contratos | `issued_documents`, `document_*`, `consent_terms`, `lib/documentos/`, `components/admin/editor-rico/`, `/verificar`, `/assinar`, PDF assinado |
| `whatsapp-push.md` | §9.8 Push, §9.8.0 Números de WhatsApp, §9.8.1 Coexistência × Cloud API | `whatsapp_numbers*`, `integration_configs`, `lib/whatsapp/`, `lib/channels/`, `lib/templates/`, `lib/notifications/`, `lib/integracoes/`, `actions/uazapi-connection.ts`, `/api/webhooks/whatsapp` e `/meta`, templates, push |
| `automacoes.md` | §9.9 Eventos de domínio e automações | `domain_events`, `automation_*`, `lib/events/`, `lib/automacoes/`, `packages/types/src/eventos.ts`, campanhas |
| `plataforma.md` | §6 Plataforma e suporte (os apps sistema e suporte, Asaas, "entrar como", chamados) | `apps/sistema`, `apps/suporte`, `lib/plataforma/`, `lib/suporte/`, `lib/redes/`, `lib/asaas/`, `/auth/suporte-*`, `/api/interno/`, `support_*`, `platform_*`, `tenant_subscriptions`, `subscription_invoices`, `buildContext`, `jwt_claim`, `/conta-suspensa`, Ajuda da topbar |
| `busca.md` | §6 Busca universal | `busca_universal`, `lib/busca/`, `actions/busca.ts`, `busca-universal.tsx` |
| `design.md` | §13 Design System ("Rosé Vivo") | qualquer componente visual, `globals.css`, seletor, modal, popover, menu |
| `indicadores.md` | §13.1 Indicadores | `lib/metrics/`, `metrics_*`, `lib/datetime.ts`, `resolvePeriod`, dashboard, relatórios, qualquer número na tela |
| `infra.md` | §12 Variáveis de ambiente, §14.1 Cron | env, `scripts/cron.mjs`, `app/api/cron/`, Railway, Dockerfile |
| `e2e.md` | §15 A completa em duas metades e o apoio do E2E | `apps/web/e2e/`, `playwright*.config.ts`, `.github/workflows/e2e.yml` |
| `convencoes.md` | §4/§8 os modelos de action e de consulta | a primeira action ou consulta nova da sessão |

Regra nova de módulo vai para o arquivo da área; regra que vale para o
sistema inteiro fica aqui. Área nova ganha arquivo e linha nesta tabela.

---

## 10. Fluxo de conclusão de atendimento

Em `docs/regras/atendimento.md`. É UMA transação (`concluir_atendimento`):
nenhuma parte da conclusão se grava fora dela.

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

Os 17 módulos: `agenda`, `clients`, `loyalty`, `medical_records`, `documents`,
`procedures`, `stock`, `financial`, `cashier`, `crm`, `marketing`, `reports`, `team`,
`forms`, `roles`, `settings`, `automations`. Nem todo módulo distingue os três níveis — `MODULE_LEVELS`
(`lib/permissions.ts`) declara o que cada um aceita, e a tela de cargos só
oferece esses. O escopo aparece apenas em `SCOPED_MODULES`: `agenda`,
`medical_records`, `financial`, `crm` e `reports` (em `reports` o escopo é "só
a minha unidade" × "a rede inteira", não "os meus registros").

**Relatórios tem um eixo a mais**: `reports: VIEW` abre a tela, e
`role_report_tabs` diz QUAIS abas o cargo enxerga — o time comercial vê o funil
sem ver o faturamento. Sem nenhuma aba marcada, o módulo vale NONE
(`buildContext`): a entrada some do menu em vez de abrir uma tela vazia. Ler com
`podeVerRelatorio(ctx, aba)` — é o que a seção de relatórios usa.

```typescript
// A trava lança semAcesso() (lib/sem-acesso.ts), nunca new Error('Forbidden'):
// em produção o Next troca a mensagem de todo erro do servidor, e só o digest
// fixo dela deixa a tela dizer "sem acesso" em vez de "algo deu errado".
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
- **O OWN do CRM, no inbox, tem um refino por rede** — pela pessoa ou pela
  conversa (§9.2.1). Fica na aba Cargos, logo abaixo da matriz.
- **Quais números de WhatsApp o cargo vê no inbox é do CARGO**
  (`tenant_roles.inbox_caixas`, na linha do CRM da matriz): `todas` (padrão)
  ou `minhas` — só as caixas a que a pessoa está ligada em
  `whatsapp_number_users`. Sem número ligado, nenhum WhatsApp; conversa sem
  caixa (Instagram, Messenger) passa sempre. Soma-se ao escopo do CRM. Ligar a
  pessoa ao número decide por onde ela ENVIA; isto decide o que ela VÊ. A regra
  mora em `caixasDoAlcance` (`lib/inbox/alcance.ts`), usada pela lista, pelas
  outras threads e pela abertura por id, como `alcanceDoDono`.
- **Membro desativado não opera.** `buildContext` confere `users.is_active`
  (via `getCachedMember`) e manda para `/login?acesso=desativado`; desativar
  também bloqueia a conta no Auth (`ban_duration`) e expira o cache do membro
  com `updateTag` — o `revalidateTag(…, 'max')` serviria o valor velho em mais
  uma requisição. Até 2026-09-27 desativar era uma coluna que nada lia. Ninguém
  desativa a si mesmo. Prova: `e2e/membro-desativado.spec.ts`.
- **A abrangência se confere na ACTION, não só no layout.** Registro de
  unidade que chega por id (agendamento, lançamento, plano, mapa, membro,
  unidade) passa por `alcancaUnidade` / `assertUnidade` (`lib/auth.ts`)
  depois de conferida a rede: quem é da rede alcança todas, quem tem unidade
  fixa só a dela, e registro sem unidade é da rede. Leitura que recebe
  `branchId` usa `ctx.branchId ?? branchId` — o pedido não vence a
  abrangência. Até 2026-09-28 a recepção da A cancelava, recebia e estornava
  na B pelo id. Prova: `e2e/abrangencia-unidade.spec.ts`.
- **Todo caminho que cria ou move agendamento passa por
  `conferirPecasDoAgendamento`** (`lib/appointments/core.ts`): unidade,
  profissional, cliente e sala da rede, e a unidade ao alcance. O checkout,
  a sessão de pacote e a de plano gravavam o que o navegador mandasse.
- **A unidade do membro é da rede** (`assertBranchInTenant` em
  `actions/team.ts`), e **o agendamento só nasce com peças da rede**:
  `createAppointmentCore` confere unidade, profissional, cliente e sala, e quem
  tem unidade fixa só agenda nela. É o núcleo da agenda E do comercial — a
  conferência mora nele, não em cada chamador.
- Teste de regra de alcance precisa de um membro com escopo OWN de verdade:
  `membroComEscopoProprio` (`e2e/apoio/sessao.ts`). Como admin a tela abre de
  qualquer jeito, e o teste não prova nada.
- **A trava da action é a única**: a RLS recorta por rede, não por módulo — sem
  o `assertPermission`, um membro sem o módulo grava pela action (provado em
  2026-09-27). `e2e/permissoes-acoes.spec.ts` chama uma action por módulo
  direto pelo id (`e2e/apoio/acao-direta.ts`) como membro sem nada e como
  membro que só vê, e confere o banco; cada caso tem o admin como controle.

---

## 12. Variáveis de ambiente

Em `docs/regras/infra.md`.

---

## 13. Design System — BellarisOS ("Rosé Vivo")

> **OBRIGATÓRIO:** Antes de construir qualquer componente visual, invoque a skill `/lumiere-design`
> e leia `docs/regras/design.md` (os princípios do projeto: hierarquia por
> preenchimento, tokens, seletores, modais, celular).

---

## 13.1 Indicadores — fonte única

> **OBRIGATÓRIO:** todo número exibido (KPI, gráfico, ranking, taxa, média) vem
> de `apps/web/lib/metrics/`. Nenhuma tela soma, conta ou divide por conta própria.

As definições canônicas, o fuso, o período e a regra única de receita estão
em `docs/regras/indicadores.md`.

---

## 14. O que nunca fazer

Aqui ficam as que valem para o sistema inteiro. As de um módulo estão no fim
do arquivo dele em `docs/regras/` ("O que nunca fazer aqui").

```
❌ Query sem filtro de tenant_id, branch_id ou client_id
❌ Expor SUPABASE_SERVICE_ROLE_KEY no client-side ou no mobile
❌ Usar branchId ou tenantId hardcoded — sempre vir do contexto de autenticação
❌ Deixar cliente (role CLIENT) acessar prontuário, financeiro ou dados de outros clientes
❌ Deletar registros financeiros ou de prontuário — usar soft delete ou flags
❌ Criar lógica de negócio duplicada no web e no mobile — extrair para packages/
❌ Construir componente visual sem invocar /lumiere-design primeiro
❌ Usar o slug do registro para decidir portal (é lib/rotas quem decide)
❌ page.tsx sem assertPermission próprio, confiando no layout
❌ Rota de /api/* sem defesa própria (segredo, assinatura ou sessão + permissão) — o proxy não barra
❌ Somar/contar indicador na tela em vez de usar lib/metrics (trunca em 1000 linhas)
❌ Somar dinheiro por uma regra própria em vez de partir de metrics_receitas_pagas
❌ Migration que cria função sem notify pgrst, 'reload schema' no fim
❌ Montar janela de período com new Date(y, m, d) ou startOfMonth() do date-fns
❌ Comparar período parcial com período anterior inteiro
❌ Descartar o error de uma query (vira R$ 0,00 silencioso) — use gravar/ler/tentar
❌ Declarar variável plpgsql com nome de coluna (42702 dentro do gatilho, insert descartado)
❌ Pegar trabalho de uma fila sem reivindicar a linha (duas passagens executam duas vezes)
❌ Montar redirect ou redirect_uri com req.url / req.nextUrl.origin (é 0.0.0.0 no standalone) — use origemPublica
❌ Lançar new Error('Forbidden') à mão — use semAcesso() (em produção só o digest chega à tela)
❌ Contar com a MENSAGEM de um erro lançado no servidor na tela — em produção ela chega trocada; devolva { error } ou use erroParaTela
❌ Subir o Next sem rodar a suíte contra o build (16.3.5+ quebra o refresh; abaixo de 16.3.0 trava a action)
❌ Update pela sessão sem conferir a linha devolvida (sem policy de UPDATE, atinge zero linhas sem erro)
❌ Action que recebe id de conversa/mensagem sem conversaAoAlcance (esconder da lista não tranca o id)
❌ Action que recebe id de oportunidade sem leadAoAlcance (vale também fora do CRM: agenda, clientes)
❌ Policy RLS que confere só o cargo (role <> 'CLIENT') sem conferir a REDE
❌ Criar política de RLS em tabela de credencial (integration_configs, whatsapp_numbers) — só o servidor lê
❌ Função security definer em public que recebe tenant por parâmetro e fica aberta a anon/authenticated
❌ Receber um id em export 'use server' sem confirmar que ele é da rede da sessão
❌ Limpar um estado da rede ANTES de conferir o id que vai recebê-lo (setDefaultFunnel zerava o padrão)
❌ Action que recebe id de registro de UNIDADE e confere só a rede (use alcancaUnidade depois da rede)
❌ Criar agendamento fora de createAppointmentCore sem conferirPecasDoAgendamento
❌ Deixar o branchId do chamador vencer o do contexto numa leitura (ctx.branchId ?? branchId)
❌ Invalidar cache de permissão/acesso com revalidateTag 'max' (serve o velho mais uma vez) — use updateTag
❌ Fechar LISTA de período em "agora" (resolvePeriod.to) — use fullTo, o fim do período
❌ Tirar inicial de nome com nome[0] ou charAt(0) — use iniciaisDoNome (quebra em emoji)
❌ map() que devolve <> sem chave (a key no filho de dentro não conta)
❌ Chamar action que grava e ignorar o { error } que ela devolve
❌ Escrever no banco fora de transação quando duas gravações precisam valer juntas (padrão: o app calcula, uma função grava)
❌ Introduzir cores, fontes ou sombras fora dos tokens da skill /lumiere-design
❌ Escrever cor/sombra/raio/tamanho de fonte à mão em vez de var(--token)
❌ Escolher o tamanho de um seletor na tela (a altura é --altura-controle, e só)
❌ Pôr aparência de seletor no style inline — ele vence a classe e desfaz o padrão
❌ Abrir folha/overlay no celular em inset: 0 (fica atrás da topbar, sem fechar)
❌ Deixar barra de rolagem à mostra em área de conteúdo (só o modal a tem)
❌ Usar a paleta do Tailwind (red-600, green-600…) — o sistema tem a sua
❌ Encerrar uma entrega sem atualizar o DEVLOG e a memória (§16)
❌ Implementar feature sem o teste escrito antes e visto falhando (§15, TDD)
❌ Gravar cookie de sessão sem opcoesDoCookieDeSessao, ou ler/guardar a sessão no JS (o refresh token iria junto)
❌ Usar o primeiro do x-forwarded-for como IP de limite (o cliente o forja) — é o X-Real-IP
❌ Route handler que AGE pela sessão (POST) sem conferir o Origin — os hosts *.bellarisos.com são o mesmo SITE, e o cookie lax vai junto
❌ Validar o destino `next` de um link com startsWith('/') — é caminhoInterno (lib/origem; `/\x.com` e tab viram `//x.com`)
❌ Mandar à tela dado clínico (evolução, anexo clínico, anotação do plano, anamnese) sem podeVerClinico
❌ Mandar config de integração ao navegador sem mascararSegredos (ou criar chave de credencial fora da lista)
❌ Action que manda algo ao PACIENTE (mensagem, campanha, link, pedido de assinatura) sem bloqueioDoSuporte
❌ Tabela clínica nova sem a política RESTRICTIVE suporte_sem_clinico
❌ Ler o nome de quem agiu fora do ctx (users.name pelo auth id) — perde a marca "via suporte"
❌ jwt_claim que consulta tabela a cada chamada (é por linha, em toda política) ou que vira security definer
❌ Política que confere auth.uid() em tabela que a sessão de suporte alcança, sem a restritiva do suporte
❌ Exportar de um arquivo 'use server' função que recebe a rede por parâmetro sem conferir quem chama (era o dispatchCampaignInline; trava: tests/actions-sem-rede-por-parametro.test.ts)
```

---

## 14.1 Jobs agendados (cron)

Em `docs/regras/infra.md`.

---

## 15. Comandos úteis

```bash
# Dev
pnpm dev                            # inicia todos os apps
pnpm dev --filter=web               # só o web

# Supabase
supabase start                      # inicia Supabase local
supabase db push                    # aplica migrations SQL
supabase gen types typescript       # gera tipos do schema

# App Android (apps/native)
npx cap sync android                # copia a config e os plugins para o projeto Android
npx cap open android                # abre no Android Studio para gerar o build

# Qualidade
pnpm lint                           # ESLint em todos os packages
pnpm typecheck                      # tsc --noEmit em todos os packages
pnpm test                           # Vitest
pnpm --filter web test:e2e          # Playwright (sobe o dev sozinho)
pnpm --filter web test:e2e:afetados # só os testes da área alterada (--listar, --desde <ref>)
pnpm --filter web test:e2e:completa # a suíte inteira contra o build dos TRÊS apps, em duas metades
```

**TDD** (decisão do Heitor, 2026-10-06): o teste nasce ANTES da feature, roda e
FALHA pelo motivo certo (o comportamento que falta, não um erro do teste) — a
falha vai na mensagem do commit —, e só então se implementa até passar. Mudança
que só move código, sem comportamento novo, se apoia nos testes que já existem.

**Qual E2E rodar** (decisão do Heitor, 2026-09-28 — a suíte inteira passa de
15 minutos, e esperar por ela a cada etapa tornava o desenvolvimento inviável):
- **Em cada etapa: só o que é NOVO** — o teste novo e, quando mexer em algo que
  já existia, os vizinhos diretos. `test:e2e:afetados --listar` ajuda a
  achá-los: escolhe os specs pela área dos arquivos alterados (`AREAS` em
  `scripts/e2e-afetados.mjs`); spec novo precisa cair numa área.
- Mexeu em arquivo **compartilhado** (auth, db, supabase, layouts, proxy,
  permissões, rotas, dependências)? Roda os vizinhos mais óbvios e AVISA o
  Heitor que vale uma completa — não roda por conta própria.
- **A completa roda SÓ QUANDO O HEITOR PEDE**: no GitHub Actions, à mão
  (`.github/workflows/e2e.yml`, `gh workflow run e2e.yml`), contra o build — ou
  local, `test:e2e:completa`. Não dispara a cada push, e ninguém espera por ela
  para seguir. Os secrets (só as três chaves do
  Supabase) moram no environment `e2e`, restrito à main; o workflow NUNCA
  roda em `pull_request`. CRON, Meta e VAPID são gerados a cada execução.
- **A completa em duas metades** (isolados × compartilhados) e o **apoio do
  E2E** (`apps/web/e2e/apoio/`: sessões, limpeza, outra rede, provedores
  falsos, ação direta) estão em `docs/regras/e2e.md`. Leia antes de escrever
  ou mexer num spec.

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
máquina**. Regra de negócio nova é CLAUDE.md — a de um módulo, no arquivo
dele em `docs/regras/` (§9); aqui só a que vale para o sistema inteiro, e com
parcimônia: este arquivo é carregado em toda sessão. Entrega é DEVLOG. "O dev
server morre por memória nesta máquina" é memória.

---

*BellarisOS — CLAUDE.md v1.9 | 6 de outubro de 2026*
