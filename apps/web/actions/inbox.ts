'use server'

import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type InboxChannel = 'whatsapp' | 'instagram' | 'email' | 'manual'
export type ConvStatus   = 'open' | 'pending' | 'closed'

export interface Conversation {
  id:              string
  lead_id:         string | null
  client_id:       string | null
  channel:         InboxChannel
  status:          ConvStatus
  unread_count:    number
  last_message_at: string | null
  last_message:    string | null
  contact_name:    string | null
  contact_phone:   string | null
  branch_id:       string
  branch_name:     string | null
  created_at:      string
}

export interface Message {
  id:              string
  conversation_id: string
  direction:       'inbound' | 'outbound'
  content:         string
  channel:         InboxChannel
  status:          string
  sent_by_name:    string | null
  is_read:         boolean
  created_at:      string
}

export async function getConversations(): Promise<Conversation[]> {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'FINANCIAL', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  const { data } = await admin
    .from('conversations')
    .select('id, lead_id, client_id, channel, status, unread_count, last_message_at, last_message, contact_name, contact_phone, branch_id, created_at, branches(name)')
    .eq('tenant_id', ctx.tenantId!)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  return (data ?? []).map((c: any) => ({
    ...c,
    branch_name: c.branches?.name ?? null,
  }))
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const ctx   = await getTenantContext()
  const admin = createAdminClient()

  const { data } = await admin
    .from('messages')
    .select('id, conversation_id, direction, content, channel, status, sent_by_name, is_read, created_at')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: true })
    .limit(500)

  return (data ?? []) as Message[]
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<{ ok: boolean; message?: Message; error?: string }> {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'FINANCIAL', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('conversations')
    .select('id, channel, tenant_id, status, contact_phone')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  if (!conv) return { ok: false, error: 'Conversa não encontrada' }
  if (conv.status === 'closed') return { ok: false, error: 'Conversa encerrada' }

  // Resolve sender display name
  let senderName: string | null = null
  const { data: profile } = await admin
    .from('users')
    .select('name')
    .eq('id', ctx.userId)
    .single()
  senderName = profile?.name ?? null

  const { data: msg, error } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      tenant_id:       ctx.tenantId!,
      direction:       'outbound',
      content:         content.trim(),
      channel:         conv.channel,
      status:          'sending',
      sent_by_id:      ctx.userId,
      sent_by_name:    senderName,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  const msgTyped = msg as unknown as { id: string; status: string }

  // Dispatch to WhatsApp channel if configured
  if ((conv.channel === 'whatsapp') && conv.contact_phone) {
    try {
      const { getWhatsAppConfig, resolveProvider } = await import('@/lib/whatsapp/factory')
      const wpConfig = await getWhatsAppConfig(ctx.tenantId!)
      if (wpConfig) {
        const provider = resolveProvider(wpConfig)
        const { externalId } = await provider.send(conv.contact_phone, content.trim())
        await admin
          .from('messages')
          .update({ status: 'sent', external_id: externalId })
          .eq('id', msgTyped.id)
        msgTyped.status = 'sent'
      } else {
        await admin.from('messages').update({ status: 'sent' }).eq('id', msgTyped.id)
        msgTyped.status = 'sent'
      }
    } catch (sendErr: any) {
      await admin.from('messages').update({ status: 'failed' }).eq('id', msgTyped.id)
      msgTyped.status = 'failed'
    }
  } else {
    // manual channel — mark as sent immediately
    await admin.from('messages').update({ status: 'sent' }).eq('id', msgTyped.id)
    msgTyped.status = 'sent'
  }

  revalidatePath('/admin/crm')
  return { ok: true, message: msg as unknown as Message }
}

export async function markConversationRead(conversationId: string) {
  const ctx   = await getTenantContext()
  const admin = createAdminClient()

  await Promise.all([
    admin.from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .eq('tenant_id', ctx.tenantId!),
    admin.from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false),
  ])
}

export async function setConversationStatus(conversationId: string, status: ConvStatus) {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  await admin
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath('/admin/crm')
}

export async function createConversationForLead(
  leadId:  string,
  channel: InboxChannel,
): Promise<{ conversationId?: string; error?: string }> {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  // Return existing conversation if any
  const { data: existing } = await admin
    .from('conversations')
    .select('id')
    .eq('lead_id', leadId)
    .eq('channel', channel)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (existing) return { conversationId: existing.id }

  const { data: lead } = await admin
    .from('leads')
    .select('id, name, phone, branch_id')
    .eq('id', leadId)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  if (!lead) return { error: 'Lead não encontrado' }

  const { data: conv, error } = await admin
    .from('conversations')
    .insert({
      tenant_id:     ctx.tenantId!,
      branch_id:     lead.branch_id,
      lead_id:       leadId,
      channel,
      status:        'open',
      contact_name:  lead.name,
      contact_phone: lead.phone ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/admin/crm')
  return { conversationId: (conv as unknown as { id: string }).id }
}
