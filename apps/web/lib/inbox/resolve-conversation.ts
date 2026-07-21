import { createAdminClient } from '@/lib/supabase/admin'
import type { InboundMsg } from '@/lib/whatsapp/types'
import type { InboxChannel } from '@/actions/inbox'
import { seedDefaultStages } from '@/actions/crm-stages'
import { resolveLeadSource } from '@estetica-os/utils'

interface ResolveResult {
  conversationId: string
  branchId:       string | null
}

// Normaliza número para dígitos (Brasil/internacional)
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Resolve (ou cria) a conversa de um inbound e garante que exista um CARD (lead) ligado a ela.
 *
 * Regras do CRM unificado:
 * - card = lead, conversa = operacional; ligados por conversations.lead_id.
 * - lead/conversa nascem na REDE (branch_id null); designação de filial é feita depois via tag.
 * - a origem do card é derivada do referral do anúncio (click-to-WhatsApp) ou Orgânico.
 *
 * Concorrência: o INSERT da conversa é ON CONFLICT DO NOTHING sobre
 * (tenant_id, channel, contact_phone). Só quem vence o insert cria o lead — evita cards duplicados
 * quando duas mensagens chegam quase simultaneamente.
 */
export async function resolveConversation(
  tenantId: string,
  msg:      InboundMsg,
  channel:  InboxChannel,
): Promise<ResolveResult | null> {
  const admin = createAdminClient()
  const phone = normalizePhone(msg.from)

  // 1. Lead já existente por telefone (ex.: criado manualmente antes da 1a mensagem)
  const { data: leadRows } = await admin
    .from('leads')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .or(`phone.eq.${phone},phone.eq.+${phone}`)
    .limit(1)

  let leadId:      string | null = leadRows?.[0]?.id ?? null
  let contactName: string        = leadRows?.[0]?.name ?? msg.pushName?.trim() ?? phone

  // 2. Cria a conversa ON CONFLICT DO NOTHING — trava de concorrência
  const { data: insertedRows } = await admin
    .from('conversations')
    .upsert(
      {
        tenant_id:     tenantId,
        branch_id:     null,          // network — designação de filial via tag depois
        lead_id:       leadId,
        channel,
        status:        'open',
        contact_name:  contactName,
        contact_phone: phone,
      },
      { onConflict: 'tenant_id,channel,contact_phone', ignoreDuplicates: true },
    )
    .select('id')

  // Conflito: a conversa já existia — buscar e retornar
  if (!insertedRows || insertedRows.length === 0) {
    const { data: convRows } = await admin
      .from('conversations')
      .select('id, branch_id')
      .eq('tenant_id', tenantId)
      .eq('channel', channel)
      .eq('contact_phone', phone)
      .limit(1)
    if (!convRows || convRows.length === 0) return null
    return { conversationId: convRows[0]!.id, branchId: convRows[0]!.branch_id }
  }

  // 3. Vencemos o insert — se não havia lead, criamos o card agora (network, sem filial)
  const conversationId = insertedRows[0]!.id
  if (!leadId) {
    const derived = resolveLeadSource({ referral: msg.referral })
    const stages  = await seedDefaultStages(tenantId)
    const firstStageId = stages[0]?.id ?? null

    const leadInsert: Record<string, unknown> = {
      tenant_id:    tenantId,
      branch_id:    null,
      name:         msg.pushName?.trim() || phone,
      phone,
      source:       derived.source,
      tags:         derived.tags,
      crm_stage_id: firstStageId,
    }
    if (derived.utm_source) leadInsert.utm_source = derived.utm_source
    if (derived.ctwa_clid)  leadInsert.ctwa_clid  = derived.ctwa_clid

    const { data: newLead } = await admin
      .from('leads')
      .insert(leadInsert)
      .select('id, name')
      .single()

    if (newLead) {
      leadId      = newLead.id
      contactName = newLead.name
      // Liga o card à conversa recém-criada (guard lead_id IS NULL)
      await admin
        .from('conversations')
        .update({ lead_id: leadId, contact_name: contactName })
        .eq('id', conversationId)
        .is('lead_id', null)
    }
  }

  return { conversationId, branchId: null }
}

export async function insertInboundMessage(
  conversationId: string,
  tenantId:       string,
  msg:            InboundMsg,
  channel:        InboxChannel,
) {
  const admin = createAdminClient()

  // Dedup: skip if external_id already exists
  const { data: existing } = await admin
    .from('messages')
    .select('id')
    .eq('external_id', msg.externalId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (existing) return

  await admin.from('messages').insert({
    conversation_id: conversationId,
    tenant_id:       tenantId,
    direction:       'inbound',
    content:         msg.content,
    channel,
    status:          'delivered',
    external_id:     msg.externalId,
    is_read:         false,
    created_at:      msg.timestamp,
  })
}

export async function updateMessageStatus(
  tenantId:   string,
  externalId: string,
  status:     string,
) {
  const admin = createAdminClient()
  await admin
    .from('messages')
    .update({ status })
    .eq('external_id', externalId)
    .eq('tenant_id', tenantId)
}
