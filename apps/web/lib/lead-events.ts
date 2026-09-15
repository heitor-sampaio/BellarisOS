import { createAdminClient } from '@/lib/supabase/admin'

export type LeadEventType = 'CREATED' | 'STAGE_CHANGED' | 'CONVERTED' | 'OWNER_CHANGED'

export interface LeadEvent {
  id:               string
  type:             LeadEventType
  from_stage_name:  string | null
  to_stage_name:    string | null
  from_funnel_name: string | null
  to_funnel_name:   string | null
  actor_name:       string | null
  created_at:       string
}

export const LEAD_EVENT_COLS =
  'id, type, from_stage_name, to_stage_name, from_funnel_name, to_funnel_name, actor_name, created_at'

interface Entrada {
  tenantId:     string
  leadId:       string
  type:         LeadEventType
  fromStageId?: string | null
  toStageId?:   string | null
  actorUserId?: string | null
  actorName?:   string | null
}

/**
 * Grava um evento na linha do tempo do card.
 *
 * ⚠️ Mora fora de `actions/` de propósito: **todo export de um arquivo
 * `'use server'` vira um endpoint público**, e um gravador de histórico
 * exposto assim deixaria qualquer cliente forjar a linha do tempo de um lead.
 * Só o leitor (`actions/lead-events.ts`) é server action, e ele autoriza.
 *
 * Nunca lança. Perder o registro é ruim; impedir que a pessoa mova o card
 * porque o log falhou é pior. O erro vai para o console, não é engolido.
 */
export async function registrarEventoLead(e: Entrada): Promise<void> {
  try {
    const admin = createAdminClient()

    // Nome da etapa e do funil ficam congelados na linha: renomear "Fechado"
    // para "Ganho" não pode reescrever o passado, e excluir a etapa não pode
    // apagar o histórico.
    const ids = [e.fromStageId, e.toStageId].filter((v): v is string => !!v)
    const nomes = new Map<string, { etapa: string; funil: string | null }>()

    if (ids.length > 0) {
      const { data, error } = await admin
        .from('crm_stages')
        .select('id, name, crm_funnels(name)')
        .in('id', ids)
      if (error) {
        console.error('[registrarEventoLead] etapas:', error.message)
      } else {
        for (const row of (data ?? []) as unknown as {
          id: string; name: string
          // O embed é um-para-um no banco, mas o tipo gerado do PostgREST o
          // declara como lista. Aceitar as duas formas evita depender disso.
          crm_funnels: { name: string } | { name: string }[] | null
        }[]) {
          const f = Array.isArray(row.crm_funnels) ? row.crm_funnels[0] : row.crm_funnels
          nomes.set(row.id, { etapa: row.name, funil: f?.name ?? null })
        }
      }
    }

    const de   = e.fromStageId ? nomes.get(e.fromStageId) : undefined
    const para = e.toStageId   ? nomes.get(e.toStageId)   : undefined

    const { error } = await admin.from('lead_events').insert({
      tenant_id:        e.tenantId,
      lead_id:          e.leadId,
      type:             e.type,
      from_stage_id:    e.fromStageId ?? null,
      to_stage_id:      e.toStageId   ?? null,
      from_stage_name:  de?.etapa   ?? null,
      to_stage_name:    para?.etapa ?? null,
      from_funnel_name: de?.funil   ?? null,
      to_funnel_name:   para?.funil ?? null,
      actor_user_id:    e.actorUserId ?? null,
      actor_name:       e.actorName   ?? null,
    })
    if (error) console.error('[registrarEventoLead]', error.message)
  } catch (err) {
    console.error('[registrarEventoLead]', err)
  }
}

/** Etapa atual do lead — base para saber se o movimento mudou alguma coisa. */
export async function etapaAtualDoLead(
  tenantId: string, leadId: string,
): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('leads')
    .select('crm_stage_id')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) { console.error('[etapaAtualDoLead]', error.message); return null }
  return (data?.crm_stage_id as string | null) ?? null
}
