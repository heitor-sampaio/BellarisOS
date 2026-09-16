'use server'

import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultFunnel, listAllStages } from '@/actions/crm-funnels'
import { revalidatePath } from 'next/cache'
import { resolverCanal } from '@/lib/channels/factory'
import { estadoDaJanela } from '@/lib/channels/window'
import {
  urlDaMidia, guardarUpload, classificarArquivo, validarArquivo,
} from '@/lib/inbox/media'
import type { ChannelKind } from '@/lib/channels/types'
import {
  extrairVariaveis, montarParametrosEnvio, textoDoEnvio,
} from '@/lib/templates/core'

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
  /** Provedor que atende a conversa — decide se a janela de 24h vale. */
  provider:        string | null
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
  media_type:      'image' | 'audio' | 'video' | 'document' | null
  /** Link assinado, válido por uma hora. O bucket é privado. */
  media_url:       string | null
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
    .select('id, lead_id, client_id, channel, status, unread_count, last_message_at, last_message, contact_name, contact_phone, provider, branch_id, created_at, last_message_direction, last_inbound_at, awaiting_since, first_response_seconds, branches(name)')
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
    .select('id, conversation_id, direction, content, channel, status, sent_by_name, is_read, created_at, media_type, media_path')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: true })
    .limit(500)

  // O bucket é privado: a foto de uma cliente não pode ficar acessível por
  // URL adivinhável. Cada mídia vira um link assinado na leitura.
  return Promise.all((data ?? []).map(async (m: any) => ({
    ...m,
    media_url: m.media_path ? await urlDaMidia(m.media_path) : null,
  }))) as Promise<Message[]>
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
      // Identidade da conversa no canal. Sem isto a conversa nasce fora do
      // índice único e o webhook criaria uma segunda para o mesmo contato.
      contact_external_id: contactPhone ?? `lead:${leadId}`,
      // O webhook reconcilia por aqui. Quando esta pessoa escrever pelo
      // WhatsApp — possivelmente identificada por @lid —, é o telefone nesta
      // lista que liga a mensagem a esta conversa em vez de abrir outra.
      contact_aliases: contactPhone ? [contactPhone] : [`lead:${leadId}`],
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
    .select('id, channel, tenant_id, status, contact_phone, contact_external_id, last_inbound_at')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  if (!conv) return { ok: false, error: 'Conversa não encontrada' }
  if (conv.status === 'closed') return { ok: false, error: 'Conversa encerrada' }

  const channel = conv.channel as ChannelKind

  // Como se envia neste canal? Um lugar só decide — antes havia um `if` com
  // forma de WhatsApp e um `else` que marcava a mensagem como "enviada" sem
  // enviar nada: responder um Instagram dava "enviado" e o cliente nunca
  // recebia.
  const canal = await resolverCanal(ctx.tenantId!, channel)

  if (!canal && channel !== 'manual') {
    return {
      ok: false,
      error: `Canal ${channel} não está conectado. Configure em Configurações → Integrações.`,
    }
  }

  // Janela de 24h da Meta. Fora dela a API recusa, então barrar aqui evita a
  // pessoa escrever e a mensagem sumir.
  const janela = estadoDaJanela(channel, conv.last_inbound_at as string | null, canal?.nome)
  if (!janela.aberta) return { ok: false, error: janela.motivo ?? 'Janela de resposta fechada.' }

  // Quem está respondendo.
  //
  // ⚠️ `ctx.userId` é o id do AUTH, e `messages.sent_by_id` referencia
  // `users(id)` — o id do membro. Usar um no lugar do outro fazia o insert
  // quebrar na foreign key e NENHUMA resposta era gravada: a bolha aparecia na
  // tela, o erro era descartado e a mensagem não existia.
  const { data: profile, error: erroPerfil } = await admin
    .from('users')
    .select('id, name')
    .eq('auth_id', ctx.userId)
    .maybeSingle()
  if (erroPerfil) console.error('[sendMessage] perfil:', erroPerfil.message)

  const senderId   = profile?.id   ?? ctx.internalUserId ?? null
  const senderName = profile?.name ?? null

  const { data: msg, error } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      tenant_id:       ctx.tenantId!,
      direction:       'outbound',
      content:         content.trim(),
      channel:         conv.channel,
      status:          'sending',
      sent_by_id:      senderId,
      sent_by_name:    senderName,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  const msgTyped = msg as unknown as { id: string; status: string }

  if (!canal) {
    // `manual`: nota interna, não tem para onde enviar. Fica registrada.
    await admin.from('messages').update({ status: 'sent' }).eq('id', msgTyped.id)
    msgTyped.status = 'sent'
    revalidarInbox()
    return { ok: true, message: msg as unknown as Message }
  }

  // O destinatário é o id do contato NO CANAL: telefone no WhatsApp, PSID ou
  // IGSID nos canais da Meta.
  // Telefone primeiro quando existe: a chave da conversa pode ser um @lid, que
  // funciona, mas o número é o identificador estável dos dois lados. Em
  // Instagram e Messenger não há telefone e cai no id do canal, como sempre.
  const destino = (conv.contact_phone as string | null) ?? (conv.contact_external_id as string | null)
  if (!destino) {
    await admin.from('messages').update({ status: 'failed' }).eq('id', msgTyped.id)
    return { ok: false, error: 'Esta conversa não tem um destinatário identificado.' }
  }

  try {
    const { externalId } = await canal.provider.send(destino, content.trim())
    await admin
      .from('messages')
      .update({ status: 'sent', external_id: externalId, provider: canal.nome })
      .eq('id', msgTyped.id)
    msgTyped.status = 'sent'
  } catch (sendErr) {
    // A falha fica visível na conversa em vez de virar um "enviado" mentiroso.
    console.error('[sendMessage]', sendErr)
    await admin.from('messages').update({ status: 'failed' }).eq('id', msgTyped.id)
    msgTyped.status = 'failed'
    return { ok: false, error: mensagemDeFalha(sendErr) }
  }

  revalidarInbox()
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

  revalidarInbox()
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

  // Mesmo cuidado de `openLeadConversation`: sem `contact_external_id` a
  // conversa nasce com a chave nula, fora do índice único, e a primeira
  // mensagem que chegar pelo webhook abre uma segunda conversa do mesmo
  // contato. Os aliases são o que faz o webhook reencontrar esta aqui.
  const telefone = lead.phone ? String(lead.phone).replace(/\D/g, '') : null
  const externalId = telefone ?? `lead:${leadId}`

  const { data: conv, error } = await admin
    .from('conversations')
    .insert({
      tenant_id:     ctx.tenantId!,
      branch_id:     lead.branch_id,
      lead_id:       leadId,
      channel,
      status:        'open',
      contact_name:  lead.name,
      contact_phone: telefone,
      contact_external_id: externalId,
      contact_aliases:     [externalId],
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidarInbox()
  return { conversationId: (conv as unknown as { id: string }).id }
}

/**
 * Erro do provedor traduzido para quem atende.
 *
 * O texto cru da Graph API ('OAuthException', 'fbtrace_id'…) não diz nada para
 * a recepção e ainda expõe interno. O detalhe fica no log do servidor.
 */
function mensagemDeFalha(err: unknown): string {
  const texto = err instanceof Error ? err.message : String(err)

  if (/OAuth|access token|190/i.test(texto)) {
    return 'A conexão com o canal expirou. Reconecte em Configurações → Integrações.'
  }
  if (/outside.*window|24|messaging_type|10/i.test(texto)) {
    return 'A janela de resposta fechou. O contato precisa escrever de novo.'
  }
  if (/rate limit|too many/i.test(texto)) {
    return 'Muitas mensagens em pouco tempo. Tente de novo em instantes.'
  }
  return 'Não foi possível enviar a mensagem. Tente de novo; se persistir, confira a integração do canal.'
}

/**
 * O inbox existe nos dois portais. Revalidar só '/admin/inbox' deixava a
 * unidade com a lista de conversas velha depois de responder.
 */
function revalidarInbox() {
  revalidatePath('/admin/inbox')
  revalidatePath('/[slug]/inbox', 'page')
}

// --- Templates na conversa ---------------------------------------------------

export interface TemplateDaConversa {
  id:          string
  name:        string
  category:    string
  language:    string
  header_text: string | null
  body_text:   string
  footer_text: string | null
  /** Nomes das variáveis, na ordem em que aparecem. */
  variaveis:   string[]
  /** Valores que dá para adivinhar do card — o resto é digitado na hora. */
  sugestoes:   Record<string, string>
}

/**
 * Templates que dá para usar NESTA conversa.
 *
 * Só os aprovados: a Meta recusa qualquer outro status, e oferecer um template
 * em análise na tela só produziria erro na hora de enviar.
 */
export async function getTemplatesParaConversa(
  conversationId: string,
): Promise<TemplateDaConversa[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const { data: conv, error: erroConv } = await admin
    .from('conversations')
    .select('channel, contact_name, leads(name)')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroConv) { console.error('[getTemplatesParaConversa]', erroConv.message); return [] }
  if (!conv || (conv as { channel: string }).channel !== 'whatsapp') return []

  // Template é da API oficial. Com a uazapi não há janela para contornar.
  const canal = await resolverCanal(ctx.tenantId!, 'whatsapp')
  if (!canal || canal.nome !== 'official') return []

  const { data, error } = await admin
    .from('message_templates')
    .select('id, name, category, language, header_text, body_text, footer_text')
    .eq('tenant_id', ctx.tenantId!)
    .eq('status', 'APPROVED')
    .order('name')

  if (error) { console.error('[getTemplatesParaConversa]', error.message); return [] }

  const convRow = conv as {
    contact_name: string | null
    leads: { name: string } | { name: string }[] | null
  }
  const lead = Array.isArray(convRow.leads) ? convRow.leads[0] : convRow.leads
  const nome = lead?.name ?? convRow.contact_name ?? ''
  // Só o primeiro nome: "Olá, Ana Paula Ribeiro da Silva" soa a mala direta.
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? ''

  return (data ?? []).map(t => {
    const row = t as unknown as {
      id: string; name: string; category: string; language: string
      header_text: string | null; body_text: string; footer_text: string | null
    }
    const variaveis = extrairVariaveis(row.header_text, row.body_text)
    const sugestoes: Record<string, string> = {}
    for (const v of variaveis) {
      if (primeiroNome && (v === 'nome' || v === 'nome_cliente' || v === 'cliente')) {
        sugestoes[v] = primeiroNome
      }
    }
    return { ...row, variaveis, sugestoes }
  })
}

