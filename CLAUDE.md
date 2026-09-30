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
| Pagamentos | Pagar.me (assinaturas da rede) |
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
│   └── native/                       Capacitor — casca Android do portal web
│       ├── capacitor.config.ts       URL de produção, só HTTPS
│       └── android/
│
├── packages/
│   ├── types/                        interfaces TypeScript compartilhadas
│   │   └── index.ts                  AppointmentWithClient, JwtClaims, etc.
│   ├── validators/                   schemas Zod
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

### App (Android)

O app é o portal web num Capacitor: as rotas são as mesmas, e o login decide o
portal pelo contexto (rede, unidade ou cliente final). O que é nativo é pouco —
sessão guardada no aparelho (`lib/supabase/native-store`), push (FCM) e barra
de status. Só HTTPS (`cleartext: false`); para desenvolver contra `http`
local, liberar só na cópia local.

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
Hoje só os de autenticação (`RegisterSchema`, `LoginSchema`,
`ResetPasswordSchema`, `UpdatePasswordSchema`). Os de agendamento,
procedimento, cliente e login do cliente nunca foram usados e saíram em
2026-09-28 — schema novo entra aqui quando tiver quem o importe.

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
import { z } from 'zod'

const EntradaDoAgendamento = z.object({ clientId: z.string().uuid(), /* … */ })

export async function createAppointment(input: unknown) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  const data = EntradaDoAgendamento.parse(input)

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
- Campo `source`: `INTERNAL` (equipe pelo web/app), `CLIENT_APP` (cliente pelo portal, só procedimentos `visible_on_client_app`), `COMMERCIAL` (o time comercial agendando pelo CRM, `createCrmAppointment`). `ONLINE` é legado do agendamento público, que foi descartado — não usar em código novo.
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
- Ao marcar `COMPLETED`: consumo de estoque + comissão, numa transação — ver §10. Os pontos de fidelidade NÃO nascem aqui: nascem no pagamento (§9.2.2).

### 9.2 Clientes / CRM
- CPF (`document`) único por `tenantId` — constraint `@@unique([tenantId, document])`
- `authId` em `Client` é opcional — preenchido apenas quando o cliente cria conta no app
- A conta de pontos (`loyalty_accounts`) nasce com o cliente, por `fidelidade_conta` — e sob demanda, se faltar. A fidelidade tem seção própria: §9.2.2.
- Tags como `String[]` — constantes em `packages/utils/client-tags.ts`
- `InternalCredit`: saldo de crédito do cliente (concessão manual, cancelamento de plano pago, estorno de um pagamento feito com crédito); usado como método de pagamento `INTERNAL_CREDIT`, que o desconta (§9.6)
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

### 9.2.1 Contato, conversa, oportunidade e cliente — quem é quem

São quatro entidades e é fácil confundi-las. A regra é:

| | O que é | Cardinalidade |
|---|---|---|
| **`contacts`** | a **PESSOA** | uma por rede |
| **`conversations`** | a **THREAD** — um canal, uma caixa | várias por pessoa |
| **`leads`** | a **OPORTUNIDADE** no funil | várias por pessoa |
| **`clients`** | a **FICHA** na clínica (CPF, prontuário, financeiro) | no máximo uma por pessoa |

**A conversa NÃO é a pessoa.** Ela era, e isso funcionava enquanto cada pessoa
tinha uma conversa só. Deixou de funcionar com vários números: o dedup inclui a
caixa — de propósito, porque no celular do cliente são duas conversas mesmo —,
então a mesma pessoa falando com duas caixas virava duas fichas de contato, com
dois nomes, duas listas de tags e duas atribuições de anúncio. E
`leads.conversation_id` é singular, então o card ficava preso numa delas
enquanto o atendimento acontecia na outra.

O buraco aparecia exatamente no **handoff** — lead entra pelo número de
marketing, a SDR qualifica e agenda, a unidade assume por outro número —, que é
o momento em que ler o histórico é o que mais importa. E já acontecia antes dos
múltiplos números, entre Instagram e WhatsApp: ali a mesma pessoa sempre foram
duas conversas.

- **Contato não vira `clients` automaticamente.** Quem pergunta "abrem sábado?"
  não pode entrar na base clínica e financeira — e `LoyaltyAccount` nasce junto
  no cadastro (§9.2).
- **A identidade é `contacts.identifiers`** — telefone, @lid, BSUID, PSID,
  IGSID, todos na mesma lista. A invariante é: `contact_aliases` de cada conversa
  é **subconjunto** de `identifiers` do contato dela. Se um alias novo ficar só
  na conversa, a próxima mensagem que chegar por ele não acha a pessoa e nasce um
  segundo contato — em silêncio.
- ⚠️ **A ligação é feita por GATILHO no banco**
  (`trg_conversa_ganha_contato`, `trg_contato_aprende`), não no TypeScript. Há
  três pontos que criam conversa e vão existir mais; instrumentar um a um é
  garantir esquecer o próximo — mesmo argumento de `pagamento.*` e `estoque.*`
  (§9.9). Quem lê o código não vê isso acontecer, e
  `lib/inbox/resolve-conversation.ts` diz onde olhar. De brinde, o contato criado
  pelo gatilho é desfeito junto quando o insert da conversa colide no `23505`.
- **A busca do contato não tem recorte de canal nem de caixa** — é justamente o
  cruzamento que interessa. Com filtro, cada caixa criaria o seu contato e o
  problema voltaria com outro nome.
- **Contato órfão (sem thread) não é defeito.** Em produção conversa não se
  apaga. O que é defeito é a mesma pessoa cadastrada duas vezes, ou seja, dois
  contatos com identificador em comum — nenhum índice proíbe sobreposição de
  array, então a trava é `e2e/contato-espinha.spec.ts`.

**As TAGS são da pessoa** (`contacts.tags`), e sempre eram — o comentário em
`conversations.tags` já dizia "Tags do CONTATO: descrevem a pessoa, não o
negócio". `conversations.tags` sobrevive como **semente**: escrita uma vez no
nascimento da thread (é de onde vêm as tags derivadas da origem), lida pelo
gatilho que a leva para a pessoa, e **nunca lida pelo app**. **Fica** — decisão
do Heitor em 2026-09-28: tirá-la obrigaria cada ponto que cria conversa a
escrever na pessoa, que é o que o gatilho existe para evitar (comentário na
coluna, migration `20260928000008`).

⚠️ **Variável de plpgsql não pode se chamar como uma coluna.** `declare tags
text[]` num gatilho de `contacts` fez a referência ficar ambígua (`42702`)
dentro do `update`, o INSERT da conversa falhar e a mensagem do cliente ser
DESCARTADA — e só no caso de quem já tem contato, que é o que esta frente existe
para suportar. As colunas no `update` do gatilho são qualificadas (`c.tags`) para
isso não voltar em silêncio.

**A atribuição do anúncio NÃO mudou de casa, e é deliberado.**
`conversations.attribution` aponta para o último anúncio *daquele* retorno
(`marcarAnuncioNaConversa` a reescreve quando a pessoa volta por outro) — é
informação da THREAD. O que seria do contato é a PRIMEIRA origem, e isso é um
dado novo, não uma mudança de casa: não entra antes de alguém precisar dele.
- ⚠️ Mas quem procura "o anúncio deste cliente" tem de procurar a conversa mais
  recente **que tenha anúncio**, não simplesmente a mais recente: com várias
  threads, a última a receber mensagem costuma ser a do atendimento, não a que
  veio da campanha. `on_transaction_paid` fazia isso errado e mandava a compra
  para a API de Conversões da Meta com `ad_id` nulo — ROI menor do que é, sem
  nada acusando.

**A fila do inbox vem de 30 em 30, filtrada no BANCO** (`inbox_pagina`,
migration `20260928000007`), e o fim da lista busca a próxima pelo cursor
`(last_message_at, id)`. Eram as 200 mais recentes filtradas no navegador: a
201ª não aparecia nunca, nem procurando. Consequências:
- **Filtro e busca vão ao servidor.** `passaNosFiltros` continua no navegador
  só como guarda do que chega pelo realtime — as duas definições têm de
  continuar iguais (a da função cita a do componente).
- **As opções dos menus vêm da rede** (`inbox_opcoes`), não das conversas
  carregadas: o dono que só aparece na página 5 sumiria do menu.
- **O realtime recarrega o tanto que já está na tela**, com os filtros de
  agora — recarregar "do zero" encolheria a lista de quem rolou.
- O alcance entra na mesma consulta: no modo "pela conversa" os leads do dono
  vêm de `leads_do_dono` (um array só; o select parava em 1000).
- Prova: `e2e/inbox-paginado.spec.ts`, numa rede `[e2e]` própria.

**A fila do inbox é de CONVERSAS** — a mesma pessoa em duas caixas são duas
linhas, cada uma com o nome da caixa quando a rede tem mais de uma. Foi por
pessoa por um dia (2026-09-25/26) e voltou por decisão do Heitor, vendo um caso
real: a linha única escondia em qual conversa o clique cairia, e alternar entre
as threads ficou confuso. **A pessoa une as conversas no PAINEL, não na fila.**

**O cruzamento é o que conserta o handoff.** `getConversationCard` devolve
`outrasThreads` — as outras conversas da mesma pessoa —, e o painel do inbox as
mostra na seção do CONTATO (não na das oportunidades: é sobre a pessoa). Clicar
abre aquela thread. **Respeita o alcance do CRM pela mesma regra da lista**
(`alcanceDoDono`, ver abaixo): abrir exceção ali seria furar, por uma tela, a
regra que vale na tela ao lado.

**A oportunidade é da PESSOA** (`leads.contato_id`, NOT NULL). `leads.conversation_id`
continua existindo com outro sentido: a thread onde a oportunidade **nasceu**.
Ninguém pergunta mais "as oportunidades desta conversa" — lista do inbox, card
do contato, histórico, checagem de duplicata e propagação de nome leem por
`contato_id`, e o card do quadro mostra a atividade de todas as threads da
pessoa (`lib/crm/atividade-da-pessoa.ts`).
- ⚠️ **O dono é posto por GATILHO** (`trg_oportunidade_ganha_contato`): a
  pessoa da conversa de origem, senão a do telefone (só dígitos, o formato do
  webhook), senão uma nova. O cadastro manual (`createLead`) nunca gravou
  `conversation_id`, e o lead nascia sem pessoa — o motivo de não ser código.
- `on delete restrict`: pessoa com oportunidade não se apaga.
- **Oportunidade não se apaga** (decisão do Heitor, 2026-09-28): apagar levava
  o histórico junto (`lead_events` em cascata). A que não vai adiante é marcada
  perdida. Não há action, botão nem política de DELETE — e `lead_events` é
  append-only pela sessão (ler e acrescentar). Prova: `e2e/lead-nao-se-apaga.spec.ts`.
