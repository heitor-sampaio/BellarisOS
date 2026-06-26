import { createAdminClient } from '@/lib/supabase/admin'
import type { InboundMsg } from '@/lib/whatsapp/types'

interface ResolveResult {
  conversationId: string
  branchId:       string
}

// Normaliza número para 11 dígitos (Brasil) ou formato internacional mínimo
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export async function resolveConversation(
  tenantId:     string,
  msg:          InboundMsg,
  channel:      'whatsapp',
): Promise<ResolveResult | null> {
  const admin = createAdminClient()
  const phone = normalizePhone(msg.from)

  // 1. Existing conversation for this phone + channel + tenant
  const { data: convRows } = await admin
    .from('conversations')
    .select('id, branch_id')
    .eq('tenant_id', tenantId)
    .eq('channel', channel)
    .eq('contact_phone', phone)
    .limit(1)

  if (convRows && convRows.length > 0) {
    return { conversationId: convRows[0].id, branchId: convRows[0].branch_id }
  }

  // 2. Try to match a lead by phone number in this tenant
  const { data: leadRows } = await admin
    .from('leads')
    .select('id, name, branch_id')
    .eq('tenant_id', tenantId)
    .or(`phone.eq.${phone},phone.eq.+${phone}`)
    .limit(1)

  let leadId:    string | null = null
  let branchId:  string | null = null
  let contactName = phone   // fallback to phone number as name

  if (leadRows && leadRows.length > 0) {
    const lead = leadRows[0]
    leadId      = lead.id
    branchId    = lead.branch_id
    contactName = lead.name
  } else {
    // 3. No lead — attach to the first active branch of this tenant
    const { data: branches } = await admin
      .from('branches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at')
      .limit(1)

    if (!branches || branches.length === 0) return null
    branchId = branches[0].id
  }

  // 4. Create new conversation
  const { data: newConv } = await admin
    .from('conversations')
    .insert({
      tenant_id:     tenantId,
      branch_id:     branchId!,
      lead_id:       leadId,
      channel,
      status:        'open',
      contact_name:  contactName,
      contact_phone: phone,
    })
    .select('id, branch_id')
    .single()

  if (!newConv) return null
  return { conversationId: newConv.id, branchId: newConv.branch_id }
}

export async function insertInboundMessage(
  conversationId: string,
  tenantId:       string,
  msg:            InboundMsg,
  channel:        'whatsapp',
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
