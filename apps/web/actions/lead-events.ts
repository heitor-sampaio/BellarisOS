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

/**
 * Histórico comercial de um CLIENTE: os eventos das oportunidades dele.
 *
 * Fica ao lado do histórico de atendimento (agendamentos, pagamentos) na ficha,
 * e responde outra pergunta: o que foi negociado com esta pessoa, ganho ou
 * perdido. Uma pessoa vira cliente e continua recebendo propostas — reativação
 * é isso — então a ficha precisa mostrar as duas histórias.
 */
export async function getClientEvents(clientId: string): Promise<LeadEvent[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')

  const admin = createAdminClient()

  const owner = ownerFilter(ctx, 'crm')
  let q = admin
    .from('leads')
    .select('id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('client_id', clientId)
  if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)

  const { data: leads, error: erroLeads } = await q
  if (erroLeads) throw new Error(`Falha ao carregar as oportunidades: ${erroLeads.message}`)

  const ids = (leads ?? []).map(l => l.id as string)
  if (ids.length === 0) return []

  const { data, error } = await admin
    .from('lead_events')
    .select(LEAD_EVENT_COLS)
    .in('lead_id', ids)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`Falha ao carregar o histórico: ${error.message}`)
  return (data ?? []) as LeadEvent[]
}

/**
 * Histórico do CONTATO: os eventos de todas as oportunidades dele, juntos.
 *
 * Antes o painel mostrava a linha do tempo de uma oportunidade só — o que
 * bastava quando havia uma por pessoa. Com várias, criar a segunda parecia não
 * ter acontecido: o evento existia, mas na linha do tempo da oportunidade que
 * não estava à vista.
 *
 * Cada evento carrega o funil de onde veio, senão "Etapa alterada" duas vezes
 * seguidas, de oportunidades diferentes, vira um histórico que confunde mais do
 * que informa.
 */
export async function getContactEvents(conversationId: string): Promise<LeadEvent[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  const admin = createAdminClient()

  // O alcance do cargo vale aqui como no histórico de um card: sem isto, "só os
  // próprios leads" leria pelo id da conversa o que não pode ver na lista.
  const owner = ownerFilter(ctx, 'crm')

  // O histórico é da PESSOA: as oportunidades de todas as threads dela, não só
  // as que nasceram nesta. Senão, na thread da unidade que assumiu, o histórico
  // do que o marketing fez antes some — o handoff de novo (§9.2.1).
  const { data: conv, error: erroConv } = await admin
    .from('conversations')
    .select('contato_id')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (erroConv) throw new Error(`Falha ao carregar o contato: ${erroConv.message}`)
  const contatoId = (conv as { contato_id: string | null } | null)?.contato_id
  if (!contatoId) return []

  let q = admin
    .from('leads')
    .select('id, crm_stage_id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('contato_id', contatoId)
  if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)

  const { data: leads, error: erroLeads } = await q
  if (erroLeads) throw new Error(`Falha ao carregar as oportunidades: ${erroLeads.message}`)

  const ids = (leads ?? []).map(l => l.id as string)
  if (ids.length === 0) return []

  const { data, error } = await admin
    .from('lead_events')
    .select(LEAD_EVENT_COLS)
    .in('lead_id', ids)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`Falha ao carregar o histórico: ${error.message}`)
  return (data ?? []) as LeadEvent[]
}
