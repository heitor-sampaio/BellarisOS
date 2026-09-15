import { createAdminClient } from '@/lib/supabase/admin'
import type { InboundMsg, ChannelKind, SendProvider } from '@/lib/channels/types'
import { seedDefaultFunnel, listStages } from '@/actions/crm-funnels'
import { registrarEventoLead } from '@/lib/lead-events'
import { guardarMidia } from '@/lib/inbox/media'
import { resolveLeadSource } from '@estetica-os/utils'

interface ResolveResult {
  conversationId: string
  branchId:       string | null
}

/** Normaliza número para dígitos (Brasil/internacional). */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Resolve (ou cria) a conversa de um inbound e garante que exista um CARD (lead)
 * ligado a ela.
 *
 * Regras do CRM unificado:
 * - card = lead, conversa = operacional; ligados por `conversations.lead_id`
 * - lead/conversa nascem na REDE (`branch_id` null); a unidade é tag, depois
 * - a origem do card vem do referral do anúncio (click-to-WhatsApp) ou Orgânico
 *
 * ⚠️ A identidade da conversa é `contact_external_id`, não o telefone: no
 * Instagram e no Messenger o contato é um PSID/IGSID e telefone não existe.
 * Antes isto era `contact_phone`, o que travava o inbox em um canal só.
 *
 * Concorrência: o insert é a trava. Só quem vence cria o lead — senão duas
 * mensagens quase simultâneas geram dois cards para a mesma pessoa.
 */