- **Com escopo OWN, o inbox segue a pessoa OU a conversa — escolha da clínica**
  (`tenants.inbox_visibilidade`, Configurações → Cargos, pede `roles: MANAGE`).
  Decisão do Heitor em 2026-09-26: "pessoa" é o padrão, mas configurável.
  - **Pela pessoa:** tem oportunidade sua → você vê todas as threads dela; só
    de outros donos → nenhuma; nenhuma oportunidade → todo mundo vê.
  - **Pela conversa:** cada thread pela oportunidade ligada a ELA
    (`conversations.lead_id`); thread sem oportunidade fica no bolo comum —
    inclusive a thread nova de quem é de outro dono.
  - A regra mora em UM lugar (`lib/inbox/alcance.ts`: `alcanceDoDono`), usado
    pela lista e pelos atalhos das outras threads. Quem esconde quem é conta
    do banco (`contatos_ocultos_do_dono`, só `service_role`), que devolve um
    array só — ler os leads com dono no app bateria no teto de 1000 linhas.
  - Erro ao ler o alcance mostra NADA, nunca tudo.
  - ⚠️ **Esconder da lista não basta: a abertura por id é trancada.** Toda
    action que recebe o id de uma conversa ou de uma mensagem passa por
    `conversaAoAlcance` / `mensagemAoAlcance` (dono + caixas do cargo) e, fora
    do alcance, responde como se a conversa não existisse. Até 2026-09-27
    `/admin/inbox?c=<id>` entregava as mensagens de qualquer conversa da rede.
    Action nova de conversa sem esse portão é o furo de volta.
  - O mesmo vale para a **oportunidade**: `leadAoAlcance` (`lib/crm/alcance.ts`)
    aplica a regra do funil (sua ou sem dono) a toda action que recebe o id de
    uma — inclusive fora do inbox (`createCrmAppointment`, `addClient` com
    `_leadId`). Os dois portões exigem `crm: VIEW`: `clients: MANAGE` não é
    passe para mexer em card nem em conversa.

**Nome e telefone são da pessoa, e as cópias acompanham** (2026-09-28). A conversa
e a oportunidade guardam cópia, e a edição em qualquer
um dos dois lugares — painel do inbox (`atualizarContato`) ou card da
oportunidade (`updateLead`) — passa por `propagarDadosDaPessoa`
(`lib/contatos/propagar.ts`):
- **nome** → a pessoa, TODAS as conversas e TODAS as oportunidades;
- **telefone** → a pessoa (que passa a ser achada pelo número novo) e as
  conversas com o MESMO número antigo ou sem número. Conversa com outro número
  é outro WhatsApp da pessoa, e ali o telefone é o DESTINO da mensagem: não
  muda. Nas oportunidades vai para todas;
- cada oportunidade que mudou registra o de → para na linha do tempo.
Prova: `e2e/contato-propaga.spec.ts`. Editar cópia sem passar por aí é o
defeito de volta.

**A tela lê o NOME da pessoa, não a cópia** — lista, busca (`inbox_pagina`),
card do contato, "virar cliente", template, agendamento pelo CRM e o evento da
conversa (embed `pessoa:contacts!conversations_contato_id_fkey(name)`; a cópia
só na falta). O **telefone da conversa não é cópia**: é o destino daquela thread,
e é dele que o envio, a lista e o card leem. Prova:
`e2e/inbox-nome-da-pessoa.spec.ts` (a pessoa renomeada com a cópia velha).

Em teste, limpar conversa é `apagarConversas()` de `e2e/apoio/banco.ts`, que tira
o contato junto.

### 9.2.2 Fidelidade (configurável pela rede)

**O programa é da REDE, nasce DESLIGADO e cada rede configura** (decisão do
Heitor, 2026-09-28). A config mora em `loyalty_configs` (uma linha por rede) e é
editada em Configurações → Fidelidade — pede `settings: MANAGE` e abrangência de
rede. Desligado, **nenhum sinal de pontos aparece**: nem na ficha, nem no portal.

- **O ponto nasce no PAGAMENTO**, não na conclusão: gatilho
  `trg_fidelidade_ganho` em `financial_transactions` (receita paga, com cliente,
  que não é estorno nem crédito interno). Pelo mesmo argumento do §9.9: receita
  paga nasce em vários lugares do código. Emite `fidelidade.pontos_ganhos`.
- **Modo de ganho — a rede escolhe UM:** por real pago (`floor(valor ×
  points_per_real)`) ou por procedimento (`procedures.loyalty_points`, editado
  no cadastro do procedimento, só nesse modo). Plano é **cumulativo** pelo que
  já foi pago: entrada + restante somam exatamente os pontos do plano.
  A regra mora numa função só: `fidelidade_pontos_do_pagamento` — e multiplica
  antes de dividir (120 × (100 ÷ 300) perdia um ponto).
- **Estorno** (`estornar_transacao`) tira exatamente o que aquele pagamento deu
  (lê o GANHO). Saldo pode ficar **negativo**, como estoque.
- **Ajuste manual** pela equipe (`loyalty: MANAGE`), com motivo, por
  `ajustar_pontos` — débito acima do saldo é recusado.
- **Saldo = SOMA do extrato** (`saldo_de_pontos`). `loyalty_accounts.balance`
  saiu do banco (fase 4). Extrato e conta só se LEEM pela sessão: quem
  escreve é o gatilho e o servidor, com a trava `fidelidade:<cliente>`.
- Módulo `loyalty`: VIEW = saldo e extrato; MANAGE = ajustar. Configurar é
  Configurações.
- **Pontos como desconto no pagamento** (fase 2): na recepção, o cliente abate
  pontos do atendimento. Regras da rede: valor do ponto, mínimo e teto (% do
  valor). `financial_transactions.amount` continua sendo o DINHEIRO RECEBIDO; o
  desconto vai em `loyalty_discount` (bruto = amount + loyalty_discount) — por
  isso receita, LTV e estorno seguem certos sem mudar nada.
- **O pagamento do atendimento é UMA transação**:
  `confirmar_pagamento_do_atendimento` (o app calcula em
  `lib/fidelidade/resgate.ts`, em CENTAVOS inteiros, e o banco confere o mesmo
  número: config, teto, saldo sob a trava do cliente). Grava pagamento, RESGATE,
  e linha do tempo; a comissão, o gatilho do pagamento acerta (§9.7). O
  servidor recalcula o desconto a partir dos pontos pedidos — o valor do
  navegador não entra.
- **Comissão com pontos/voucher**: sobre o preço ou sobre o valor pago — é
  `commission_configs.base_com_pontos` (Configurações → Comissões, §9.7), não
  mais `loyalty_configs.commission_base` (a coluna ficou sem leitor).
- Pago todo com pontos: `amount` 0, sem forma de pagamento, sem "Purchase" na
  API de Conversões (o `pagamento.recebido` sai, com 0).
- Estorno devolve os pontos usados (ESTORNO_RESGATE) e tira os ganhos.
- **Catálogo de recompensas e vouchers** (fase 3): a rede cadastra recompensas
  (`loyalty_rewards`: procedimento grátis, desconto R$ ou %, produto) em
  Configurações → Fidelidade. A EQUIPE troca os pontos na ficha
  (`resgatar_recompensa`): os pontos saem na hora e nasce um voucher
  (`loyalty_vouchers`) com validade — o cliente só VÊ no portal, a não ser que
  a rede ligue a troca pelo portal (opcionais, abaixo). O voucher
  guarda um RETRATO da recompensa: editá-la depois não muda o já emitido.
  - Procedimento/desconto: aplicado no pagamento, ANTES dos pontos (os pontos
    e o teto valem sobre o que sobra); `loyalty_discount` soma os dois.
  - Produto: ENTREGUE na ficha (`entregar_voucher_produto`), com uma embalagem
    saindo do estoque da unidade (MANUAL_ADJUSTMENT, lote pelo gatilho).
  - Cancelar voucher não usado devolve os pontos; vencido (derivado de
    `expires_at`) não vale e não devolve; estorno do pagamento o reativa.
- A conta do saldo depois de uma saída de estoque é UMA: `lib/estoque/baixa.ts`
  (conclusão do atendimento e entrega de produto).
- **Validade** (fase 4): a rede escolhe "não vencem" ou N meses
  (`expiry_months`). Cada crédito recebe `expires_at` ao nascer, CONGELADO —
  mudar a regra vale para os pontos novos. O consumo é FIFO por vencimento, e a
  conta mora numa função só, em forma fechada (`fidelidade_a_expirar`): o que
  vence até D = créditos com vencimento ≤ D menos tudo que já saiu (expirações
  incluídas, por isso é idempotente). O estorno de um ganho leva o
  `expires_at` dele — sem isso o lote estornado venceria de novo.
  - A baixa é o cron `fidelidade` (`expirar_pontos`, lança
    EXPIRACAO "Pontos vencidos"). Ficha e portal mostram "vencem nos próximos
    30 dias" (`pontos_expirando`) e o "vence em" de cada linha.
- **Abrangência** (fase 4): rede inteira (padrão) ou só na unidade
  (`scope_per_branch`). Todo lançamento sempre levou `branch_id`; "só na
  unidade" é o saldo filtrado por ela — pagamento, troca de recompensa e
  débito só usam o saldo da unidade onde acontecem (`saldos_por_unidade`
  para a ficha). **A troca é recusada depois do primeiro lançamento da rede**
  (action e tela travada): mudaria em silêncio o saldo de quem já tem.
- **Opcionais da rede** (decisão do Heitor, 2026-09-29) — todos nascem
  DESLIGADOS e se ligam na aba Fidelidade:
  - **Bônus de aniversário** (`birthday_bonus`) e **de primeiro acesso**
    (`first_access_bonus`): lançamento BONUS, uma vez por `bonus_ref`
    (`ANIVERSARIO:<ano>`, `PRIMEIRO_ACESSO`) — é o índice único que impede dar
    duas vezes, não o app. Quem nasceu em 29/02 ganha em 28/02 fora de ano
    bissexto. O primeiro acesso é o primeiro login do cliente
    (`clients.app_account_created_at`, marcado por `fidelidade_primeiro_acesso`
    no `loginAction` e na sessão do app); quem já tinha entrado antes da
    opção existir não ganha.
  - **Troca pelo portal** (`client_redeem`): o cliente troca pontos por
    recompensa em `/[slug]/cliente/fidelidade` (`actions/fidelidade-portal.ts`),
    com o saldo da unidade daquele portal quando a abrangência é por unidade.
    Desligada, só a equipe troca, na ficha.
  - **Aviso de vencimento por push** (`expiry_notice_days`, só com validade):
    `avisos_de_vencimento` REIVINDICA o aviso antes de o push sair (a conta
    guarda até onde já avisou) — um aviso por lote novo na janela, nunca um
    por dia nem dois por passagem concorrente.
  - A rotina é o cron `fidelidade`: expirar → aniversário → avisos, nessa
    ordem (avisar antes de expirar contaria o que acabou de vencer).
  - ⚠️ As três funções da rotina aceitam `p_tenant` (nulo = todas, o cron).
    **Teste que as chama com data escolhida à mão passa a rede `[e2e]`** — sem
    o recorte, "e se hoje fosse 2027?" vence pontos e dá bônus de clientes
    reais na produção.

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

### 9.3.1 Pacotes (2026-09-30)

Um CONJUNTO de procedimentos, iguais ou não ("5 limpezas + 3 drenagens"),
vendido por um preço só (decisão do Heitor, 2026-09-30). Até 2026-09-30 só
existiam no banco de demonstração — nenhuma tela criava pacote nem o vendia.

- **Os itens** moram em `service_package_items` (procedimento + quantidade);
  `service_packages.total_sessions` é a soma e `procedure_id` o primeiro item
  (as leituras de "o procedimento do pacote" seguem certas). Pacote e itens se
  gravam juntos em `pacote_salvar`; o mesmo procedimento em duas linhas vira
  uma, somada.
- **Cada sessão vendida** (`package_sessions`) guarda o SEU procedimento e a SUA
  parte do preço (`preco`): o preço do pacote rateado pelo preço de TABELA de
  cada procedimento, em centavos, com a última sessão levando o arredondamento
  (`sessoesDoPacote`, `lib/pacotes/rateio.ts`). `pacote_vender` confere que as
  sessões batem com os itens e que a soma fecha com o preço. A parte da sessão
  é a base da comissão dela.
