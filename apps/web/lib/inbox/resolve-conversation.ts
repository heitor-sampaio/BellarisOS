import { createAdminClient } from '@/lib/supabase/admin'
import type { InboundMsg, ChannelKind, SendProvider } from '@/lib/channels/types'
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
 * Resolve (ou cria) a conversa de um inbound.
 *
 * A conversa É o contato: guarda nome, telefone, os identificadores do canal,
 * as tags da pessoa e de onde ela veio. **Não cria oportunidade** — isso é
 * decisão de quem atende, ou de automação, e um dia foi feito aqui.
 *
 * Regras:
 * - contato nasce na REDE (`branch_id` null); a unidade vira tag depois
 * - a origem vem do referral do anúncio (click-to-WhatsApp) ou Orgânico, e fica
 *   em `attribution` esperando a oportunidade que talvez venha
 *
 * ⚠️ A identidade da conversa é `contact_external_id`, não o telefone: no
 * Instagram e no Messenger o contato é um PSID/IGSID e telefone não existe.
 * Antes isto era `contact_phone`, o que travava o inbox em um canal só.
 *
 * Concorrência: o insert é a trava (23505), senão duas mensagens quase
 * simultâneas geram dois contatos para a mesma pessoa.
 */
export async function resolveConversation(
  tenantId: string,
  msg:      InboundMsg,
  channel:  ChannelKind,
  /** Só para perguntar o nome do contato quando o webhook não o trouxer. */
  provider?: SendProvider,
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
    // ⚠️ Sem embed de `leads` aqui. Desde que `leads.conversation_id` existe, há
    // DUAS relações entre as tabelas e o PostgREST recusa o embed por
    // ambiguidade — e este erro é descartado logo abaixo, o que jogaria fora a
    // mensagem que acabou de chegar. O nome do lead já vem do passo 2.
    .select('id, branch_id, lead_id, contact_name, contact_phone, contact_aliases')
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
    contact_name: string | null
    contact_phone: string | null; contact_aliases: string[] | null
  } | undefined

  if (jaExiste) {
    await completarIdentidade(admin, jaExiste, aliases, phone, msg.displayName ?? null, provider)
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

  // O nome do contato é fixado AQUI, e é a primeira mensagem que decide. Como
  // nela o chat muitas vezes ainda está nascendo do lado do provedor, o campo
  // chega vazio e a conversa ficaria com o telefone como nome para sempre —
  // então, faltando nome, perguntamos. Uma chamada por contato novo.
  let nomeDoCanal = msg.displayName?.trim() || null
  if (!nomeDoCanal && !nomeDoLead && provider?.fetchDisplayName) {
    nomeDoCanal = await provider.fetchDisplayName(msg.externalUserId)
  }

  const contactName = nomeDoLead
    ?? nomeDoCanal
    ?? phone
    ?? msg.externalUserId

  // Origem e identificadores de anúncio, do referral click-to-WhatsApp quando
  // houver. Só o que veio: campo vazio no jsonb é pior que campo ausente, porque
  // parece resposta quando é falta de resposta.
  const derived = resolveLeadSource({ referral: msg.referral })
  const atribuicao: Record<string, unknown> = { source: derived.source }
  if (derived.utm_source) atribuicao.utm_source = derived.utm_source
  if (derived.ctwa_clid)  atribuicao.ctwa_clid  = derived.ctwa_clid
  if (msg.referral?.sourceId) atribuicao.ad_id = msg.referral.sourceId

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
      // De onde a pessoa veio, guardado no CONTATO. Antes isto ia para o lead
      // que nascia junto; sem ele, o rastro do anúncio se perderia entre a
      // mensagem e a oportunidade criada depois — e é esse rastro que liga a
      // venda à campanha em `lib/metrics`.
      attribution:         atribuicao,
      tags:                derived.tags ?? [],
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

  // 4. Fim. A conversa nasce SEM oportunidade.
  //
  // Antes daqui saía um lead no funil padrão, para toda pessoa que mandasse a
  // primeira mensagem — quem pergunta "abrem sábado?" virava negócio em
  // andamento e o quadro enchia de card que ninguém abriu. Criar oportunidade é
  // decisão de quem atende (ou, mais tarde, de uma automação), não efeito
  // colateral de receber mensagem.
  return { conversationId: inserted!.id, branchId: null }
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
    contact_name?: string | null
    contact_phone: string | null; contact_aliases: string[] | null
  },
  aliases:  string[],
  phone:    string | null,
  displayName: string | null,
  provider?: SendProvider,
) {
  const conhecidos = new Set(conversa.contact_aliases ?? [])
  const novos      = aliases.filter(a => !conhecidos.has(a))
  const ganhaFone  = !conversa.contact_phone && !!phone

  // Nome ainda provisório: ninguém batizou este contato, ele só herdou o
  // próprio identificador quando a conversa nasceu. Trocar por um nome de
  // verdade é ganho puro; trocar um nome escrito por quem atende, não.
  const nomeProvisorio = ehIdentificador(conversa.contact_name, aliases)
  let nomeNovo: string | null = null
  if (nomeProvisorio) {
    nomeNovo = displayName?.trim() || null
    // O webhook não trouxe nome — pergunta ao provedor. Só acontece enquanto o
    // contato não tem nome, então não vira uma chamada por mensagem.
    if (!nomeNovo && provider?.fetchDisplayName) {
      // Telefone na frente: é o que o provedor resolve melhor. O @lid serve de
      // último recurso, e é o provider que sabe o que fazer com ele.
      const alvo = conversa.contact_phone ?? phone ?? aliases[0] ?? ''
      if (alvo) nomeNovo = await provider.fetchDisplayName(alvo)
    }
    if (nomeNovo === conversa.contact_name) nomeNovo = null
  }

  if (novos.length === 0 && !ganhaFone && !nomeNovo) return

  const patch: Record<string, unknown> = {}
  if (novos.length > 0) patch.contact_aliases = [...conhecidos, ...novos]
  if (ganhaFone)        patch.contact_phone   = phone
  if (nomeNovo)         patch.contact_name    = nomeNovo

  const { error } = await admin.from('conversations').update(patch).eq('id', conversa.id)
  if (error) console.error('[completarIdentidade] conversa:', error.message)

  if (!conversa.lead_id) return

  // O card é o mesmo contato visto do outro lado: recebe o telefone que faltava
  // e o nome, este último só enquanto ele também for provisório.
  const patchLead: Record<string, unknown> = {}
  if (ganhaFone) patchLead.phone = phone
  if (nomeNovo) {
    const { data: lead } = await admin
      .from('leads').select('name').eq('id', conversa.lead_id).maybeSingle()
    if (ehIdentificador(lead?.name as string | null, aliases)) patchLead.name = nomeNovo
  }
  if (Object.keys(patchLead).length === 0) return

  const { error: erroLead } = await admin
    .from('leads').update(patchLead).eq('id', conversa.lead_id)
  if (erroLead) console.error('[completarIdentidade] lead:', erroLead.message)
}

