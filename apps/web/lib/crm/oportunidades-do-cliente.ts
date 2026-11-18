import { createAdminClient } from '@/lib/supabase/admin'
import { can, ownerFilter, temRecurso } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
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
 *
 * As oportunidades são dado do CRM, não da ficha (CRM-03, varredura de
 * 18/11): sem o CRM (ou sem as oportunidades no plano), nenhuma; e o "só os
 * meus" do CRM recorta como no quadro e na linha do tempo (`ownerFilter`,
 * CLAUDE.md §11; o Heitor, 28/10: "Quem tem 'só os meus' vê 'só os meus', em
 * qualquer lugar"). A falha da leitura é `null` — a aba diz que não leu, em
 * vez de "Nenhuma oportunidade" (princípio 3).
 */
export async function oportunidadesDoCliente(
  ctx: TenantContext,
  clientId: string,
): Promise<ClientOpportunity[] | null> {
  if (!can(ctx, 'crm', 'VIEW') || !temRecurso(ctx, 'oportunidades')) return []
  const admin = createAdminClient()

  let q = admin
    .from('leads')
    .select('id, crm_stage_id, owner_id, created_at, value')
    .eq('tenant_id', ctx.tenantId!)
    .eq('client_id', clientId)
  const owner = ownerFilter(ctx, 'crm')
  if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)
  const { data: leads, error } = await q.order('created_at', { ascending: false })

  if (error) {
    console.error('[oportunidadesDoCliente]', error.message)
    return null
  }

  type Linha = { id: string; crm_stage_id: string | null; owner_id: string | null; created_at: string; value: number | string | null }
  type Etapa = { id: string; name: string; color: string | null; funnel_id: string | null; outcome: string | null }
  const linhas = (leads ?? []) as Linha[]
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

  const etapas = (stagesRes.data ?? []) as Etapa[]
  const porStage = new Map(etapas.map(s => [s.id, s]))
  const porOwner = new Map(((ownersRes.data ?? []) as { id: string; name: string }[]).map(u => [u.id, u.name]))

  const funnelIds = [...new Set(etapas.map(s => s.funnel_id).filter(Boolean))] as string[]
  // Como etapas e donos acima: o nome do funil é rótulo do card, e a falha fica
  // registrada em vez de derrubar a ficha do cliente.
  const { data: funis, error: erroFunis } = funnelIds.length > 0
    ? await admin.from('crm_funnels').select('id, name').in('id', funnelIds)
    : { data: [], error: null }
  if (erroFunis) console.error('[oportunidadesDoCliente] funis:', erroFunis.message)
  const porFunil = new Map(((funis ?? []) as { id: string; name: string }[]).map(f => [f.id, f.name]))

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
