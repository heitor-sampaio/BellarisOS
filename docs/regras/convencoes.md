# Convenções de código — os modelos

> Tirados do `CLAUDE.md` em 2026-10-06 (o §8 e o §4 apontam para cá). As
> regras continuam lá; aqui ficam os exemplos.

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

> O helper real faz mais (membro no banco, rede bloqueada, sessão de suporte,
> permissões): o exemplo mostra só a origem dos claims.

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

### Lista que cresce — em páginas (2026-10-22)

O PostgREST devolve no máximo **1000 linhas** por consulta, e o que passa disso
some sem erro nenhum. `.limit(2000)` (ou `limit 2000` dentro da função)
também vira 1000. A varredura de 2026-10-22 achou o corte na lista de
clientes, na "última visita", no público das campanhas, no quadro de
oportunidades, no relatório comercial, na agenda da rede, no financeiro, nas
comissões, no checkout, nas automações e nos injetáveis.

- **Lista que a tela mostra inteira**: `lerTodas` (`lib/db.ts`), com ORDEM
  estável — a coluna da tela e o `id` de desempate. Sem o desempate, as
  páginas se sobrepõem.
  ```typescript
  const leads = await lerTodas((de, ate) => admin
    .from('leads').select('id, name').eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false }).order('id')
    .range(de, ate), 'carregar os leads')
  ```
  Função do banco que devolve linhas também: `admin.rpc(…).order(…).range(de, ate)`.
- **Conta sobre uma lista** (última visita, total por cliente, quantos por
  automação): agregada no banco, numa função — não lida e contada no app.
- **Filtro que o app aplicava depois de ler** (aniversário do dia, "sem
  retorno", "fez o procedimento"): vai para a consulta. Ler 1000 quaisquer e
  filtrar em JavaScript perde quem não veio no lote — e um teto (`limit`) só
  depois do filtro (`clientes_do_publico`, `lib/clientes/publico.ts`).
- **Lista de ids** grande não vai no `.in()` (vai na URL, e passa do limite
  dela): vai no corpo de uma função (`rpc`, que é POST).
- ⚠️ Função comum (sem `security definer`) que o SERVIDOR chama não usa
  `private.*`: o schema dá `usage` a `authenticated` (as políticas) e não a
  `service_role` — ela falha sempre com 42501. Foi a primeira versão de
  `clientes_do_publico` (consertada em `20261023000001`).
- Prova: `e2e/listas-sem-corte.spec.ts` (uma rede com mais de 1000 linhas em
  cada lista, e o alvo depois da linha 1000).