/**
 * Envia um template — o caminho para retomar conversa fora da janela de 24h.
 *
 * Não passa pela checagem de janela de propósito: é exatamente ela que este
 * envio existe para contornar. O que continua valendo é o template estar
 * APROVADO, porque isso quem decide é a Meta.
 */
export async function sendTemplateMessage(
  conversationId: string,
  templateId:     string,
  valores:        Record<string, string>,
): Promise<{ ok: boolean; message?: Message; error?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const { data: conv, error: erroConv } = await admin
    .from('conversations')
    .select('id, channel, status, contact_phone, contact_external_id')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroConv) return { ok: false, error: erroConv.message }
  if (!conv)    return { ok: false, error: 'Conversa não encontrada' }
  if ((conv as { status: string }).status === 'closed') {
    return { ok: false, error: 'Conversa encerrada' }
  }

  const { data: tpl, error: erroTpl } = await admin
    .from('message_templates')
    .select('id, name, language, status, header_text, body_text, footer_text')
    .eq('id', templateId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroTpl) return { ok: false, error: erroTpl.message }
  if (!tpl)    return { ok: false, error: 'Template não encontrado.' }

  const t = tpl as unknown as {
    id: string; name: string; language: string; status: string
    header_text: string | null; body_text: string; footer_text: string | null
  }
  if (t.status !== 'APPROVED') {
    return { ok: false, error: 'Este template ainda não foi aprovado pela Meta.' }
  }

  // Variável em branco vira um buraco visível na mensagem do cliente
  // ("Olá, , seu horário"). Melhor barrar aqui.
  const faltando = extrairVariaveis(t.header_text, t.body_text)
    .filter(v => !valores[v]?.trim())
  if (faltando.length > 0) {
    return { ok: false, error: `Preencha: ${faltando.map(v => `{{${v}}}`).join(', ')}` }
  }

  const canal = await resolverCanal(ctx.tenantId!, 'whatsapp')
  if (!canal?.provider.sendTemplate) {
    return { ok: false, error: 'Templates exigem o WhatsApp Oficial conectado.' }
  }

  const destino = (conv as { contact_phone: string | null }).contact_phone
    ?? (conv as { contact_external_id: string | null }).contact_external_id
  if (!destino) return { ok: false, error: 'Esta conversa não tem um destinatário identificado.' }

  const perfil = await admin
    .from('users').select('id, name').eq('auth_id', ctx.userId).maybeSingle()
  const membro = perfil.data as { id: string; name: string } | null

  // O histórico guarda o texto JÁ preenchido: é o que o cliente leu. O vínculo
  // com o template fica em `template_id`, para auditar o que foi disparado.
  const { data: msgRow, error: erroInsert } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      tenant_id:       ctx.tenantId!,
      direction:       'outbound',
      content:         textoDoEnvio(t, valores),
      channel:         'whatsapp',
      status:          'sending',
      sent_by_id:      membro?.id ?? null,
      sent_by_name:    membro?.name ?? null,
      template_id:     t.id,
    })
    .select()
    .single()

  if (erroInsert) return { ok: false, error: erroInsert.message }
  const criada = msgRow as unknown as { id: string; status: string }

  try {
    const { externalId } = await canal.provider.sendTemplate(destino, {
      name:       t.name,
      language:   t.language,
      components: montarParametrosEnvio(t, valores),
    })
    await admin
      .from('messages')
      .update({ status: 'sent', external_id: externalId, provider: canal.nome })
      .eq('id', criada.id)
    criada.status = 'sent'
  } catch (sendErr) {
    console.error('[sendTemplateMessage]', sendErr)
    await admin.from('messages').update({ status: 'failed' }).eq('id', criada.id)
    criada.status = 'failed'
    return { ok: false, error: mensagemDeFalha(sendErr) }
  }

  revalidarInbox()
  return { ok: true, message: msgRow as unknown as Message }
}

