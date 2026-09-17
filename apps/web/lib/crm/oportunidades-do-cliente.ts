import { createAdminClient } from '@/lib/supabase/admin'
import type { ClientOpportunity } from '@/components/branch/client-profile'

/**
 * Oportunidades ligadas a um cliente, para a ficha dele.
 *
 * Fora de `actions/` porque é leitura de página (Server Component), e porque
 * todo export de um arquivo `'use server'` vira endpoint público — quem chama
 * aqui já autorizou com `assertPermission(ctx, 'clients', 'VIEW')`.
 *
 * Em consultas separadas em vez de embed aninhado do PostgREST: quando a
 * inferência do relacionamento falha, a resposta volta sem o campo em vez de
 * estourar, e a ficha mostraria "sem funil" para todo mundo, em silêncio.
 */
export async function oportunidadesDoCliente(
  tenantId: string,
  clientId: string,
): Promise<ClientOpportunity[]> {
  const admin = createAdminClient()

  const { data: leads, error } = await admin
    .from('leads')
    .select('id, crm_stage_id, owner_id, created_at, value')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[oportunidadesDoCliente]', error.message)
    return []
  }

  const linhas = (leads ?? []) as any[]
  if (linhas.length === 0) return []

  const stageIds = [...new Set(linhas.map(l => l.crm_stage_id).filter(Boolean))] as string[]
  const ownerIds = [...new Set(linhas.map(l => l.owner_id).filter(Boolean))] as string[]

  const [stagesRes, ownersRes] = await Promise.all([
    stageIds.length > 0
      ? admin.from('crm_stages').select('id, name, color, funnel_id, outcome').in('id', stageIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length > 0
      ? admin.from('users').select('id, name').in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (stagesRes.error) console.error('[oportunidadesDoCliente] etapas:', stagesRes.error.message)
  if (ownersRes.error) console.error('[oportunidadesDoCliente] donos:', ownersRes.error.message)

  const porStage = new Map((stagesRes.data ?? []).map((s: any) => [s.id as string, s]))
  const porOwner = new Map((ownersRes.data ?? []).map((u: any) => [u.id as string, u.name as string]))

  const funnelIds = [...new Set((stagesRes.data ?? []).map((s: any) => s.funnel_id).filter(Boolean))] as string[]
  const { data: funis } = funnelIds.length > 0
    ? await admin.from('crm_funnels').select('id, name').in('id', funnelIds)
    : { data: [] }
  const porFunil = new Map((funis ?? []).map((f: any) => [f.id as string, f.name as string]))

  return linhas.map(l => {
    const etapa = l.crm_stage_id ? porStage.get(l.crm_stage_id) : null
    return {
      id:          l.id,
      funnel_name: etapa?.funnel_id ? porFunil.get(etapa.funnel_id) ?? null : null,
      stage_name:  etapa?.name ?? null,
      stage_color: etapa?.color ?? null,
      // Sem etapa conta como aberta: sumir da ficha por falta de etapa seria
      // pior do que aparecer sem ela.
      outcome:     (etapa?.outcome ?? 'OPEN') as ClientOpportunity['outcome'],
      owner_name:  l.owner_id ? porOwner.get(l.owner_id) ?? null : null,
      value:       l.value === null || l.value === undefined ? null : Number(l.value),
      created_at:  l.created_at,
    }
  })
}
