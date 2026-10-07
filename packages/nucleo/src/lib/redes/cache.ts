import { unstable_cache } from 'next/cache'
import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import { lerRecursos, type RecursosDoPlano } from '../planos/recursos'

// ─── Situação da REDE (bloqueada?) ────────────────────────────────────────────
// Lida a cada requisição da equipe (`buildContext`) e pelo portal do paciente.
// Quem muda a situação (o /sistema, o webhook do Asaas, o cron) expira a tag
// `rede:<id>` na hora — mesmo desenho do membro desativado.
// O RETRATO do plano (o que a rede pode usar) vem junto: o `buildContext`
// corta as permissões por ele, e mudar o plano expira a mesma tag.
export type CachedRede = { id: string; nome: string; ativa: boolean; planStatus: string | null; recursos: RecursosDoPlano | null }

export const tagDaRede = (tenantId: string) => `rede:${tenantId}`

export function getCachedRede(tenantId: string) {
  return unstable_cache(
    async (): Promise<CachedRede | null> => {
      const data = await ler(createAdminClient()
        .from('tenants').select('id, name, is_active, plan_status, tenant_subscriptions(recursos)')
        .eq('id', tenantId).maybeSingle(), 'buscar a situação da rede')
      if (!data) return null
      // Um para um (a PK de tenant_subscriptions é o tenant_id): objeto, ou nulo.
      const sub = (Array.isArray(data.tenant_subscriptions) ? data.tenant_subscriptions[0] : data.tenant_subscriptions) as { recursos: unknown } | null
      return { id: data.id, nome: data.name, ativa: data.is_active !== false, planStatus: data.plan_status ?? null, recursos: lerRecursos(sub?.recursos ?? null) }
    },
    [`rede-${tenantId}`],
    { revalidate: 60, tags: [tagDaRede(tenantId)] },
  )()
}

/** A rede de um cliente final (o JWT dele não leva `tenant_id`). Não muda. */
export function getCachedRedeDoCliente(clientId: string) {
  return unstable_cache(
    async (): Promise<string | null> => {
      const data = await ler(createAdminClient().from('clients').select('tenant_id').eq('id', clientId).maybeSingle(),
        'buscar a rede do cliente')
      return (data?.tenant_id as string | undefined) ?? null
    },
    [`cliente-rede-${clientId}`],
    { revalidate: 86_400 },
  )()
}