/**
 * Este "nome" é só o identificador do contato repetido?
 *
 * Conversa que nasce sem nome guarda o telefone (ou o @lid, ou o PSID) no campo
 * de nome, porque a lista precisa mostrar alguma coisa. Isso não é um nome: é um
 * lugar vago esperando ser preenchido, e distinguir os dois é o que permite
 * aceitar o nome do WhatsApp sem passar por cima do que a clínica escreveu.
 */
function ehIdentificador(nome: string | null | undefined, aliases: string[]): boolean {
  const n = (nome ?? '').trim()
  if (!n) return true
  if (aliases.includes(n)) return true
  // Compara também sem máscara: o telefone pode ter sido gravado formatado.
  const digitos = n.replace(/\D/g, '')
  return digitos.length > 0 && digitos === n.replace(/[\s+()-]/g, '')
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
    reply_to_external_id: msg.replyToExternalId ?? null,
  })

  // Sem isto, mensagem perdida no webhook não deixava rastro nenhum.
  if (error) console.error('[insertInboundMessage]', error.message)
}

/**
 * O contato editou o texto de uma mensagem que já está aqui.
 *
 * Atualiza em vez de inserir: a edição chega com id novo e, tratada como
 * mensagem comum, viraria uma segunda bolha repetindo a fala corrigida.
 * Silencioso quando não encontra nada — a editada pode ser anterior à
 * integração, e não há o que corrigir.
 */
export async function applyMessageEdit(
  tenantId:   string,
  externalId: string,
  texto:      string,
) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('messages')
    .update({ content: texto, edited_at: new Date().toISOString() })
    .eq('external_id', externalId)
    .eq('tenant_id', tenantId)

  if (error) console.error('[applyMessageEdit]', error.message)
}

/**
 * Status só avança: sending → sent → delivered → read.
 *
 * Os recibos chegam fora de ordem — um "entregue" atrasado depois do "lido"
 * acontece o tempo todo — e sem esta trava a mensagem lida voltaria para um
 * tique sozinha, na frente de quem está atendendo.
 */
const ANTERIORES: Record<'delivered' | 'read', string[]> = {
  delivered: ['sending', 'sent'],
  read:      ['sending', 'sent', 'delivered'],
}

/**
 * Aplica um recibo por marca d'água (Messenger e Instagram).
 *
 * Lá o recibo normalmente não nomeia a mensagem: diz "tudo até este instante
 * foi entregue". Quando vem com id, o id manda; quando não, vale o corte por
 * horário — mas sempre só para o que saiu DESTA conversa, e nunca para trás.
 */
export async function applyStatusRecibo(
  tenantId:       string,
  conversationId: string,
  recibo:         { status: 'delivered' | 'read'; externalIds?: string[]; watermark?: string },
) {
  const admin = createAdminClient()

  let query = admin
    .from('messages')
    .update({ status: recibo.status })
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .in('status', ANTERIORES[recibo.status])

  if (recibo.externalIds?.length) {
    query = query.in('external_id', recibo.externalIds)
  } else if (recibo.watermark) {
    query = query.lte('created_at', recibo.watermark)
  } else {
    return   // sem id e sem marca não há como saber a quais mensagens se aplica
  }

  const { error } = await query
  if (error) console.error('[applyStatusRecibo]', error.message)
}

/**
 * Conversa deste contato, sem criar nada.
 *
 * Um recibo de leitura não pode abrir conversa: seria um card no funil nascido
 * de uma confirmação de entrega, sem ninguém ter falado.
 */
export async function acharConversaDoContato(
  tenantId: string, channel: ChannelKind, externalUserId: string,
): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', channel)
    .overlaps('contact_aliases', [externalUserId])
    .limit(1)

  if (error) { console.error('[acharConversaDoContato]', error.message); return null }
  return (data?.[0]?.id as string) ?? null
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