// --- Envio de arquivo --------------------------------------------------------

/**
 * Manda um arquivo na conversa.
 *
 * Recebe `FormData` porque é a única forma de um arquivo atravessar uma Server
 * Action sem virar base64 — o que inflaria um vídeo de 16MB em um terço.
 *
 * A ordem é deliberada: o arquivo sobe para o NOSSO bucket antes de ir para o
 * provedor. Assim o histórico tem o anexo mesmo quando o envio falha, e a
 * pessoa pode tentar de novo sem reanexar.
 */
export async function sendMediaMessage(
  form: FormData,
): Promise<{ ok: boolean; message?: Message; error?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const conversationId = form.get('conversationId')
  const arquivo        = form.get('file')
  const caption        = (form.get('caption') as string | null)?.trim() || ''

  if (typeof conversationId !== 'string' || !(arquivo instanceof File)) {
    return { ok: false, error: 'Requisição inválida.' }
  }

  const { data: conv, error: erroConv } = await admin
    .from('conversations')
    .select('id, channel, status, contact_phone, contact_external_id, last_inbound_at')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroConv) return { ok: false, error: erroConv.message }
  if (!conv)    return { ok: false, error: 'Conversa não encontrada' }
  if ((conv as { status: string }).status === 'closed') {
    return { ok: false, error: 'Conversa encerrada' }
  }

  const channel  = (conv as { channel: string }).channel as ChannelKind
  const mimeType = arquivo.type || 'application/octet-stream'
  const kind     = classificarArquivo(mimeType)

  const problema = validarArquivo(kind, mimeType, arquivo.size)
  if (problema) return { ok: false, error: problema }

  const canal = await resolverCanal(ctx.tenantId!, channel)
  if (!canal && channel !== 'manual') {
    return { ok: false, error: `Canal ${channel} não está conectado. Configure em Configurações → Integrações.` }
  }
  if (canal && !canal.provider.sendMedia) {
    return { ok: false, error: 'Este canal não aceita anexo pela integração atual.' }
  }

  // Anexo obedece à janela de 24h igual a texto — a Meta não abre exceção.
  const janela = estadoDaJanela(channel, (conv as { last_inbound_at: string | null }).last_inbound_at, canal?.nome)
  if (!janela.aberta) return { ok: false, error: janela.motivo ?? 'Janela de resposta fechada.' }

  const perfil = await admin
    .from('users').select('id, name').eq('auth_id', ctx.userId).maybeSingle()
  const membro = perfil.data as { id: string; name: string } | null

  let guardado: { path: string; url: string }
  try {
    guardado = await guardarUpload(
      ctx.tenantId!,
      conversationId,
      await arquivo.arrayBuffer(),
      mimeType,
      arquivo.name || `arquivo.${kind}`,
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao guardar o arquivo.' }
  }

  const { data: msgRow, error: erroInsert } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      tenant_id:       ctx.tenantId!,
      direction:       'outbound',
      // Sem legenda, o nome do arquivo é o que a lista de conversas mostra —
      // melhor que uma prévia em branco.
      content:         caption || arquivo.name || `[${kind}]`,
      channel,
      status:          'sending',
      sent_by_id:      membro?.id ?? null,
      sent_by_name:    membro?.name ?? null,
      media_type:      kind,
      media_path:      guardado.path,
    })
    .select()
    .single()

  if (erroInsert) return { ok: false, error: erroInsert.message }
  const criada = msgRow as unknown as { id: string; status: string }

  if (!canal) {
    // `manual`: nota interna com anexo. Fica registrada e pronto.
    await admin.from('messages').update({ status: 'sent' }).eq('id', criada.id)
    criada.status = 'sent'
    revalidarInbox()
    return { ok: true, message: await comUrl(msgRow as unknown as Message, guardado.path) }
  }

  const destino = (conv as { contact_phone: string | null }).contact_phone
    ?? (conv as { contact_external_id: string | null }).contact_external_id
  if (!destino) {
    return falhaComAnexo(admin, criada.id, msgRow as unknown as Message, guardado.path,
      'Esta conversa não tem um destinatário identificado.')
  }

  try {
    const { externalId } = await canal.provider.sendMedia!(destino, {
      kind,
      bytes:    await arquivo.arrayBuffer(),
      url:      guardado.url,
      mimeType,
      filename: arquivo.name || `arquivo.${kind}`,
      caption:  caption || undefined,
    })
    await admin
      .from('messages')
      .update({ status: 'sent', external_id: externalId, provider: canal.nome })
      .eq('id', criada.id)
    criada.status = 'sent'
  } catch (sendErr) {
    console.error('[sendMediaMessage]', sendErr)
    return falhaComAnexo(admin, criada.id, msgRow as unknown as Message, guardado.path,
      mensagemDeFalha(sendErr))
  }

  revalidarInbox()
  return { ok: true, message: await comUrl(msgRow as unknown as Message, guardado.path) }
}

/**
 * Falha depois do arquivo já estar guardado.
 *
 * Devolve a mensagem junto do erro para a bolha aparecer marcada como "Não
 * enviada". Devolver só o erro fazia o anexo sumir da tela enquanto seguia
 * existindo no banco — a pessoa via a falha e achava que nada tinha acontecido.
 */
async function falhaComAnexo(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
  msg: Message,
  path: string,
  error: string,
): Promise<{ ok: false; message: Message; error: string }> {
  await admin.from('messages').update({ status: 'failed' }).eq('id', messageId)
  return { ok: false, error, message: { ...(await comUrl(msg, path)), status: 'failed' } }
}

/** A bolha precisa do link assinado; o banco só guarda o caminho. */
async function comUrl(msg: Message, path: string): Promise<Message> {
  return { ...msg, media_url: await urlDaMidia(path) }
}