export async function resolveConversation(
  tenantId: string,
  msg:      InboundMsg,
  channel:  ChannelKind,
): Promise<ResolveResult | null> {
  const admin = createAdminClient()
  const phone = msg.phone ? normalizePhone(msg.phone) : null

  // Todos os identificadores desta pessoa nesta mensagem. O WhatsApp alterna
  // entre telefone e @lid (e a Cloud API entre telefone e BSUID) na mesma
  // conversa: é por este conjunto que a pessoa é reencontrada.
  const aliases = Array.from(new Set([
    ...(msg.aliases ?? []),
    msg.externalUserId,
    ...(phone ? [phone] : []),
  ].filter(Boolean)))

  // 1. Conversa que já existe, por QUALQUER identificador conhecido.
  //
  // Casar só por `contact_external_id` fazia a mesma pessoa virar uma segunda
  // conversa assim que o WhatsApp trocava o identificador dela.
  const { data: existentes, error: erroExistente } = await admin
    .from('conversations')
    .select('id, branch_id, lead_id, contact_phone, contact_aliases, leads(name)')
    .eq('tenant_id', tenantId)
    .eq('channel', channel)
    .overlaps('contact_aliases', aliases)
    .limit(1)

  if (erroExistente) {
    console.error('[resolveConversation] buscar por alias:', erroExistente.message)
    return null
  }

  const jaExiste = existentes?.[0] as {
    id: string; branch_id: string | null; lead_id: string | null
    contact_phone: string | null; contact_aliases: string[] | null
    leads: { name: string } | null
  } | undefined

  if (jaExiste) {
    await completarIdentidade(admin, jaExiste, aliases, phone, msg.displayName ?? null)
    return { conversationId: jaExiste.id, branchId: jaExiste.branch_id }
  }

  // 2. Lead que já existe, mesmo sem conversa.
  //
  // Por telefone quando ele veio de verdade — cobre o card cadastrado à mão
  // antes da primeira mensagem. Com @lid puro não há o que cruzar: a conversa
  // anterior já foi procurada acima.
  let leadId: string | null = null
  let nomeDoLead: string | null = null

  if (phone) {
    const { data, error } = await admin
      .from('leads')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .or(`phone.eq.${phone},phone.eq.+${phone}`)
      .limit(1)
    if (error) console.error('[resolveConversation] buscar lead:', error.message)
    leadId     = data?.[0]?.id   ?? null
    nomeDoLead = data?.[0]?.name ?? null
  }

  const contactName = nomeDoLead
    ?? msg.displayName?.trim()
    ?? phone
    ?? msg.externalUserId

  // 3. Cria a conversa. Insert direto e o 23505 como trava de concorrência.
  //
  // O `upsert` com `onConflict` que existia aqui falhava com `42P10`: o índice
  // único era PARCIAL e o Postgres não o infere sem repetir o predicado, coisa
  // que o PostgREST não manda. Com o erro descartado, a PRIMEIRA mensagem de um
  // contato novo era jogada fora sem criar conversa nem card.
  const { data: inserted, error: erroInsert } = await admin
    .from('conversations')
    .insert({
      tenant_id:           tenantId,
      branch_id:           null,      // rede — a unidade vira tag depois
      lead_id:             leadId,
      channel,
      status:              'open',
      contact_name:        contactName,
      contact_phone:       phone,
      contact_external_id: msg.externalUserId,
      contact_aliases:     aliases,
    })
    .select('id')
    .single()

  if (erroInsert) {
    if (erroInsert.code !== '23505') {
      console.error('[resolveConversation] criar conversa:', erroInsert.message)
      return null
    }
    // Outra entrega criou primeiro — é dela que precisamos.
    const { data: convRows, error: erroBusca } = await admin
      .from('conversations')
      .select('id, branch_id, lead_id, contact_phone, contact_aliases')
      .eq('tenant_id', tenantId)
      .eq('channel', channel)
      .eq('contact_external_id', msg.externalUserId)
      .limit(1)
    if (erroBusca) {
      console.error('[resolveConversation] conversa existente:', erroBusca.message)
      return null
    }
    if (!convRows || convRows.length === 0) return null
    await completarIdentidade(admin, convRows[0]!, aliases, phone, msg.displayName ?? null)
    return { conversationId: convRows[0]!.id, branchId: convRows[0]!.branch_id }
  }

  // 4. Vencemos o insert — sem lead, cria o card agora (rede, sem filial).
  const conversationId = inserted!.id
  if (!leadId) {
    const derived = resolveLeadSource({ referral: msg.referral })
    // Lead que chega sozinho entra no funil PADRÃO da rede — o mesmo que
    // alimenta o gráfico do dashboard. Sem etapa ele não apareceria em quadro
    // nenhum, já que a coluna deixou de aceitar nulo.
    const funis   = await seedDefaultFunnel(tenantId)
    const padrao  = funis.find(f => f.is_default) ?? funis[0]
    const stages  = padrao ? await listStages(tenantId, padrao.id) : []
    const firstStageId = stages[0]?.id ?? null

    const leadInsert: Record<string, unknown> = {
      tenant_id:    tenantId,
      branch_id:    null,
      name:         msg.displayName?.trim() || phone || msg.externalUserId,
      phone,
      source:       derived.source,
      tags:         derived.tags,
      crm_stage_id: firstStageId,
    }
    // Sem telefone o lead precisa de outro contato para ser válido: o @ do
    // Instagram, ou o id do canal como último recurso.
    if (!phone) {
      leadInsert.social_media = msg.displayName
        ? `${channel}: ${msg.displayName}`
        : `${channel}: ${msg.externalUserId}`
    }
    if (derived.utm_source) leadInsert.utm_source = derived.utm_source
    if (derived.ctwa_clid)  leadInsert.ctwa_clid  = derived.ctwa_clid

    const { data: newLead, error: erroLead } = await admin
      .from('leads')
      .insert(leadInsert)
      .select('id, name')
      .single()

    if (erroLead) {
      // A conversa já existe e a mensagem ainda vai entrar; só o card faltou.
      console.error('[resolveConversation] criar lead:', erroLead.message)
    } else if (newLead) {
      leadId = newLead.id

      // Sem ator: o card nasceu sozinho, de uma mensagem recebida. A linha do
      // tempo mostra isso como entrada automática.
      await registrarEventoLead({
        tenantId,
        leadId:    newLead.id,
        type:      'CREATED',
        toStageId: firstStageId,
      })

      // Liga o card à conversa recém-criada (guard lead_id IS NULL)
      await admin
        .from('conversations')
        .update({ lead_id: leadId, contact_name: newLead.name })
        .eq('id', conversationId)
        .is('lead_id', null)
    }
  }

  return { conversationId, branchId: null }
}

