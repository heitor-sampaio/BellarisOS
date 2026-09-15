'use server'

import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { LEAD_EVENT_COLS, type LeadEvent } from '@/lib/lead-events'

/**
 * Linha do tempo de um card, do mais recente para o mais antigo.
 *
 * Só leitura — o gravador vive em `lib/lead-events.ts`, fora de `actions/`,
 * porque export de arquivo `'use server'` é endpoint público.
 */
export async function getLeadEvents(leadId: string): Promise<LeadEvent[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  const admin = createAdminClient()

  // O alcance do cargo vale aqui também: sem esta checagem, "só os próprios
  // leads" não veria o card na lista mas leria o histórico dele pelo id.
  const owner = ownerFilter(ctx, 'crm')
  let dono = admin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('tenant_id', ctx.tenantId!)
  if (owner) dono = dono.or(`owner_id.is.null,owner_id.eq.${owner}`)
  const { data: lead, error: erroLead } = await dono.maybeSingle()

  if (erroLead) throw new Error(`Falha ao carregar o lead: ${erroLead.message}`)
  if (!lead) return []

  const { data, error } = await admin
    .from('lead_events')
    .select(LEAD_EVENT_COLS)
    .eq('lead_id', leadId)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`Falha ao carregar o histórico: ${error.message}`)
  return (data ?? []) as LeadEvent[]
}