- **Agendar uma sessão** usa o procedimento, a parte do preço e a duração DELA
  (`schedulePackageSession` recusa outro procedimento — o navegador não
  escolhe).

- **Catálogo da rede** em Vendas → Pacotes (`/admin/pacotes` e
  `/[slug]/pacotes`, corpo em `app/_shared/pacotes.tsx`, `PacotesCatalogo`):
  os procedimentos e quantas sessões de cada, preço, validade em dias (vazio =
  sem validade), à venda ou não. Ver pede `procedures: VIEW`; editar, `procedures: MANAGE` e
  abrangência de rede (`salvarPacote`) — na unidade é consulta.
- **O menu tem Vendas e Marketing separados** (decisão do Heitor, 2026-09-30):
  Vendas = Inbox, Oportunidades, Procedimentos e Pacotes (o funil e o que se
  vende); Marketing = Notificações, Marketing e Templates. A tela de cargos
  agrupa os módulos igual (`MODULE_GROUPS`: `crm` e `procedures` em Vendas,
  `marketing` em Marketing).
- **Venda na ficha do cliente** ("Vender pacote", `VenderPacote`), para quem
  recebe (`podeReceber`), com o vocabulário do plano: à vista, entrada +
  parcelas, a receber (`CamposDoPagamento`, o mesmo do pagamento do contrato).
  - A venda sai pelo botão **"Vender"** (`components/shared/vender.tsx`),
    que pergunta Procedimento (pré-pago, §9.3.2) ou Pacote — os dois são
    separados no banco, só dividem a porta. Vender é o que o cliente compra
    e como paga; Agendar, quando ele vem.
  - O botão fica no cabeçalho da ficha, à esquerda do "+ Agendar".
  - Também no painel da direita do inbox, com as ações da pessoa
    (`getConversationCard` → `venda`), **com ou sem ficha**. A
    unidade é a de quem atende, senão a do cliente, senão a única da rede.
    Com cliente, fora do alcance ou sem pacote na unidade, o botão não
    aparece. Como as outras ações da pessoa, também some com o painel só de
    leitura (sem `crm: MANAGE`).
  - **Sem ficha, primeiro o cadastro** (decisão do Heitor, 2026-09-30): o
    botão abre o "Cadastrar como cliente" com o aviso, e ao salvar a venda
    abre sozinha para o cliente novo (`abrirSinal` do `Vender`). Rede
    com várias unidades só sabe a unidade da venda depois do cadastro. Por
    isso ali `branchId` vem nulo e as listas vazias: é só o sinal de que a
    rede tem o que vender. Se a unidade escolhida não tiver nada à venda, a
    tela diz isso em vez de abrir.
  - `lancamentosDoPagamento` (`lib/checkout/lancamentos.ts`) monta o dinheiro:
    o recebido agora e o a receber em lançamentos separados; a última parcela
    leva o arredondamento.
  - `pacote_vender` grava tudo numa transação: o pacote do cliente com o
    RETRATO do preço, das sessões e da validade (mudar o catálogo vale para as
    próximas vendas), todas as sessões (`AVAILABLE`) e o dinheiro com
    `financial_transactions.client_package_id`. Recusa se a soma não fechar
    com o preço.
  - O a receber se quita no financeiro, como qualquer conta a receber. O
    vencimento do "a receber" é OPCIONAL (aqui e no pagamento do contrato):
    sem data, o lançamento nasce sem `due_date` e o contrato diz "a receber"
    sem o dia.
- A sessão só LÊ pacote: as políticas de INSERT/UPDATE de `client_packages` e
  `service_packages` saíram (dava para dar sessão de graça pela chave pública).
- Comissão da sessão: §9.7.
- Prova: `e2e/pacotes-venda.spec.ts`.

### 9.3.2 Procedimento pré-pago (2026-09-30)

N unidades de UM procedimento, pagas antes (ou a receber) e agendadas depois.
**Separado do pacote de propósito** — o Heitor recusou reaproveitar
`client_packages`: pacote é um conjunto vendido por um preço só; o pré-pago é
o procedimento avulso pago antes.

- **A venda** é `procedure_sales` (retrato: preço unitário e total de tabela,
  desconto, vendido, validade OPCIONAL, quem vendeu) e as **unidades**,
  `procedure_sale_units` (uma linha por unidade, com a SUA parte do vendido —
  rateio igual em centavos, a base da comissão dela —, a situação
  `DISPONIVEL | USADA | CANCELADA` e o agendamento que a usa). O dinheiro leva
  `financial_transactions.procedure_sale_id`. Uma transação:
  `procedimento_vender` (`venderProcedimento`, `actions/pre-pago.ts`, para
  quem recebe). Desconto como toda venda (§9.6).
- A sessão só LÊ (equipe que alcança a unidade; o cliente, o que é dele).
- **No atendimento**: o agendamento liga a unidade (`appointment_id`, único);
  `concluir_atendimento` a marca USADA e liga a linha de comissão à venda
  (origem `PRE_PAGO`); a recepção RECUSA cobrar (`confirmar_pagamento…`),
  e a tela esconde o botão.
