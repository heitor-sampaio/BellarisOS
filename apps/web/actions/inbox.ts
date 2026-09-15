'use server'

import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultFunnel, listAllStages } from '@/actions/crm-funnels'
import { revalidatePath } from 'next/cache'

export type InboxChannel = 'whatsapp' | 'instagram' | 'messenger' | 'email' | 'manual'
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
  branch_id:       string | null
  branch_name:     string | null
  created_at:      string
  // Métricas de atendimento (mantidas pelo trigger on_new_message)
  last_message_direction: 'inbound' | 'outbound' | null
  last_inbound_at:        string | null
  awaiting_since:         string | null
  first_response_seconds: number | null
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
  assertPermission(ctx, 'crm', 'VIEW')
  const admin = createAdminClient()

  // O alcance do CRM filtrava o funil e não filtrava aqui: com "só os próprios
  // leads", a pessoa ainda lia o WhatsApp da clínica inteira.
  const owner = ownerFilter(ctx, 'crm')
  let ownLeadIds: string[] | null = null
  if (owner) {
    const { data: mine, error } = await admin
      .from('leads')
      .select('id')
      .eq('tenant_id', ctx.tenantId!)
      .eq('owner_id', owner)
    if (error) {
      console.error('[getConversations] leads do dono:', error.message)
      return []
    }
    ownLeadIds = (mine ?? []).map(l => l.id as string)
  }

  let query = admin
    .from('conversations')
    .select('id, lead_id, client_id, channel, status, unread_count, last_message_at, last_message, contact_name, contact_phone, branch_id, created_at, last_message_direction, last_inbound_at, awaiting_since, first_response_seconds, branches(name)')
    .eq('tenant_id', ctx.tenantId!)

  if (ownLeadIds) {
    // Conversa sem lead é contato que ainda não virou card: fica no bolo comum,
    // visível para todo mundo, senão ninguém atende.
    query = ownLeadIds.length > 0
      ? query.or(`lead_id.is.null,lead_id.in.(${ownLeadIds.join(',')})`)
      : query.is('lead_id', null)
  }

  const { data, error } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) {
    console.error('[getConversations]', error.message)
    return []
  }

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

// --- Card do lead ligado à conversa (3a coluna do inbox) ---------------------

export interface InboxLead {
  id:            string
  name:          string
  phone:         string | null
  email:         string | null
  social_media:  string | null
  source:        string | null
  notes:         string | null
  crm_stage_id:  string | null
  tags:          string[]
  branch_id:     string | null
  client_id:     string | null
  procedure_ids: string[]
}

export interface InboxStage {
  id: string; funnel_id: string; name: string; color: string; position: number
}

export interface ConversationCard {
  lead:   InboxLead | null
  /** Etapas de TODOS os funis: é daqui que sai o menu que move o lead de funil. */
  stages:  InboxStage[]
  funnels: { id: string; name: string }[]
}

export async function getLeadForConversation(conversationId: string): Promise<ConversationCard> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  const admin = createAdminClient()

  const funis  = await seedDefaultFunnel(ctx.tenantId!)
  const stages = (await listAllStages(ctx.tenantId!)) as InboxStage[]
  const funnels = funis
    .filter(f => f.archived_at === null)
    .map(f => ({ id: f.id, name: f.name }))

  const { data: conv } = await admin
    .from('conversations')
    .select('lead_id')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  const leadId = (conv as { lead_id: string | null } | null)?.lead_id ?? null
  if (!leadId) return { lead: null, stages, funnels }

  const { data: leadRow } = await admin
    .from('leads')
    .select('id, name, phone, email, social_media, source, notes, crm_stage_id, tags, branch_id, client_id, lead_procedures(procedure_id)')
    .eq('id', leadId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (!leadRow) return { lead: null, stages, funnels }

  const l = leadRow as any
  const lead: InboxLead = {
    id:           l.id,
    name:         l.name,
    phone:        l.phone,
    email:        l.email,
    social_media: l.social_media,
    source:       l.source,
    notes:        l.notes,
    crm_stage_id: l.crm_stage_id,
    tags:         (l.tags ?? []) as string[],
    branch_id:    l.branch_id,
    client_id:    l.client_id,
    procedure_ids: ((l.lead_procedures ?? []) as { procedure_id: string }[]).map(p => p.procedure_id),
  }
  return { lead, stages, funnels }
}

