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