- **Agendar usando o que já foi pago** (unidade pré-paga OU sessão de pacote)
  é o **crédito** do agendamento, e passa pelo NÚCLEO:
  `createAppointmentCore(… credito: { tipo: 'PRE_PAGO' | 'PACOTE', id })`
  (`lib/creditos/credito.ts`). O crédito é conferido (do cliente, da rede,
  livre, na validade) e decide o procedimento e o preço — procedimento
  diferente é recusado; depois do insert ele é ligado por compare-and-swap
  (`appointment_id` nulo), e quem perde a corrida tem o agendamento desfeito.
  Com conflito de horário, histórico e evento, como todo agendamento.
  - Onde: o card "Procedimentos pagos" ("Agendar" na unidade,
    `agendarUnidadePrePaga`), o modal da agenda e o do inbox (campo "Já
    pago", `creditosParaAgendar`), e o "Agendar agora" depois de vender um
    procedimento (quem tem `agenda: MANAGE`).
  - `schedulePackageSession` (o modal de sessões do pacote) também passa
    pelo núcleo, com a sessão como crédito (2026-09-30). A tela já escondia
    o horário ocupado, mas só pelo INÍCIO (60 min às 10:00 passava por cima
    de outro às 10:30), e o servidor não conferia nada.
  - ⚠️ A conferência de conflito lê com `.limit(1)`, não `.maybeSingle()`:
    o horário pode encostar em DOIS agendamentos, e o `maybeSingle` dava
    "Não consegui buscar o agendamento" em vez de "já tem agendamento".
  - Prova: `e2e/agendar-com-credito.spec.ts`.
- **Comissão**: como o pacote — a base é a parte da unidade; no modo
  "quando paga", libera na proporção do que a venda recebeu (sobre o que ela
  vale hoje: vendido − unidades canceladas). O gatilho do pagamento acerta.
- **Falta ou cancelamento do agendamento DEVOLVE a unidade** (gatilho
  `trg_pre_pago_libera`): pode remarcar. Decisão do Heitor.
- **Cancelar a unidade** (`procedimento_cancelar_unidade`, com motivo, só a
  DISPONÍVEL e não agendada): a venda passa a valer menos; o a receber que
  sobrou diminui primeiro (e as parcelas em aberto, da última para a
  primeira); o que o cliente pagou além disso vira **DEVOLUÇÃO a pagar** no
  financeiro (despesa não paga, categoria "Devolução") — "registra para fazer
  estorno" (decisão do Heitor).
- **Fidelidade por procedimento**: os pontos das unidades ativas, na proporção
  do pago (como o plano). O pacote passou a ganhar do mesmo jeito (dava zero).
- Na ficha: card "Procedimentos pagos" (`ProcedimentosPagos`); no portal, em
  "Tratamentos em curso"; no export da LGPD, seção própria.
- Prova: `e2e/pre-pago.spec.ts`.

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
- `ConsentTerm.signedVia`: `"web"` ou `"paper"` — `consent_terms` é o LEGADO dos
  termos fixos do checkout; os termos e contratos novos são o §9.4.1
- Cliente NÃO acessa o prontuário pelo app — apenas histórico de procedimentos

### 9.4.1 Termos e contratos (2026-09-30)

A rede monta (no editor, com variáveis) ou envia (PDF pronto, assinado como
está) os modelos de termo e contrato, e o cliente assina eletronicamente —
na clínica, no portal, por link ou no papel. Plano aprovado em 2026-09-29, em
seis fases, **todas no ar**: modelos; emissão pelo atendimento com
assinatura na clínica e no papel; checkout do plano; PDF assinado e
verificação pública; portal do cliente; link público. O desenho inteiro está no
DEVLOG ("Termos e contratos").

- **O documento é do PROCEDIMENTO** (decisão do Heitor): cada procedimento
  liga até UM termo (`procedures.consent_template_id`) e UM contrato
  (`contract_template_id`). No plano, o cliente assina um termo por
  procedimento distinto e UM **contrato de plano** da rede
  (`kind = 'CONTRATO_PLANO'`, no máximo um ativo — índice único). Sempre de
  novo: cada atendimento avulso e cada plano pede documentos novos.
- **Três tipos, cada um com as suas variáveis** (`lib/documentos/variaveis.ts`,
  catálogo FECHADO): o termo também serve ao plano, então não usa
  `agendamento.*`; o contrato do procedimento é o do avulso; só o contrato de
  plano usa `plano.*` e `pagamento.*`. Variável fora do tipo é recusada ao
  salvar — sairia em branco num documento assinado.
- **O editor é rico (Tiptap), mas o que se assina é a árvore NOSSA**
  (`lib/documentos/arvore.ts`, v2 — decisão do Heitor, 2026-09-29, que
  substituiu a marcação leve): fonte, tamanho, negrito/itálico/sublinhado/
  tachado, cor, realce, alinhamento, entrelinhas, títulos, listas, tabelas,
  imagens, cabeçalho/rodapé, quebra de página. A tela
  (`DocumentoRenderizado`) e o PDF (`lib/documentos/pdf/diagramacao.ts`)
  desenham a MESMA árvore, com as mesmas medidas (em pontos) e fontes.
  - **A porta única é o conversor** (`editor/converter.ts`): o JSON do editor
    vira árvore só com nó/marca/atributo conhecidos; o resto é ERRO (o JSON vem
    do navegador). Colado do Word é normalizado (fonte do Office → a livre
    equivalente, tamanho → o mais próximo da lista, cor só `#rrggbb`). O JSON
    do editor NUNCA vai para a tela como HTML.
  - A variável é interpolada sobre a árvore (vira texto puro, com o estilo que
    tinha no modelo).
  - A marcação leve de antes ainda vale (versões antigas, o contrato de plano
    semeado, E2E por `p_texto`): `editor/da-marcacao.ts` a converte para o
    MESMO JSON, e ela passa pelo mesmo conversor. A v1 gravada (array) se lê
    por `lerConteudo`/`deV1`.
  - **Fontes**: 12 famílias livres em `public/fontes-documento/` (as do Office
    não se embutem: Arimo = Arial, Tinos = Times, Carlito = Calibri, Cousine =
    Courier, Gelasio = Georgia). A tela as usa por `@font-face` (`doc-<id>`), o
    PDF as embute com `@pdf-lib/fontkit`, `subset: false` (o subset troca
    glifos). ⚠️ O TTF que a API do Google Fonts serve para Arimo, Carlito e
    Cousine QUEBRA o fontkit — vêm do repositório google/fonts
    (`scripts/baixar-fontes.mjs`); o teste embute os 48 arquivos.
  - **Imagens** moram em `modelos-de-documento/<rede>/imagens/<sha256>.<ext>`
    (endereçadas pelo conteúdo). A árvore guarda caminho + sha256 — o hash do
    documento cobre a imagem —; a tela recebe URLs temporárias à parte
    (`urlsDasImagens`), e o PDF confere o sha256 antes de desenhar.
  - `.ttf`/`.woff` ficam fora do matcher do proxy: a página pública do link
    carrega as fontes SEM sessão.
  - **A tela de edição** (`components/admin/editor-rico/`, carregada por
    `next/dynamic`): corpo, cabeçalho e rodapé são três editores Tiptap, numa
    folha com as medidas do documento. Cada nó do editor tem par no conversor
    — nó novo sem par é recusado ao salvar. A imagem sobe por
    `enviarImagemDoModelo` (PNG/JPEG pelo cabeçalho do arquivo, até 2 MB).
  - ⚠️ **O JSON do editor vai à action como cópia JSON pura**: o ProseMirror
    cria os `attrs` sem protótipo, e o React os manda como referência
    temporária — o servidor não lê nenhum campo ("Cannot access textAlign on
    the server").
  - ⚠️ **O foco volta ao texto na HORA** (`view.focus()` na barra): o `focus()`
    do Tiptap espera o próximo quadro, e o que se digitava logo depois de
    escolher numa lista ia para a própria lista.
- **Versão é retrato**: `documento_modelo_salvar` grava modelo + versão numa
  transação, e só abre versão nova quando o CONTEÚDO muda. Versão não se
  altera (gatilho); modelo não se apaga (desativa).
- **Modelos são `forms: MANAGE`** (Configurações → Documentos); colher a
  assinatura é o módulo `documents`; ligar ao procedimento é `procedures`.
- O banco recusa modelo de outra rede no procedimento (chave composta com
  `tenant_id`) e o tipo errado no campo (gatilho
  `trg_procedimento_modelos_do_tipo`).
- PDF enviado: cabeçalho `%PDF-` conferido (não o `type` do navegador), abre
  no `pdf-lib` sem senha, até 10 MB e 50 páginas; mora em
  `modelos-de-documento/<tenant>/<sha256>.pdf`.
- **O documento emitido é `issued_documents`** (`consent_terms` é legado). Nasce
  por GATILHO no agendamento (`trg_documentos_no_agendamento`: INSERT emite os de
  AGENDAMENTO; check-in, os de INICIO_ATENDIMENTO; cancelar/falta cancela os
  abertos; trocar o procedimento troca os documentos) — o agendamento nasce em
  cinco INSERTs. Agendamento de plano não emite (o plano tem os dele).
- **O gatilho só cria a linha (A_GERAR)**; o texto é montado pelo app
  (`lib/documentos/renderizar.ts` → `documento_registrar_render`), e toda tela
  que mostra um documento chama `garantirRenderizado` antes. Faltou dado
  obrigatório: INCOMPLETO, não assina.
- **A forma canônica é TEXTO** (`issued_documents.content`): jsonb reordenaria as
  chaves e o hash não bateria. O navegador calcula o SHA-256 dos bytes que
  recebeu; `documento_assinar` só aceita se bater com o gravado.
- **O bloqueio é gatilho** (`trg_documentos_bloqueiam_inicio`): nenhuma porta
  põe IN_PROGRESS com documento BLOQUEIA aberto. Dispensar (com motivo) cumpre.
- **Assinar é UMA função** para todos os canais (`documento_assinar`): trava,
  confere hash, grava a evidência (`document_signatures`, imutável, sem
  cascade) e o status numa transação. `termo.assinado` sai depois, em TS;
  `termo.emitido` sai do banco.
- ⚠️ **Releitura na mesma renderização: `abortSignal`.** O React memoriza
  `fetch` GET idênticos numa renderização — a releitura do documento depois de
  montá-lo devolvia a resposta velha. `lerDocumento` passa um sinal novo.
- A ficha do cliente lê a aba por `?aba=` (não `?tab=`).
- **Checkout do plano: Plano → Pagamento → Documentação → Agendamento.** O
  contrato de plano cita a forma de pagamento, então nasce depois dela
  (`prepararDocumentosDoPlano`, `lib/documentos/plano.ts`). O retrato do
  pagamento (`pagamentoNormalizado`, `lib/checkout/pagamento.ts`) fica em
  `issued_documents.payment_snapshot`; trocar o pagamento depois de assinar
  SUBSTITUI o contrato (`documento_substituir`).
- **O contrato do PROCEDIMENTO também cita o pagamento** (decisão do Heitor,
  2026-09-30): `pagamento.*` vale em CONTRATO e CONTRATO_PLANO. No avulso o
  pagamento só é recebido depois do atendimento, então a recepção o DEFINE
  antes da assinatura (`definirPagamentoDoContrato`, ficha e painel da sessão;
  o mesmo `PagamentoDoPlano` do checkout, guardado em `payment_snapshot`).
  - Sem retrato, o pagamento está "não combinado" — diferente de "no
    atendimento" (`{ forma: 'NADA_AGORA' }`): as variáveis ficam vazias e a
    obrigatória (`pagamento.forma`) deixa o contrato INCOMPLETO — não assina,
    não sai por link, e se BLOQUEIA trava o início do atendimento.
  - Troca até a assinatura (o texto e o hash são montados de novo); assinado,
    não muda.
  - O recebimento na recepção já vem com o meio combinado
    (`pagamentoCombinadoDoAtendimento`) — orienta, não trava.
- **A trava do checkout vem ANTES do dinheiro** (`recusaDosDocumentosDoPlano`
  em `checkoutTreatmentPlanInterno`): documento que BLOQUEIA aberto, ou contrato
  assinado para OUTRO pagamento, recusam. Ela EMITE antes de conferir — quem
  chama a action direto não escapa por "ainda não havia documento". O gatilho
  `trg_documentos_bloqueiam_plano` é a segunda linha (barra o status, mas o
  checkout não é transação única).
- **Toda rede nasce com o contrato de plano padrão** (`documentos_modelos_padrao`:
  migration para as de antes, `registerAction` para as novas). Sem CPF de
  propósito: o contrato de antes não o exigia.
- `consent_terms` é LEGADO: os assinados foram copiados para `issued_documents`
  (`moment = 'LEGADO'`, assinatura `identity_method = 'LEGADO'`) e o histórico da
  ficha e do portal lê `assinadosDoCliente`. Nada novo é gravado lá.
- **O PDF final** (`lib/documentos/pdf.ts`, `pdf-lib` + `qrcode`): o documento
  desenhado da MESMA árvore (ou o PDF enviado, como está), rodapé com o código
  em toda página e a página de evidências. Sai em `after()` depois de
  `documento_assinar`; o cron `documentos-pdf` recolhe o que falhar,
  reivindicando a linha (`documentos_pdf_reivindicar`, `skip locked`, 5
  tentativas). `documento_registrar_pdf` só grava uma vez. Texto passa por
  `limparParaWinAnsi` — o `pdf-lib` LANÇA com emoji no nome.
- **`/verificar` e `/verificar/[código]` são PÚBLICAS** (no proxy) e mostram
  status, rede, unidade, as INICIAIS do assinante e os dois SHA-256 — nunca CPF,
  nome completo, IP nem conteúdo. "Conferir um arquivo" calcula o hash no
  navegador. O PDF da equipe sai por `/api/documentos/[id]/pdf` (sessão +
  `documents: VIEW` + rede + unidade).
- **Portal do cliente** (`/[slug]/cliente/documentos`): o cliente vê o que pede a
  assinatura dele e os assinados, e assina com a SESSÃO como identidade
  (`assinarNoPortal`, `actions/documentos-portal.ts` — só documento DELE). A
  equipe manda por "Pedir no portal" (`pedirAssinaturaNoPortal`): push com
  texto GENÉRICO — o título pode dizer o procedimento, e o push aparece na tela
  de bloqueio. Cliente sem conta no portal: recusado, e a tela diz o caminho.
  Quem agenda pelo portal e tem documento a assinar vai direto para ele.
- **Link público** (`/assinar/[token]`, rota pública; `gerarLinkDeAssinatura`
  na ficha): uso único, 7 dias, um ativo por documento (gerar outro revoga).
  - **Só o SHA-256 do token vai para o banco** (`document_sign_links`) — o
    link se mostra UMA vez; perdeu, gera outro.
  - Antes de ver o documento o cliente confirma o CPF, ou a data de nascimento
    se o cadastro não tem CPF (sem nenhum dos dois, o link não é gerado).
    Antes disso a página mostra só a clínica e "um documento".
  - A conferência e as contas moram no banco, com o link travado
    (`documento_link_abrir`): 5 erros revogam o link, 20 erros na hora param
    o IP. Devolve jsonb em vez de lançar — a tentativa errada tem de ficar
    gravada.
  - `/api/assinar/abrir` e `/api/assinar/assinar` se defendem pelo link;
    assinar confere a identidade DE NOVO, e `documento_assinar` consome o link
    na mesma transação.
  - `document_sign_links` e `document_link_attempts`: RLS ligada e ZERO
    políticas, como credencial.
  - ⚠️ **IP é o `X-Real-IP`** (a borda do Railway o escreve), não o primeiro
    do `x-forwarded-for`, que o cliente forja à vontade — trocar o cabeçalho a
    cada tentativa furaria o limite (`ipEAparelho`).
  - WhatsApp mínimo: mensagem pronta (genérica) + `wa.me`; não depende de
    caixa conectada nem da janela de 24h.
  - **Pela conversa do inbox é escolha da REDE**, desligada de nascença
    (`tenants.documentos_link_pela_conversa`, Configurações → Documentos;
    muda só quem tem `forms: MANAGE` e abrangência de rede). Ligada, a ficha
    ganha "Enviar pela conversa" (`enviarLinkPelaConversa`): gera um link
    NOVO e o manda por `enviarNaConversa` na conversa de WhatsApp aberta em
    que o cliente falou por último (`conversaDoCliente`: `client_id`, senão o
    telefone), pela caixa DA CONVERSA — nunca pelo número de quem clicou.
    Não exige `crm`: quem manda não lê a conversa. Janela de 24h fechada: não
    sai, e o link volta para copiar. Sem conversa: recusa ANTES de gerar
    (não revoga o link que existe).
- O que os canais têm em comum mora em `lib/documentos/assinar.ts` (IP,
  assinante, o evento e o PDF depois de assinar), fora de `actions/`.
- O export da LGPD traz os termos e contratos na parte GERAL (sem dado
  clínico, por construção) e copia os PDFs assinados para o pacote.
- Prova: `e2e/documentos-modelos.spec.ts`, `e2e/documentos-atendimento.spec.ts`,
  `e2e/checkout-de-plano.spec.ts`, `e2e/documentos-verificacao.spec.ts`,
  `e2e/documentos-portal.spec.ts`, `e2e/documentos-link-publico.spec.ts`,
  `e2e/documentos-link-conversa.spec.ts`, `e2e/documentos-editor-rico.spec.ts` e
  `e2e/documentos-contrato-pagamento.spec.ts`.

### 9.5 Estoque
- `currentStock` nunca atualizado diretamente — sempre via `StockMovement` em transação
- `StockMovement.balanceAfter`: saldo snapshot no momento da movimentação (imutável)
- **Transferência entre unidades é imediata** (`adminTransferStock`): as duas
  pernas (`TRANSFER_OUT` e `TRANSFER_IN`) no mesmo insert, ligadas por uma
  `reference` aleatória. A tabela `stock_transfers` com confirmação do destino
  não é usada.
- **O lote é DA UNIDADE e BAIXA com a saída** (`product_batches.branch_id`,
  migration `20260928000001`). A baixa é GATILHO (`trg_lote_do_movimento`),
  pelo mesmo argumento do evento de estoque: FEFO entre os lotes ainda válidos,
  os vencidos só depois; o consumo do atendimento vem em unidade de consumo e
  é convertido para embalagens; a transferência leva o lote para o destino.
  Cada baixa deixa a ligação em `stock_movement_batches` — é ela que diz de qual
  lote saiu o que foi aplicado. Lote vencido é sinalizado, não bloqueado. Até
  2026-09-28 a tabela não tinha unidade, a entrada COM número de lote falhava
  inteira e o lote nunca baixava. Prova: `e2e/lotes-baixa.spec.ts`.

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
- **Cada parcela é um LANÇAMENTO** (pedido do Heitor, 2026-09-30): o
  parcelado grava a entrada ("— entrada") e uma linha de
  `financial_transactions` por parcela, com o vencimento dela, "— parcela
  2/3" na descrição e `parcela_numero`/`parcela_total`/`parcela_grupo` (o grupo
  liga as parcelas do mesmo parcelamento). Pagar, estornar, comissão,
  fidelidade e métricas já operam por lançamento — passam a valer por
  parcela. Vale para pacote, pré-pago, checkout e recebimento do plano e
  despesa parcelada; a divisão é uma só (`dividirEmParcelas`,
  `lib/checkout/parcelas.ts`: centavos, sobra na última, dia 31 vira o último
  dia do mês curto).
  - Era UM lançamento com o saldo inteiro e o vencimento da 1ª; as parcelas
    moravam em `installments`, que nenhuma tela lia, e o "Pagar" quitava o
    saldo de uma vez. `installments` agora é histórico (nada novo é escrito).
  - **`data_de_referencia`** (coluna gerada): o pago, no dia do pagamento; o
    em aberto, no vencimento (ou na criação, sem vencimento). É por ela que a
    lista do financeiro recorta o período — a parcela de novembro aparece em
    novembro — e que o "a receber" do período conta.
- Formas de pagamento: `CASH`, `PIX`, `DEBIT_CARD`, `CREDIT_CARD`, `INTERNAL_CREDIT`
- **Desconto de fidelidade** fica em `loyalty_discount`, FORA de `amount`: o
  lançamento registra o dinheiro que entrou (§9.2.2). Pago todo com pontos, o
  lançamento é de R$ 0 e sem forma de pagamento.
- **Desconto em todas as vendas** (decisão do Heitor, 2026-09-30): pacote,
  checkout do plano e o recebimento do avulso na recepção, em R$ ou %, SEM
  TETO, e fica registrado quem deu. A conta é uma só (`lib/vendas/desconto.ts`,
  em centavos; a tela usa `CampoDoDesconto`): o servidor a refaz a partir do
  pedido, e a função do banco confere.
  - **Pacote**: `client_packages.price` é o VENDIDO (`preco_tabela` −
    `desconto`, quem deu é `sold_by`); pagamento e sessões fecham com ele.
  - **Plano**: o desconto é RATEADO nos procedimentos do plano
    (`plano_aplicar_desconto`, maior resto — nenhum passa do preço de antes):
    `price` vira o vendido e o de antes fica em `preco_tabela`
    (`treatment_plans.desconto`/`desconto_por`). Contrato, sessões, comissão e
    fidelidade leem o preço vendido e não precisam saber de desconto. Parte
    sempre do preço de antes: repetir é seguro, e desconto 0 desfaz.
  - **Avulso**: `financial_transactions.sale_discount`, fora de `amount` (o
    bruto é `amount + loyalty_discount + sale_discount`). A ordem é voucher →
    desconto comercial → pontos (o teto dos pontos vale sobre o que sobra).
  - **Contrato**: o desconto é parte do COMBINADO — vai no retrato do
    pagamento (`pagamentoNormalizado(p, desconto)`, só quando existe), e
    trocá-lo depois de assinar substitui o contrato como trocar a forma.
    `pagamento.forma` fala do valor com desconto e diz o desconto; há
    `pagamento.subtotal` e `pagamento.desconto`.
  - Prova: `e2e/vendas-desconto.spec.ts`.
- **Pagar com `INTERNAL_CREDIT` desconta do saldo e recusa sem saldo**
  (2026-09-27). É GATILHO (`trg_credito_interno_uso`), pelo argumento do §9.9:
  receita paga nasce em cinco lugares. O saldo é a soma de
  `internal_credits.amount` — concessão positiva, uso NEGATIVO com o
  `transaction_id` que o consumiu. Estornar um pagamento feito com crédito
  devolve o crédito.
- Estorno (`estornar_transacao`, uma transação): contra-transação + a original
  marcada `notes='Estornada'` (nunca deletar). Recusa lançamento **não pago**
  e o **próprio estorno**. A contra-transação não leva `appointment_id` (há
  UNIQUE nele — levar fazia todo estorno de atendimento falhar).

### 9.7 Comissões (reforma de 2026-09-30, três fases no código)

Decisões do Heitor; o plano inteiro está no DEVLOG ("Comissões").

- **A regra é do PROFISSIONAL, na rede** (`commission_rules`: `tenant_id`,
  `professional_id uuid → users`, `procedure_id` nulo = PADRÃO): um padrão
  (% ou R$ fixo) e EXCEÇÕES por procedimento. Índice único
  `(professional_id, procedure_id) nulls not distinct`. Qual vale:
  `regraAplicavel` (`lib/comissoes/config.ts`) — a exceção, senão o padrão,
  senão nenhuma (o atendimento conclui sem comissão, e a tela avisa quem
  "atende" sem padrão).
- **Só o servidor grava regra**: `comissao_regras_definir` (service_role, confere
  profissional e procedimentos da rede). A sessão só LÊ — até 2026-09-30
  qualquer funcionário gravava `commission_rules` pelo PostgREST.
- **Configuração da REDE** (`commission_configs`, Configurações → Comissões,
  `financial: MANAGE` + abrangência de rede): `modo` (ATENDIMENTO, sobre o preço
  ao concluir | PAGAMENTO, sobre o recebido), descontos da base
  (`desconta_insumos`, `desconta_taxa`), `base_com_pontos` (PRECO | VALOR_PAGO,
  veio de `loyalty_configs.commission_base`) e `periodo` do fechamento
  (MENSAL | QUINZENAL | SEMANAL). **Taxas da maquininha** em `payment_fees`
  (Pix, débito, crédito 1–12x), gravadas por `comissao_taxas_definir`.
- A comissão de cada membro se define na **Equipe** (chip "Comissão …" na
  linha, `ComissaoDoMembro`), só com `financial: MANAGE` — gerir a equipe não
  dá acesso a quanto cada um ganha. Quem é de unidade só mexe nos da unidade.
- **A comissão DEVIDA é uma linha por procedimento executado**
  (`commission_lines`), e `commissions` é o EXTRATO dela: cada lançamento
  (`kind` LIBERACAO | AJUSTE | ESTORNO, com `motivo`, `released_at` e a
  transação que o causou) é uma diferença. Soma do extrato = o que a linha deve.
  - A linha nasce em `concluir_atendimento`, com o RETRATO da regra e da
    configuração (modo, descontos, base com pontos): mudar a configuração vale
    para os próximos atendimentos, não reescreve os concluídos.
  - **A base é lida no servidor** (`linhasDoAtendimento`,
    `lib/comissoes/leitura.ts`): avulso = preço do atendimento; sessão de plano
    = CADA procedimento da sessão com o preço dele no plano (e a regra dele);
    sessão de pacote = a parte DELA no rateio da venda (`package_sessions.preco`), e a regra do procedimento dela. Antes a regra do primeiro
    procedimento valia sobre a sessão inteira, e o pacote usava o preço que o
    navegador mandou.
  - Os insumos da linha são o custo dos movimentos do atendimento (a conta de
    `metrics_giro_estoque`), rateado pelo preço de cada procedimento.
- **A conta mora no BANCO, e só lá**: `private.comissao_alvo` diz quanto a
  linha deve AGORA, e `private.comissao_acertar_linha` lança a diferença para o
  já lançado (trava por linha; chamar duas vezes não lança duas). Não há cópia
  em TS — o recebimento do plano entra por gatilho e precisa dela.
  - Percentual: sobre preço − desconto comercial (sempre) − pontos/voucher
    (se saem da base) − taxa do recebimento (se marcada) − insumos (se
    marcados). Valor fixo: só pontos e voucher o reduzem, na proporção; taxa,
    insumos e desconto comercial não. No pacote e no plano o desconto já está
    no preço da sessão e do procedimento (§9.6).
  - ATENDIMENTO: devida desde a conclusão; o pagamento acerta (taxa, base com
    pontos) e o estorno do pagamento a zera.
  - PAGAMENTO: avulso só vale pago; plano e pacote liberam na proporção do que
    receberam (receita paga, sem estorno ÷ soma dos procedimentos do plano, ou ÷
    preço da venda do pacote). Pacote vendido antes de 2026-09-30 (sem venda no
    sistema) libera na conclusão.
  - Taxa: `private.comissao_taxa_pct` (a do meio; no crédito, a da maior
    parcela cadastrada até a do recebimento). No plano, ponderada pelo que
    cada recebimento pagou.
- **Quem acerta**: a conclusão, e o gatilho `trg_comissoes_do_pagamento` em
  `financial_transactions` (pagamento, recebimento do plano, estorno — marcar
  `notes = 'Estornada'` é o estorno). `confirmar_pagamento_do_atendimento` não
  mexe mais em comissão, e `loyalty_configs.commission_base` não é mais lido.
- **Atendimento concluído não se cancela nem vira falta** (gatilho
  `trg_atendimento_concluido_nao_cancela` + `updateAppointmentStatus`): tem
  prontuário, baixa e comissão. Desfazer o dinheiro é estornar o pagamento.
- `period_ref` do lançamento é o mês de `released_at` (fuso de SP).
- **O período de uma comissão é o do LANÇAMENTO** (`released_at`), em toda
  métrica (`metrics_core`, `_by_branch`, `_commissions_detail`,
  `_top_professionals`, a aba Profissionais de `metrics_relatorio`) e no
  fechamento — não o do atendimento: o ajuste de outubro de um atendimento de
  setembro é dinheiro de outubro, e o plano no modo "quando paga" libera meses
  depois da sessão.
- **Fechamento** (Financeiro → Comissões, `/admin/financeiro/comissoes` e
  `/[slug]/financeiro/comissoes`, corpo em `app/_shared/comissoes-da-equipe.tsx`):
  - Os períodos são os da configuração, no fuso (`lib/comissoes/periodo.ts`:
    mensal, quinzenal 1–15/16–fim, semanal segunda a domingo).
  - A tela lê do banco, agregado: `comissoes_resumo` (por profissional e
    unidade: lançado, a pagar, pago) e `comissoes_extrato`. O CSV é o extrato,
    montado no navegador.
  - "Fechar e pagar" (`fecharComissoes`, `financial: MANAGE`, e nunca com
    escopo OWN) chama `comissao_fechar`, que numa transação reivindica o que
    está ABERTO e não fechado até o fim do período (ou até agora),
    cria `commission_payouts` e a **despesa paga** (categoria "Comissões", na
    unidade) e marca os lançamentos `PAID` com `payout_id`. Trava por
    profissional e unidade: dois cliques fecham uma vez.
  - Fechamento não se reabre: estorno depois dele vira lançamento negativo
    no próximo. Saldo negativo não fecha.
  - **Estornar um fechamento** (`estornarFechamento` →
    `comissao_estornar_fechamento`, com motivo): estorna a despesa por
    `estornar_transacao` e devolve os lançamentos dele a "a pagar". É a ÚNICA
    porta — o gatilho `trg_despesa_de_fechamento` recusa estornar essa despesa
    pelo financeiro comum (a comissão ficaria "paga" com o dinheiro de volta).
- **Eventos**: `comissao.gerada` (app, na conclusão, um por LINHA — a chave era
  por atendimento e a sessão de plano perdia os outros), `comissao.liberada`
  (banco, em `comissao_acertar_linha`, quando um pagamento libera) e
  `comissao.paga` (banco, em `comissao_fechar`).
- **Quem vê quanto cada um ganha é o financeiro com escopo de TODOS.** Com
  OWN, a pessoa vê só a própria linha ("Minhas comissões"; o financeiro da rede
  a manda para lá) e não fecha. O ranking do dashboard e a comissão na aba
  Profissionais dos relatórios exigem `financial` sem OWN — o dado nem sai do
  servidor. Antes ficavam sob `team` e `reports`, e mostravam a de todos.
- O ranking de comissão é `metrics_ranking_comissao` (ordena pela comissão;
  o dashboard reordenava o top 5 por atendimentos).
- Prova: `e2e/comissoes-configuracao.spec.ts`, `e2e/comissoes-calculo.spec.ts`
  e `e2e/comissoes-fechamento.spec.ts`; os valores do eixo novo no
  `e2e/indicadores-cenario.spec.ts`.

### 9.8 Push Notifications
- Dois canais: **Web Push** (VAPID) no navegador e **FCM** no app Android
  (`lib/notifications/push.ts`)
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

### 9.8.0 Os números de WhatsApp da rede

**A rede tem VÁRIOS números, e cada um é uma linha de `whatsapp_numbers`.** Não
existe mais "o WhatsApp desta rede": toda pergunta é "qual DESTES", e quem
pergunta tem de dizer por quê. `getWhatsAppConfig(tenantId)` foi deletada em vez
de virar atalho — um atalho que escolhe uma linha em silêncio é o defeito que a
tabela veio remover.

- **Tabela própria, não `integration_configs`.** Lá `meta_ads`, `google_ads` e
  `meta_messaging` são legitimamente um por rede, e é a `unique (tenant_id,
  provider)` que os protege. Relaxá-la desprotegeria os três que estão certos.
- **Duas garantias moram em índice único**, não em disciplina do app: no
  máximo um `is_default` por rede, e no máximo um número por PESSOA. Um
  `update` direto ou um script de migração furam a garantia de app; as duas
  existem para matar a mesma coisa, que é a escolha silenciosa.
- **Um número, várias pessoas** (2026-09-27): quem fala por cada número mora em
  `whatsapp_number_users` — o caso típico é UM número de atendimento e três
  SDRs respondendo por ele. O contrário continua proibido (`unique (user_id)`).
  As chaves são compostas com `tenant_id`, então número de uma rede não liga
  pessoa de outra. A única escrita é `definir_vinculos_do_numero` (nome,
  unidade e pessoas numa transação). A antiga `whatsapp_numbers.user_id` saiu
  em 2026-09-28 (migration `20260928000010`).
- **`branch_id` no número é RÓTULO**, não escopo (decisão do Heitor,
  2026-09-25). Não entra em RLS, não entra em `ownerFilter`, e a conversa
  continua nascendo com `branch_id` nulo — a unidade vira tag depois.
- **Cada número tem seu provedor.** uazapi e oficial convivem na mesma rede.
  Nada derruba a conexão vizinha para ativar a sua.

**Por onde a mensagem sai** — a regra é `escolherNumeroDeSaida`
(`lib/whatsapp/escolha.ts`), pura de propósito, nesta ordem:

1. o número **do usuário**, sempre que ele tiver um — inclusive respondendo uma
   conversa que chegou por outra caixa;
2. a caixa **da conversa**;
3. o **padrão da rede** — é por ele que sai tudo que o SISTEMA inicia.

**Sem fallback para "a primeira ativa".** Rede com caixas ativas e nenhum padrão
devolve `null` e a tela avisa: o índice garante NO MÁXIMO um padrão, não PELO
MENOS um, e resolver a falta com um chute ressuscita o `data[0]`.

**O item 1 tem um custo, e ele não pode ser silencioso.** O cliente recebe de um
número que não conhece, abre-se uma thread nova no celular dele, a resposta volta
como conversa nova, e a janela de 24h daquela conversa não vale ali. Por isso:

- **a janela de 24h é da CAIXA QUE VAI ENVIAR**, nunca da conversa
  (`ultimoInboundNaCaixa`). Medir na conversa faz o sistema gravar a mensagem e
  só então a Meta recusar com 400 genérico;
- a mensagem de erro nomeia a caixa e o motivo;
- **`messages.whatsapp_number_id` existe** separado do da conversa, senão o
  histórico afirma que tudo saiu pela caixa dela;
- **`conversations.whatsapp_number_id` nunca é sobrescrito** — a conversa só
  adquire caixa no primeiro envio bem-sucedido, se ainda não tiver uma.
- **Exceção: editar mensagem** sai pela caixa que ENVIOU (o id da mensagem só
  existe lá; por outra linha é 404).

**Na entrada, o webhook nunca descarta a caixa.** `CaixaReceptora` é parâmetro
posicional e obrigatório de `resolveConversation`, antes do `provider` opcional —
um default deixaria um webhook novo voltar a jogar o número fora em silêncio. O
`appSecret` do HMAC vem da caixa que recebeu, não de "a config oficial da rede".

**O dedup usa DOIS índices parciais**, não um total: num índice único direto,
`NULL` nunca colide, e Instagram, Messenger e manual ficariam sem dedup nenhum
sem erro nenhum. O ramo `IS NULL` preserva a garantia antiga; o ramo
`IS NOT NULL` acrescenta a garantia por caixa. **E a releitura depois do 23505
leva o mesmo filtro de caixa** — é o único ponto onde esquecê-lo não aparece em
teste feliz: sob concorrência, a mensagem entra na thread errada.

**Nunca use um escalar de rede para decidir algo de uma conversa.**
`canaisConectados.provedorWhatsApp` fazia exatamente isso com a janela de 24h e
o botão de editar; com dois provedores convivendo, mentia em metade das
conversas. A conversa carrega `numero_provider`.

**O aviso e a escapatória são parte da regra, não enfeite.** Quando a caixa do
usuário difere da conversa, o composer avisa ANTES de digitar, nomeando os dois
números, e oferece um clique para responder pela caixa da conversa
(`pelaCaixaDaConversa`). O padrão continua sendo o número do usuário; a
escapatória existe para a decisão não virar parede — sem ela, quem tem número
próprio não responderia nenhuma conversa que não tenha nascido nele. Ela **zera
ao trocar de conversa**: deixar ligada mandaria a próxima pela caixa errada, sem
pedido e sem aviso (ele some quando ela está ativa).

**Quem é a caixa do usuário sai do SERVIDOR** (`canaisConectados(tenantId,
userId)` → `numeroDoUsuario`). A tela precisa saber por onde ELE fala, não de
quem é cada caixa da rede: mandar os vínculos todos ao navegador exporia a
estrutura da equipe para responder uma pergunta sobre uma pessoa só.

**Template pertence a uma WABA**, e o filtro é estrito. Dois números podem
compartilhar a mesma conta de negócio — por isso o escopo é a WABA, não o
número: escopar por número duplicaria o catálogo e faria submeter o mesmo nome
duas vezes à Meta, que recusa por colisão. Oferecer um template de outra conta
dá 404 no clique; lista vazia é melhor resposta.

⚠️ **O `config` de uma integração só grava as chaves do provedor**
(`CHAVES_DA_CONFIG` nas caixas, `CHAVES_DO_ADS` nos anúncios), e a
`baseUrl` tem de ser `https` e pública (`enderecoPublico`). O servidor
chama esse endereço: aceitar `127.0.0.1` ou `169.254.169.254` é dar a quem
tem `settings: MANAGE` um jeito de o app falar com a rede de dentro (SSRF).
`graphBase` (caixa oficial e `meta_ads`: envio, CAPI, campanhas, busca de
contas) troca o endereço da Graph API e é **costura de teste** — fica fora das listas de propósito, e quem remonta a
config campo a campo (`getAdsConfig`) precisa carregá-lo, senão o teste fala
com a Meta de verdade.

**Template só sai com variável que o sistema preenche** — com nome
(`{{nome}}`). O formato posicional da Meta (`{{1}}`) é recusado antes de
gravar: sairia com as chaves no texto do cliente.

⚠️ Os exports de `actions/uazapi-connection.ts` são **endpoints públicos**, e
recebem `numeroId`. Toda uma delas passa por `numeroDaRede()`, que confirma a
posse — sem isso, um id de outra rede entrega o QR code, desconecta e apaga a
instância paga de outra clínica.

### 9.8.1 WhatsApp oficial: coexistência × Cloud API

São dois jeitos de ligar o MESMO número à API da Meta, e a escolha é da
clínica porque a consequência é dela. Guardada em
`whatsapp_numbers.config.modo`; os textos moram em
`lib/whatsapp/modo-oficial.ts`, fora do componente, porque a explicação é
o que importa e precisa sobreviver a refação de tela.

- **Coexistência** — o aplicativo WhatsApp Business continua atendendo no
  celular e o sistema usa o mesmo número ao lado dele. As conversas e os
  contatos já existentes são trazidos na conexão. É o caminho de quem já atende
  pelo celular: nada para de funcionar no dia da conexão.
- **Cloud API** — o número migra para a API. O aplicativo **para** de funcionar
  com ele, e o histórico dele não vem junto. Voltar atrás exige desfazer a
  migração na Meta.

**O aviso da Cloud API fica na tela, em vermelho, antes de a pessoa escolher** —
não atrás de um link. É decisão que não se desfaz clicando.

⚠️ **O que ainda não existe:** o Embedded Signup da Meta, onde essa escolha
vira parâmetro da API (`featureType` no fluxo de onboarding). Hoje a
conexão oficial é credencial colada à mão no formulário, e o modo registra a
decisão e diz à clínica o que esperar. Quando o app da Meta existir (ver §5 de
"Em aberto" no DEVLOG), é aqui que o parâmetro entra.

---

### 9.9 Eventos de domínio e automações

Toda ação relevante do sistema vira um fato em `domain_events` — 44 eventos
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
- `pagamento.*`, `estoque.*`, `comissao.liberada` e `comissao.paga` saem de GATILHO ou função no banco (`origem: 'banco'`, sem
  ator), porque esses fatos nascem em cinco ou seis lugares do código e
  instrumentar um a um é garantir esquecer o próximo.
- **Campanha ≠ automação.** Campanha é disparo em massa por público; automação
  é reação a um fato. São dois produtos, e nada migra de um para o outro.
- **A fila do motor é `automation_runs`**, no Postgres — não há broker no
  projeto. O disparo é imediato (`after()`); o cron recolhe o que espera, o que
  falhou e o que é de tempo.
  - ⚠️ **Tirar trabalho da fila exige REIVINDICAR a linha**, não só selecionar.
    `retomarPendentes` faz isso com um compare-and-swap em `tentativas`
    (`.eq('tentativas', lido)`) que, na MESMA escrita, põe o run em `rodando`
    (só se ainda estiver `esperando`/`falhou`). Sem tirar da fila, a passagem
    que lesse DEPOIS da reivindicação via o run ainda esperando, com a
    tentativa já somada, e o CAS dela também passava (2026-09-30). E
    `dispararAgendas` com um em
    `ultimo_disparo_agenda`: quem escreve primeiro leva, e quem não muda linha
    nenhuma passa adiante. Sem isso, duas passagens concorrentes do cron —
    normal, porque o serviço roda de 5 em 5 minutos e uma fila grande passa
    disso — executam o MESMO run duas vezes. Num aviso é ruído; numa ação de
    mensagem é o cliente recebendo a mesma coisa duas vezes.
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
- **A oportunidade de um fato de CONVERSA vem da conversa** (`contexto.ts`,
  `oportunidadeDaConversa`): os eventos de conversa não carregam `leadId`, então
  o motor usa a ligada à thread (`conversations.lead_id`) e, sem ela, a aberta
  mais recente da PESSOA. Até 2026-09-27 mover etapa, desfecho, responsável e
  anotar num fluxo de "mensagem recebida" terminavam sempre em "sem
  oportunidade" — e o editor oferecia os quatro.
- O node guarda o desfecho em português (`ganho`/`perdido`); a etapa, no
  código do banco (`WON`/`LOST`). Comparar os dois direto nunca acha etapa.
- Prova de ponta a ponta: `e2e/mensagens-saida.spec.ts` — webhook real →
  automação → resposta pela caixa falsa + os quatro efeitos no card.

---

## 10. Fluxo de conclusão de atendimento

**É UMA transação** (desde 2026-09-28). `finishSession` CALCULA — a regra de
comissão aplicada, os pontos, a baixa de cada insumo (com rendimento e o
arredondamento das embalagens) — e a função `concluir_atendimento` (migration
`20260928000003`) GRAVA tudo de uma vez. Nenhuma regra de negócio no banco: ela
recebe os números prontos. É o desenho do estorno (`estornar_transacao`).

O que a transação grava, na ordem:

| # | O que grava | Onde |
|---|---|---|
| 1 | status `COMPLETED` + `completed_at` (agendamento TRAVADO, status conferido de novo) | `appointments` |
| 2 | o prontuário do cliente (nasce se não existe) e a entrada deste atendimento | `medical_records`, `medical_record_entries` |
| 3 | uma linha de comissão por procedimento (regra e configuração retratadas) e o primeiro acerto do extrato (§9.7) | `commission_lines`, `commissions` |
| 4 | cada insumo — e, pelos gatilhos, evento, mínimo e baixa do lote | `stock_movements`, `branch_product_stock` |
| 5 | a sessão do pacote usada e o contador (soma no banco) | `package_sessions`, `client_packages` |
| 6 | a linha do tempo | `appointment_history` |

Os pontos de fidelidade saíram daqui em 2026-09-28: nascem no pagamento (§9.2.2).

- **Falha em qualquer passo desfaz todos.** Antes, falhar o quinto deixava os
  quatro primeiros, e o atendimento ficava concluído com comissão e sem baixa
  de estoque — sem jeito de refazer, porque o status já dizia concluído.
- **Dois "finalizar" ao mesmo tempo concluem uma vez**: o agendamento é travado
  (`for update`) e o status conferido lá dentro. Antes, os dois passavam.
- **Eventos e notificações saem DEPOIS**, no TypeScript, só se a transação
  gravou — são aviso do que aconteceu.
- O mesmo insumo duas vezes na lista SOMA antes do cálculo (a baixa é
  calculada sobre o saldo lido uma vez).
- Prova: `e2e/conclusao-atomica.spec.ts` (falha no meio, pacote, concorrência)
  e `e2e/atendimento-fechamento.spec.ts` (a tela).

O resto do fluxo:
- A **receita não nasce no fechamento**: é `confirmPayment`, na recepção, que a
  lança já paga. Marcar "Concluído" na agenda (`completeAppointment`) exige o
  fechamento feito e só lança a conta a receber, se faltar — repetir é seguro.
- **Insumo faltando NÃO impede o fechamento** — a cliente já foi atendida
  (decisão do Heitor, 2026-09-27). O saldo fica **negativo**, para a falta
  aparecer no estoque, e a tela mostra o que faltou.
- Sessão de **plano** e de **pacote** já foi paga em outro lugar:
  `confirmPayment` recusa as duas no servidor, e a tela esconde o botão.
- Pontos: não são do fechamento — nascem quando o atendimento é PAGO (§9.2.2).

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
UAZAPI_MAX_INSTANCIAS=0            # 0 = sem teto (toda a instalação)
UAZAPI_MAX_POR_REDE=5              # teto por rede; cada instância é COBRADA
UAZAPI_PROXY_TEMPLATE=             # vazio = proxy gerenciado pela própria uazapi

# App
NEXT_PUBLIC_APP_URL=https://app.esteticaos.com.br
# (NEXT_PUBLIC_SCHEDULE_URL existia para o agendamento público, descartado — não é lida por nenhum código)

# Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=      # Web Push
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
# FCM (app Android): conta de serviço do Firebase — ver lib/notifications/push.ts
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
- **Modal é o `<dialog className="modal">` aberto por `showModal()`**, com
  `.modal-flex` + `.modal-container` + `.modal-body` quando tem cabeçalho
  fixo. Ele vai para a camada de cima do navegador, acima de qualquer
  `z-index`, e cabe na tela. Um `div` fixo com `z-index` fica atrás da
  topbar e sai da tela quando o conteúdo é longo: era o cadastro de cliente
  pelo inbox, até 2026-09-30.
  - **Modal novo é `<JanelaModal>`** (`components/shared/janela-modal.tsx`):
    abre sozinho, Esc e o fundo fecham (`fechaNoFundo={false}` em formulário
    longo, `travado` enquanto grava), e o corpo rola. Os 27 modais em `div`
    fixo passaram para ela em 2026-09-30. O que sobra de `position: fixed;
    inset: 0` é só o fundo invisível que fecha um menu — não é modal.
  - Imprimir de dentro da janela (o termo no checkout) solta a altura dela no
    `@media print` de `globals.css`.
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

#### App
- É o web: as mesmas telas e bibliotecas. Plugins do Capacitor só para o que é
  nativo (push, preferências, barra de status).

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
  - `revenuePending` — a receber, pelo VENCIMENTO (`data_de_referencia`;
    sem vencimento, a criação). Era pela criação: o parcelado inteiro caía no
    mês da venda.
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

**Todo indicador tem valor esperado escrito à mão** em
`e2e/indicadores-cenario.spec.ts` (unidade `[e2e]` + janela em 2021, antes de
qualquer dado real). `relatorios-coerencia` prova que tela e RPC concordam;
aquele prova que estão CERTOS. Mexeu numa `metrics_*`, o cenário tem de continuar
batendo — ou mudar junto, com o porquê. `new_clients` respeita a unidade como a
série (a unidade escolhida mais os clientes sem unidade).

**Uma regra de receita, e toda soma de dinheiro parte dela.**
`metrics_receitas_pagas` (migration `20260927000011`) é o conjunto canônico —
INCOME pago, sem estorno dos dois lados, eixo em `paid_at` — e é o mesmo
predicado de `metrics_core.revenue_cash`. Receita por unidade, por forma de
pagamento, por categoria, gasto por cliente e LTV saem DELE. Até 2026-09-27 os
relatórios somavam esses gráficos por `created_at` e com estorno, ao lado de um
KPI que não fazia nenhum dos dois.
- **LTV é o que o cliente PAGOU**, desde sempre (`metrics_do_cliente`,
  `metrics_top_clients`). Não é "preço dos atendimentos": atendimento concluído
  e não pago não é dinheiro que entrou.
- **Relatórios**: `metrics_relatorio(…, aba)` devolve os agregados só da aba
  aberta; a tela ordena, rotula e desenha. Contagens que o núcleo já tem
  (atendimentos, novos clientes, agenda, comissões, ticket) vêm de `getCore`, não
  de uma segunda conta. Listas curtas e com limite (lotes vencendo, parcelas)
  continuam listas.
- **Consumo de insumo é uma conta só** (`metrics_giro_estoque`): custo do
  MOVIMENTO, o do cadastro só como reserva. Dashboard, estoque e relatórios.
- **`lib/metrics` para a tela quando o RPC falha** (`logRpcError` lança). Ele
  registrava e devolvia zero — "R$ 0,00" com cara de dado.
- ⚠️ **Migration que cria função termina com `notify pgrst, 'reload schema'`.**
  Sem isso, parte das réplicas do PostgREST não conhece a função nova por um
  tempo e a chamada falha às vezes (visto em 2026-09-27: 1 em 3 rodadas).

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
❌ Rota de /api/* sem defesa própria (segredo, assinatura ou sessão + permissão) — o proxy não barra
❌ Somar/contar indicador na tela em vez de usar lib/metrics (trunca em 1000 linhas)
❌ Somar dinheiro por uma regra própria em vez de partir de metrics_receitas_pagas
❌ Migration que cria função sem notify pgrst, 'reload schema' no fim
❌ Montar janela de período com new Date(y, m, d) ou startOfMonth() do date-fns
❌ Comparar período parcial com período anterior inteiro
❌ Descartar o error de uma query (vira R$ 0,00 silencioso) — use gravar/ler/tentar
❌ Tratar a conversa como a pessoa — a pessoa é contacts, a conversa é uma thread
❌ Editar nome/telefone numa cópia (conversa, oportunidade) sem propagarDadosDaPessoa
❌ Buscar oportunidades por leads.conversation_id (é a thread de ORIGEM; a dona é contato_id)
❌ Agrupar a fila do inbox por pessoa — é uma linha por conversa (decisão de 2026-09-26)
❌ Ler tags de conversations.tags (é semente; a fonte é contacts.tags)
❌ Declarar variável plpgsql com nome de coluna (42702 dentro do gatilho, insert descartado)
❌ Procurar "o anúncio do cliente" na conversa mais recente em vez da mais recente COM anúncio
❌ Pegar trabalho de uma fila sem reivindicar a linha (duas passagens executam duas vezes)
❌ Ligar conversa a contato no TypeScript (é gatilho; senão o próximo ponto esquece)
❌ Filtrar por canal ou caixa ao procurar o contato (é o cruzamento que interessa)
❌ Perguntar "qual o WhatsApp desta rede?" — a pergunta é qual DESTES, e por quê
❌ Montar redirect ou redirect_uri com req.url / req.nextUrl.origin (é 0.0.0.0 no standalone) — use origemPublica
❌ Lançar new Error('Forbidden') à mão — use semAcesso() (em produção só o digest chega à tela)
❌ Contar com a MENSAGEM de um erro lançado no servidor na tela — em produção ela chega trocada; devolva { error } ou use erroParaTela
❌ Subir o Next sem rodar a suíte contra o build (16.3.5+ quebra o refresh; abaixo de 16.3.0 trava a action)
❌ Mostrar o nome da conversa (contact_name) em vez do da pessoa (contacts.name)
❌ Update pela sessão sem conferir a linha devolvida (sem policy de UPDATE, atinge zero linhas sem erro)
❌ Action que recebe id de conversa/mensagem sem conversaAoAlcance (esconder da lista não tranca o id)
❌ Action que recebe id de oportunidade sem leadAoAlcance (vale também fora do CRM: agenda, clientes)
❌ Policy RLS que confere só o cargo (role <> 'CLIENT') sem conferir a REDE
❌ Criar política de RLS em tabela de credencial (integration_configs, whatsapp_numbers) — só o servidor lê
❌ Função security definer em public que recebe tenant por parâmetro e fica aberta a anon/authenticated
❌ Decidir janela de 24h ou botão de editar por escalar de rede em vez da caixa da conversa
❌ Medir a janela de 24h na conversa quando quem envia é outra caixa
❌ Receber um id em export 'use server' sem confirmar que ele é da rede da sessão
❌ Gravar config de integração com chave fora da lista do provedor, ou baseUrl não pública (SSRF)
❌ Gravar mensagem de saída sem whatsapp_number_id (texto, template e mídia levam a caixa que enviou)
❌ Limpar um estado da rede ANTES de conferir o id que vai recebê-lo (setDefaultFunnel zerava o padrão)
❌ Action que recebe id de registro de UNIDADE e confere só a rede (use alcancaUnidade depois da rede)
❌ Criar agendamento fora de createAppointmentCore sem conferirPecasDoAgendamento
❌ Baixar lote no TypeScript (é o gatilho trg_lote_do_movimento; senão o próximo caminho esquece)
❌ Gravar parte da conclusão do atendimento fora de concluir_atendimento (é uma transação só)
❌ Gravar em commissions fora de comissao_acertar_linha, ou calcular valor de comissão no TypeScript (a conta é comissao_alvo)
❌ Mandar ao banco a base de comissão que o navegador enviou (plano e pacote se leem em linhasDoAtendimento)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
❌ Recortar comissão por scheduled_at do atendimento (o período é o do lançamento, released_at)
❌ Mostrar comissão de outra pessoa sem financial com escopo de todos (team e reports não bastam)
❌ Pagar comissão fora de comissao_fechar (a despesa e os lançamentos pagos vão juntos)
❌ Estornar a despesa de um fechamento fora de comissao_estornar_fechamento (os lançamentos têm de voltar a "a pagar")
❌ Criar pacote de cliente fora de pacote_vender (sessões, retrato do preço e dinheiro vão juntos)
❌ Calcular desconto de venda fora de lib/vendas/desconto.ts, ou confiar no valor de desconto que o navegador manda
❌ Pôr desconto comercial em amount ou em loyalty_discount (é sale_discount no avulso; no pacote e no plano, o preço vendido)
❌ Gravar um parcelado como um lançamento só (cada parcela é um lançamento; divida com dividirEmParcelas) ou escrever em installments
❌ Recortar a lista do financeiro por created_at (é data_de_referencia: pago no pagamento, em aberto no vencimento)
❌ Mexer no preço dos procedimentos do plano no checkout fora de plano_aplicar_desconto
❌ Reaproveitar pacote (client_packages) para o procedimento pré-pago — são separados (decisão do Heitor)
❌ Vender pré-pago fora de procedimento_vender, ou cancelar unidade fora de procedimento_cancelar_unidade
❌ Ligar crédito (unidade pré-paga ou sessão de pacote) a agendamento fora de createAppointmentCore/ligarCredito, ou com o preço que o navegador mandou
❌ Dar ponto de fidelidade no TypeScript (o ponto nasce no gatilho do pagamento; o saldo é saldo_de_pontos)
❌ Calcular vencimento de pontos fora de fidelidade_a_expirar (é a única cópia do FIFO)
❌ Mostrar qualquer sinal de pontos com o programa da rede desligado
❌ Pôr o desconto de pontos em amount (amount é o dinheiro recebido; o desconto é loyalty_discount)
❌ Confirmar pagamento de atendimento fora de confirmar_pagamento_do_atendimento, ou confiar no valor que o navegador manda
❌ Ler o voucher pela recompensa (o voucher tem o retrato de quando foi trocado) ou deixar o cliente trocar pontos sem client_redeem ligado
❌ Chamar expirar_pontos / fidelidade_bonus_aniversario / avisos_de_vencimento em teste sem p_tenant (vale para as redes reais)
❌ Calcular saldo de estoque depois de uma saída fora de lib/estoque/baixa.ts
❌ Oferecer apagar oportunidade (lead) — a que não vai adiante é marcada perdida
❌ Deixar o branchId do chamador vencer o do contexto numa leitura (ctx.branchId ?? branchId)
❌ Invalidar cache de permissão/acesso com revalidateTag 'max' (serve o velho mais uma vez) — use updateTag
❌ Fechar LISTA de período em "agora" (resolvePeriod.to) — use fullTo, o fim do período
❌ Tirar inicial de nome com nome[0] ou charAt(0) — use iniciaisDoNome (quebra em emoji)
❌ map() que devolve <> sem chave (a key no filho de dentro não conta)
❌ Criar agendamento sem procedure_id (a avaliação era a exceção e não existe mais)
❌ Confundir a ficha do PROCEDIMENTO (forms/form_data) com a anamnese GERAL do cliente
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
❌ Avaliar expressão de automação com eval/new Function (o texto vem do banco)
❌ Usar em termo/contrato variável fora do catálogo de lib/documentos/variaveis.ts, ou interpolar o TEXTO em vez da árvore
❌ Levar o JSON do editor (Tiptap) à tela ou ao PDF sem passar por converterDocumentoDoEditor (é a porta única do que se assina)
❌ Pôr fonte em documento que não esteja no catálogo e em public/fontes-documento (a tela e o PDF têm de desenhar a mesma)
❌ Alterar uma versão de modelo de documento ou apagar um modelo (edita → versão nova; o que não serve, desativa)
❌ Assinar documento fora de documento_assinar, ou emitir documento de agendamento fora do gatilho
❌ Guardar a forma canônica de um documento em jsonb (reordena as chaves e o hash não bate)
❌ Gravar o token do link de assinatura (só o SHA-256), ou contar tentativas do link fora de documento_link_abrir
❌ Usar o primeiro do x-forwarded-for como IP de limite (o cliente o forja) — é o X-Real-IP
```

---

## 14.1 Jobs agendados (cron)

São **dois serviços** no Railway, com ritmos diferentes, e os dois rodam o
mesmo `node /app/cron.mjs` da mesma imagem. O script chama as rotas
`/api/cron/*` do app com o `CRON_SECRET` e sai com código 1 se alguma falhar —
assim a execução aparece vermelha no painel em vez de falhar em silêncio.
Quando a chamada NÃO chegou ao app — falha de rede, 502/503/504 ou o 404
"Application not found" da borda do Railway —, tenta de novo (15 s, 30 s).
Tempo esgotado não repete: o job pode estar rodando, e rodaria duas vezes.

**O cron de produção roda no MESMO banco do E2E** e passa pelos dados
`[e2e]` como por quaisquer outros. É seguro porque toda fila reivindica a
linha (§9.9) e os testes conferem o estado final, não um intermediário que o
cron possa atravessar. Por isso: rota de cron que "recolhe o que ficou para
trás" recolhe só o que está PARADO há um tempo (`lgpd-exports`: 15 min), não
o recém-criado, que é do `after()` — e teste que precisa de um pendente
"esquecido" o cria com a data no passado.

| Serviço | Ritmo | `CRON_JOBS` |
|---|---|---|
| **Notification Cron** | `0 * * * *` (hora em hora) | vazio = o padrão (`notification-campaigns`, `lgpd-exports`, `meta-capi`, `eventos-expirados`, `estoque-minimo`, `fidelidade`, `documentos-pdf`) |
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
pnpm --filter web test:e2e:completa # a suíte inteira contra o build (porta 3100), em duas metades
```

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
- **A completa roda em duas metades** (`e2e/grupos.ts`, 2026-09-30): os
  ISOLADOS em paralelo (3 workers) e os COMPARTILHADOS, um por vez — no CI
  as duas JUNTAS, contra um servidor só (`E2E_SERVIDOR_PRONTO`); no
  `test:e2e:completa` local, em sequência (a máquina não aguenta quatro
  navegadores e o servidor). Isolado é o spec que cria a própria rede
  (`criarOutraRede`), não lê a rede real (`tenantId()`, `filiaisAtivas()`…),
  não usa a sessão padrão (o `page` do fixture é o admin da rede real) e não
  chama cron — `tests/e2e-grupos.test.ts` confere a lista. Juntas é seguro
  porque a varredura de sobras só leva `[e2e]` com mais de uma hora; e cada
  metade grava a sessão do admin no seu arquivo (`e2e/.auth/admin-<grupo>.json`).
  Spec novo com rede própria entra na lista; migrar um compartilhado
  para rede própria é o que encurta a suíte.
- Contra o build, `chamarAcao` lê os manifestos de `.next/server`
  (`E2E_BUILD`, ligado por `playwright.build.config.ts`).

**Apoio do E2E** (`apps/web/e2e/apoio/`). O E2E roda contra o banco da
produção (decisão do Heitor, 2026-09-27), isolado pelo prefixo `[e2e]`:
- `sessao.ts` — `criarMembro` (cargo com a matriz que o teste descrever, de
  rede ou de unidade), `membroComEscopoProprio` (o SDR) e `clienteComSessao`
  (cliente final no portal). Todos devolvem `estado` (cookies), `accessToken`
  (para falar com o PostgREST como a pessoa) e `destino` do login.
- `limpeza.ts` — `apagarClientes` / `apagarAgendamentos` na ordem das FKs, e
  `varrerSobras`, que o `global-setup` roda antes de cada rodada e que imprime o
  que não conseguiu apagar. Nunca toca `automations`. Só leva o que tem mais
  de UMA HORA (`E2E_IDADE_DA_SOBRA_MIN`): o mais novo pode ser de uma rodada
  em curso ao lado. Por isso uma rodada local durante o CI não derruba mais o
  CI (derrubava até 2026-09-30).
- `acao.ts` — `capturarAcao` / `reenviarAcao`: pega uma server action feita
  pela tela e a reenvia trocando o id. É o teste de "o endpoint recusa", que a
  tela sozinha não prova.
- `outra-rede.ts` — `criarOutraRede`: uma SEGUNDA rede `[e2e]` inteira (unidade,
  profissional, procedimento, e sob pedido cliente e produto), alvo dos
  testes de "uma rede não grava na outra". Com ela no banco, `tenantId()` e
  `filiaisAtivas()` filtram a rede de verdade — antes pegavam "a primeira".
- `uazapi-falsa.ts` — `subirUazapiFalsa`: uma uazapi em `127.0.0.1` que
  registra cada chamada e responde como a de verdade (ou 500, com
  `modo = 'erro'`). Caixa `[e2e]` com `config.baseUrl` apontando para ela faz o
  envio rodar INTEIRO — sucesso incluído — sem mensagem chegar a ninguém.
  `https://e2e.invalido` só serve para quando o teste não envia nada.
- `graph-falsa.ts` — `subirGraphFalsa`: a Graph API da Meta em
  `127.0.0.1` (envio oficial, API de Conversões, e com `responder` os GET de
  contas, pixels e campanhas), pela costura `config.graphBase` gravada direto
  no banco.
- Teste que mexe em configuração da REDE (integração, perfil) roda numa rede
  `[e2e]`: `criarOutraRede` + `criarMembro(…, { tenant })`. Assim a rede
  real nem é lida (`e2e/anuncios-integracao.spec.ts`).
- `acao-direta.ts` — `chamarAcao`: chama uma server action pelo id do
  manifesto do `next dev`, como a pessoa logada, sem montar a tela. Só
  argumentos JSON (FormData, por `acao.ts`). Toda recusa testada assim tem o
  admin como CONTROLE: argumento errado também "não muda nada".
  A action só existe nas rotas cujas PÁGINAS a usam; em outra, o Next responde
  200 com "Server action not found" — e `chamarAcao` lança, para a recusa não
  "passar" sem ter chegado à action.
- Limpeza que apaga no teste **olha o erro** (`expect(falhas).toEqual([])`):
  foi um `delete` calado que acumulou 78 clientes `[e2e]` na produção.
- Upload com arquivo não se reenvia (o Playwright não expõe o corpo
  multipart): o ataque se faz NA PÁGINA — `FormData.append` ou o input
  escondido adulterados antes de enviar (`e2e/prontuario.spec.ts`).

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