/** Acha (ou cria) a conversa de um lead — usado pelo deep-link "card do funil -> inbox". */
export async function openLeadConversation(
  leadId: string,
): Promise<{ conversationId: string | null; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  const admin = createAdminClient()

  // Conversa existente para este lead (qualquer canal), mais recente primeiro
  const { data: existing, error: erroExisting } = await admin
    .from('conversations')
    .select('id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('lead_id', leadId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
  if (erroExisting) {
    console.error('[openLeadConversation] conversa existente:', erroExisting.message)
    return { conversationId: null, error: 'Não foi possível abrir a conversa deste lead.' }
  }
  if (existing && existing.length > 0) return { conversationId: existing[0]!.id }

  // Cria uma conversa a partir do lead (whatsapp se tem telefone; senão manual)
  const { data: leadRow, error: erroLead } = await admin
    .from('leads')
    .select('name, phone, branch_id')
    .eq('id', leadId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (erroLead) {
    console.error('[openLeadConversation] lead:', erroLead.message)
    return { conversationId: null, error: 'Não foi possível abrir a conversa deste lead.' }
  }
  if (!leadRow) return { conversationId: null, error: 'Lead não encontrado.' }

  const l = leadRow as { name: string; phone: string | null; branch_id: string | null }
  const contactPhone = l.phone ? l.phone.replace(/\D/g, '') : null
  const channel: InboxChannel = contactPhone ? 'whatsapp' : 'manual'

  // ⚠️ Aqui havia um `upsert` com `onConflict: 'tenant_id,channel,contact_phone'`.
  // O índice que garante essa unicidade é PARCIAL
  // (`uniq_conversations_tenant_channel_phone ... WHERE contact_phone IS NOT NULL`),
  // e o Postgres não usa índice parcial para inferir ON CONFLICT sem o mesmo
  // predicado — coisa que o PostgREST não tem como mandar. Resultado: todo lead
  // COM telefone caía em `42P10 — there is no unique or exclusion constraint
  // matching the ON CONFLICT specification`. Como o erro era descartado, a
  // action devolvia null e **o clique no card do funil da rede não fazia nada**.
  //
  // Insert direto + tratamento do 23505 faz o mesmo trabalho e é o padrão que
  // `lib/inbox/resolve-conversation.ts` já usa.
  const { data: created, error: erroInsert } = await admin
    .from('conversations')
    .insert({
      tenant_id:     ctx.tenantId!,
      branch_id:     l.branch_id,
      lead_id:       leadId,
      channel,
      status:        'open',
      contact_name:  l.name,
      contact_phone: contactPhone,
    })
    .select('id')
    .single()

  if (!erroInsert && created) return { conversationId: (created as { id: string }).id }

  // Já existe conversa para este telefone/canal, ligada a outro lead ou a
  // nenhum: é dela que a pessoa precisa.
  if (erroInsert?.code === '23505' && contactPhone) {
    const { data: doTelefone } = await admin
      .from('conversations')
      .select('id')
      .eq('tenant_id', ctx.tenantId!)
      .eq('channel', channel)
      .eq('contact_phone', contactPhone)
      .maybeSingle()
    if (doTelefone) return { conversationId: (doTelefone as { id: string }).id }
  }

  console.error('[openLeadConversation] criar conversa:', erroInsert?.message)
  return { conversationId: null, error: 'Não foi possível abrir a conversa deste lead.' }
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<{ ok: boolean; message?: Message; error?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
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

  revalidatePath('/admin/inbox')
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
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  await admin
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath('/admin/inbox')
}

export async function createConversationForLead(
  leadId:  string,
  channel: InboxChannel,
): Promise<{ conversationId?: string; error?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
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

  revalidatePath('/admin/inbox')
  return { conversationId: (conv as unknown as { id: string }).id }
}