/**
 * A conversa já existia — aprende o que esta mensagem trouxe de novo.
 *
 * É aqui que o ganho da reconciliação se materializa: o contato que sempre
 * chegou como @lid finalmente manda o telefone, e o card passa a ter um número
 * para o qual a clínica consegue ligar. Sem isto o alias serviria só para não
 * duplicar, e o dado novo seria jogado fora.
 *
 * Nunca SOBRESCREVE: telefone e nome que já existem foram possivelmente
 * corrigidos à mão por quem atende.
 */
async function completarIdentidade(
  admin:    ReturnType<typeof createAdminClient>,
  conversa: {
    id: string; lead_id: string | null
    contact_phone: string | null; contact_aliases: string[] | null
  },
  aliases:  string[],
  phone:    string | null,
  displayName: string | null,
) {
  const conhecidos = new Set(conversa.contact_aliases ?? [])
  const novos      = aliases.filter(a => !conhecidos.has(a))
  const ganhaFone  = !conversa.contact_phone && !!phone

  if (novos.length === 0 && !ganhaFone) return

  const patch: Record<string, unknown> = {}
  if (novos.length > 0) patch.contact_aliases = [...conhecidos, ...novos]
  if (ganhaFone)        patch.contact_phone   = phone

  const { error } = await admin.from('conversations').update(patch).eq('id', conversa.id)
  if (error) console.error('[completarIdentidade] conversa:', error.message)

  // O card também estava sem telefone: é o mesmo dado, do outro lado.
  if (ganhaFone && conversa.lead_id) {
    const { error: erroLead } = await admin
      .from('leads')
      .update({ phone })
      .eq('id', conversa.lead_id)
      .is('phone', null)
    if (erroLead) console.error('[completarIdentidade] lead:', erroLead.message)
  }

  void displayName   // nome do card é decisão de quem atende; não sobrescrevemos
}

export async function insertInboundMessage(
  conversationId: string,
  tenantId:       string,
  msg:            InboundMsg,
  channel:        ChannelKind,
  /** Necessário para baixar a mídia: cada provedor autentica do seu jeito. */
  provider?:      SendProvider,
) {
  const admin = createAdminClient()

  // Dedup por id do provedor: reentrega do webhook não duplica a mensagem.
  const { data: existing } = await admin
    .from('messages')
    .select('id')
    .eq('external_id', msg.externalId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (existing) return

  // A mídia desce ANTES do insert para a mensagem já nascer com o arquivo.
  // `guardarMidia` nunca lança: mídia que falha não pode barrar o texto.
  let mediaPath: string | null = null
  if (msg.media && provider) {
    const salvo = await guardarMidia(
      tenantId, conversationId, msg.externalId, msg.media, provider,
    )
    mediaPath = salvo?.path ?? null
  }

  const { error } = await admin.from('messages').insert({
    conversation_id: conversationId,
    tenant_id:       tenantId,
    direction:       'inbound',
    content:         msg.content,
    channel,
    status:          'delivered',
    external_id:     msg.externalId,
    is_read:         false,
    created_at:      msg.timestamp,
    media_type:      msg.media?.kind ?? null,
    media_path:      mediaPath,
  })

  // Sem isto, mensagem perdida no webhook não deixava rastro nenhum.
  if (error) console.error('[insertInboundMessage]', error.message)
}

export async function updateMessageStatus(
  tenantId:   string,
  externalId: string,
  status:     string,
) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('messages')
    .update({ status })
    .eq('external_id', externalId)
    .eq('tenant_id', tenantId)

  if (error) console.error('[updateMessageStatus]', error.message)
}
