import { unstable_cache } from 'next/cache'
import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'

// ─── Situação da REDE (bloqueada?) ────────────────────────────────────────────
// Lida a cada requisição da equipe (`buildContext`) e pelo portal do paciente.
// Quem muda a situação (o /sistema, o webhook do Asaas, o cron) expira a tag
// `rede:<id>` na hora — mesmo desenho do membro desativado.
export type CachedRede = { id: string; nome: string; ativa: boolean; planStatus: string | null }

export const tagDaRede = (tenantId: string) => `rede:${tenantId}`

export function getCachedRede(tenantId: string) {
  return unstable_cache(
    async (): Promise<CachedRede | null> => {
      const data = await ler(createAdminClient()
        .from('tenants').select('id, name, is_active, plan_status')
        .eq('id', tenantId).maybeSingle(), 'buscar a situação da rede')
      if (!data) return null
      return { id: data.id, nome: data.name, ativa: data.is_active !== false, planStatus: data.plan_status ?? null }
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
