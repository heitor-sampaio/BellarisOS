import { createAdminClient } from '@/lib/supabase/admin'
import { isUnitTag } from '@estetica-os/utils'

export type LeadEventType =
  | 'CREATED'
  | 'STAGE_CHANGED'
  | 'UNIT_CHANGED'
  | 'UPDATED'
  | 'APPOINTMENT_CREATED'
  | 'CONVERTED'
  | 'OWNER_CHANGED'

/** Uma alteração de campo, do jeito que a linha do tempo exibe. */
export interface LeadChange {
  campo: string
  de:    string | null
  para:  string | null
}

export interface LeadEvent {
  id:               string
  type:             LeadEventType
  from_stage_name:  string | null
  to_stage_name:    string | null
  from_funnel_name: string | null
  to_funnel_name:   string | null
  actor_name:       string | null
  changes:          LeadChange[] | null
  created_at:       string
}

export const LEAD_EVENT_COLS =
  'id, type, from_stage_name, to_stage_name, from_funnel_name, to_funnel_name, actor_name, changes, created_at'

interface Entrada {
  tenantId:     string
  leadId:       string
  type:         LeadEventType
  fromStageId?: string | null
  toStageId?:   string | null
  actorUserId?: string | null
  actorName?:   string | null
  changes?:     LeadChange[] | null
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
      changes:          e.changes && e.changes.length > 0 ? e.changes : null,
    })
    if (error) console.error('[registrarEventoLead]', error.message)
  } catch (err) {
    console.error('[registrarEventoLead]', err)
  }
}

/** Rótulo de cada campo do lead na linha do tempo. */
export const CAMPOS_LEAD: Record<string, string> = {
  name:         'Nome',
  phone:        'Telefone',
  email:        'E-mail',
  social_media: 'Rede social',
  source:       'Origem',
  notes:        'Observações',
  tags:         'Tags',
  procedures:   'Procedimentos de interesse',
}

/** Estado do lead antes de uma edição, para comparar depois. */
export interface EstadoLead {
  crm_stage_id: string | null
  unidade:      string | null
  campos:       Record<string, string | null>
}

/**
 * Compara dois retratos do lead e devolve só o que mudou.
 *
 * Campo vazio e campo nulo são a mesma coisa aqui: limpar um telefone em branco
 * não é uma alteração e não merece linha no histórico.
 */
export function diferencas(
  antes:  Record<string, string | null>,
  depois: Record<string, string | null>,
): LeadChange[] {
  const mudou: LeadChange[] = []
  for (const campo of Object.keys(CAMPOS_LEAD)) {
    if (!(campo in depois)) continue
    const de   = (antes[campo]  ?? '').trim()
    const para = (depois[campo] ?? '').trim()
    if (de === para) continue
    mudou.push({
      campo: CAMPOS_LEAD[campo] ?? campo,
      de:    de   || null,
      para:  para || null,
    })
  }
  return mudou
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

/**
 * Retrato do lead antes da edição — é o que permite dizer "de X para Y".
 *
 * Lido sempre ANTES do update: depois já é o valor novo, e o histórico
 * registraria "de Y para Y".
 */
export async function estadoAtualDoLead(
  tenantId: string, leadId: string,
): Promise<EstadoLead | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('leads')
    .select('crm_stage_id, name, phone, email, social_media, source, notes, tags, lead_procedures(procedure_id, procedures(name))')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) { console.error('[estadoAtualDoLead]', error.message); return null }
  if (!data) return null

  const l = data as unknown as {
    crm_stage_id: string | null
    name: string | null; phone: string | null; email: string | null
    social_media: string | null; source: string | null; notes: string | null
    tags: string[] | null
    // O embed aninhado vem como objeto no runtime e como lista no tipo gerado.
    lead_procedures: { procedure_id: string; procedures: { name: string } | { name: string }[] | null }[] | null
  }

  const tags = l.tags ?? []

  return {
    crm_stage_id: l.crm_stage_id,
    unidade:      tags.find(isUnitTag) ?? null,
    campos: {
      name:         l.name,
      phone:        l.phone,
      email:        l.email,
      social_media: l.social_media,
      source:       l.source,
      notes:        l.notes,
      // A unidade sai das tags: ela tem evento próprio, senão apareceria duas
      // vezes na linha do tempo.
      tags:         listaLegivel(tags.filter(t => !isUnitTag(t))),
      // Nome, não id: "Botox → Botox, Preenchimento" se lê; uma lista de UUID não.
      procedures:   listaLegivel((l.lead_procedures ?? []).map(p => {
        const proc = Array.isArray(p.procedures) ? p.procedures[0] : p.procedures
        return proc?.name ?? p.procedure_id
      })),
    },
  }
}

/** Lista estável e comparável: ordenada e separada por vírgula. */
export function listaLegivel(valores: string[]): string {
  return [...valores].sort().join(', ')
}
