'use server'

import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { nomesDeAnuncios } from '@/lib/ads/ad-lookup'
import { emitirEventoDeConversa } from '@/lib/events/conversa'
import { emitirEventoDeLead, eventoDoDesfecho } from '@/lib/events/lead'
import { EVENTOS } from '@estetica-os/types'
import { seedDefaultFunnel, listAllStages } from '@/actions/crm-funnels'
import { revalidatePath } from 'next/cache'
import { resolverCanal } from '@/lib/channels/factory'
import { estadoDaJanela } from '@/lib/channels/window'
import { enviarNaConversa } from '@/lib/inbox/enviar'
import {
  urlDaMidia, guardarUpload, classificarArquivo, validarArquivo,
} from '@/lib/inbox/media'
import type { ChannelKind } from '@/lib/channels/types'
import { registrarEventoLead } from '@/lib/lead-events'
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
  /** Tags do CONTATO. Ficam na conversa: descrevem a pessoa, não o negócio. */
  lead_tags:    string[]
  /** Tem ficha de cliente? O comercial precisa saber antes de responder. */
  eh_cliente:   boolean
  /**
   * A conversa nasceu de um clique em anúncio.
   *
   * Fica na LISTA, e não só na bolha, porque muda a fila de atendimento: lead
   * de campanha paga esfria em minutos, e quem está escolhendo a próxima
   * conversa precisa ver isso antes de abrir.
   */
  veio_de_anuncio: boolean
  // -- Das oportunidades DESTE contato, agregadas.
  //
  // Listas, e não valores únicos: a mesma pessoa pode ter negócio aberto em dois
  // funis, e filtrar por "etapa Proposta" tem que encontrá-la se QUALQUER
  // oportunidade dela estiver lá.
  owner_ids:    string[]
  owner_names:  string[]
  stage_ids:    string[]
  stage_names:  string[]
  funnel_ids:   string[]
  funnel_names: string[]
  /** Quantas em andamento. Zero = conversa sem negócio, que é o normal. */
  abertas:      number
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
  /**
   * Caminho no bucket. É coluna de verdade — `media_url` é que é derivada dela.
   * Opcional porque a bolha otimista não tem arquivo nenhum ainda.
   */
  media_path?:     string | null
  /** Id da mensagem no provedor. É por ele que se cita e se edita. */
  external_id?:    string | null
  /** `external_id` da mensagem citada, quando esta é uma resposta. */
  reply_to_external_id?: string | null
  /** Preenchido na leitura: o suficiente para desenhar a citação. */
  reply_preview?:  ReplyPreview | null
  /** Quando o texto foi editado. Null/ausente = nunca. */
  edited_at?:      string | null
  /** Anúncio de origem, quando a mensagem veio de um clique em anúncio. */
  anuncio?:        AnuncioDaMensagem | null
}

/**
 * Anúncio que trouxe a mensagem (click-to-WhatsApp).
 *
 * Título, texto e id vêm do próprio aviso do WhatsApp e existem sempre.
 * Campanha e conjunto só aparecem com a integração Meta Ads conectada — o
 * aviso não os traz, e quem sabe é a API de Anúncios.
 */
export interface AnuncioDaMensagem {
  adId:          string | null
  headline:      string | null
  body:          string | null
  sourceUrl:     string | null
  /** 'facebook' | 'instagram', inferida pelo link do anúncio. */
  plataforma:    string | null
  adName:        string | null
  adsetName:     string | null
  campaignName:  string | null
}

/** Resumo da mensagem citada — só o que a citação precisa mostrar. */
export interface ReplyPreview {
  content:    string
  direction:  'inbound' | 'outbound'
  media_type: 'image' | 'audio' | 'video' | 'document' | null
  /** Null quando a citada não está mais no banco (apagada ou antiga demais). */
  id:         string | null
}

export async function getConversations(
  /**
   * Conversa que deve entrar na lista mesmo sem mensagem nenhuma.
   *
   * É o caso do deep-link vindo de um card do funil: a pessoa clicou em "ver
   * conversa", a conversa existe e foi aberta de propósito, mas ninguém falou
   * ainda. Sem esta exceção ela some da lista e o inbox abre parecendo vazio —
   * com a conversa pedida em lugar nenhum.
   */
  incluirId?: string | null,
): Promise<Conversation[]> {
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
    .select('id, lead_id, client_id, channel, status, unread_count, last_message_at, last_message, contact_name, contact_phone, provider, branch_id, created_at, last_message_direction, last_inbound_at, awaiting_since, first_response_seconds, tags, attribution, branches(name)')
    .eq('tenant_id', ctx.tenantId!)
  // Contato sem nenhuma mensagem não é conversa. A conversa é também o registro
  // do contato, e contato criado pelo quadro (ou pelo backfill que deu dono às
  // oportunidades antigas) nasce sem ninguém ter falado — na lista do inbox
  // isso seria só ruído entre os atendimentos de verdade.
  //
  // A exceção é a conversa pedida pelo deep-link, que entra mesmo calada.
  query = incluirId
    ? query.or(`last_message_at.not.is.null,id.eq.${incluirId}`)
    : query.not('last_message_at', 'is', null)

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

  return anexarDadosDoCard((data ?? []) as any[], ctx.tenantId!)
}


/**
 * Junta a cada contato o que vem das oportunidades dele: dono, etapa e funil.
 *
 * Agrega em LISTAS porque um contato pode ter negócio aberto em dois funis ao
 * mesmo tempo. Filtrar por "etapa Proposta" tem que encontrar a pessoa se
 * qualquer oportunidade dela estiver lá — com um valor único, a segunda
 * oportunidade seria invisível para os filtros.
 *
 * Em consultas separadas, e não em embed aninhado do PostgREST
 * (`leads(...crm_stages(...crm_funnels))`): a cada nível o embed exige que o
 * relacionamento seja inferido sem ambiguidade, e quando ele falha o retorno vem
 * sem o campo em vez de estourar — o filtro não acharia nada, em silêncio.
 */
async function anexarDadosDoCard(conversas: any[], tenantId: string): Promise<Conversation[]> {
  const base = (c: any): Conversation => ({
    ...c,
    branch_name: c.branches?.name ?? null,
    lead_tags:   (c.tags as string[]) ?? [],
    eh_cliente:  !!c.client_id,
    veio_de_anuncio: !!(c.attribution as Record<string, unknown> | null)?.ad_id,
    owner_ids: [], owner_names: [], stage_ids: [], stage_names: [],
    funnel_ids: [], funnel_names: [], abertas: 0,
  })

  if (conversas.length === 0) return []

  const admin = createAdminClient()
  const convIds = conversas.map(c => c.id as string)

  const { data: leads, error: erroLeads } = await admin
    .from('leads')
    .select('conversation_id, owner_id, crm_stage_id')
    .eq('tenant_id', tenantId)
    .in('conversation_id', convIds)

  if (erroLeads) {
    // Sem as oportunidades os filtros de funil ficam vazios, mas a caixa de
    // entrada continua: o que ela precisa mesmo é da lista de conversas.
    console.error('[getConversations] oportunidades:', erroLeads.message)
    return conversas.map(base)
  }

  const linhas = (leads ?? []) as any[]
  const stageIds = [...new Set(linhas.map(l => l.crm_stage_id).filter(Boolean))] as string[]
  const ownerIds = [...new Set(linhas.map(l => l.owner_id).filter(Boolean))] as string[]

  const [stagesRes, ownersRes] = await Promise.all([
    stageIds.length > 0
      ? admin.from('crm_stages').select('id, name, funnel_id, outcome').in('id', stageIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length > 0
      ? admin.from('users').select('id, name').in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (stagesRes.error) console.error('[getConversations] etapas:', stagesRes.error.message)
  if (ownersRes.error) console.error('[getConversations] donos:', ownersRes.error.message)

  const porStage = new Map((stagesRes.data ?? []).map((s: any) => [s.id as string, s]))
  const porOwner = new Map((ownersRes.data ?? []).map((u: any) => [u.id as string, u.name as string]))

  const funnelIds = [...new Set((stagesRes.data ?? []).map((s: any) => s.funnel_id).filter(Boolean))] as string[]
  const { data: funis, error: erroFunis } = funnelIds.length > 0
    ? await admin.from('crm_funnels').select('id, name').in('id', funnelIds)
    : { data: [], error: null }
  if (erroFunis) console.error('[getConversations] funis:', erroFunis.message)
  const porFunil = new Map((funis ?? []).map((f: any) => [f.id as string, f.name as string]))

  const porConversa = new Map<string, any[]>()
  for (const l of linhas) {
    const id = l.conversation_id as string
    if (!porConversa.has(id)) porConversa.set(id, [])
    porConversa.get(id)!.push(l)
  }

  return conversas.map(c => {
    const minhas = porConversa.get(c.id as string) ?? []
    const agregado = base(c)

    for (const l of minhas) {
      const etapa = l.crm_stage_id ? porStage.get(l.crm_stage_id) : null
      if (l.owner_id) {
        if (!agregado.owner_ids.includes(l.owner_id)) agregado.owner_ids.push(l.owner_id)
        const nome = porOwner.get(l.owner_id)
        if (nome && !agregado.owner_names.includes(nome)) agregado.owner_names.push(nome)
      }
      if (etapa) {
        if (!agregado.stage_ids.includes(etapa.id)) agregado.stage_ids.push(etapa.id)
        if (etapa.name && !agregado.stage_names.includes(etapa.name)) agregado.stage_names.push(etapa.name)
        if (etapa.funnel_id && !agregado.funnel_ids.includes(etapa.funnel_id)) {
          agregado.funnel_ids.push(etapa.funnel_id)
          const nomeFunil = porFunil.get(etapa.funnel_id)
          if (nomeFunil) agregado.funnel_names.push(nomeFunil)
        }
        if (etapa.outcome === 'OPEN') agregado.abertas += 1
      } else {
        // Sem etapa conta como aberta: some da contagem seria pior que aparecer.
        agregado.abertas += 1
      }
    }

    return agregado
  })
}

/**
 * Preenche `reply_preview` das mensagens que são resposta.
 *
 * A citação guarda só o id no provedor, então a prévia é montada na leitura. A
 * maioria das citadas já está na própria lista; as que não estão (responder uma
 * mensagem bem antiga) são buscadas numa segunda consulta, e as que não existem
 * mais ficam com prévia nula — a citação some, a resposta permanece.
 */
async function anexarCitacoes(
  mensagens: any[], conversationId: string, tenantId: string,
): Promise<any[]> {
  const citados = new Set(
    mensagens.map(m => m.reply_to_external_id).filter(Boolean) as string[],
  )
  if (citados.size === 0) return mensagens

  const porExternalId = new Map<string, any>()
  for (const m of mensagens) {
    if (m.external_id) porExternalId.set(m.external_id as string, m)
  }

  const faltantes = [...citados].filter(id => !porExternalId.has(id))
  if (faltantes.length > 0) {
    const { data, error } = await createAdminClient()
      .from('messages')
      .select('id, external_id, content, direction, media_type')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .in('external_id', faltantes)
    if (error) console.error('[anexarCitacoes]', error.message)
    for (const m of (data ?? []) as any[]) porExternalId.set(m.external_id as string, m)
  }

  return mensagens.map(m => {
    if (!m.reply_to_external_id) return m
    const citada = porExternalId.get(m.reply_to_external_id as string)
    return {
      ...m,
      reply_preview: citada
        ? {
            id:         citada.id ?? null,
            content:    citada.content ?? '',
            direction:  citada.direction,
            media_type: citada.media_type ?? null,
          }
        : null,
    }
  })
}

/**
 * Link assinado de UMA mensagem, para quem chegou pelo realtime.
 *
 * `media_url` não existe na tabela: ela nasce em `getMessages`, que assina o
 * `media_path` na leitura. A mensagem entregue pelo `postgres_changes` é a linha
 * crua do banco, então vem com o caminho e sem link — e a bolha caía no texto de
 * apoio (`[image]`) em vez de mostrar a imagem que já estava guardada.
 *
 * Filtra por tenant porque todo export de um arquivo `'use server'` é endpoint
 * público: sem isso, um id de mensagem de outra rede devolveria o arquivo dela.
 */
export async function getMessageMediaUrl(messageId: string): Promise<string | null> {
  const ctx = await getTenantContext()

  const { data, error } = await createAdminClient()
    .from('messages')
    .select('media_path')
    .eq('id', messageId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (error) { console.error('[getMessageMediaUrl]', error.message); return null }
  if (!data?.media_path) return null

  return urlDaMidia(data.media_path as string)
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const ctx   = await getTenantContext()
  const admin = createAdminClient()

  const { data } = await admin
    .from('messages')
    .select('id, conversation_id, direction, content, channel, status, sent_by_name, is_read, created_at, media_type, media_path, external_id, reply_to_external_id, edited_at, ad_referral')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: true })
    .limit(500)

  const linhas = (data ?? []) as any[]

  // O bucket é privado: a foto de uma cliente não pode ficar acessível por
  // URL adivinhável. Cada mídia vira um link assinado na leitura.
  const mensagens = await Promise.all(linhas.map(async (m: any) => ({
    ...m,
    media_url: m.media_path ? await urlDaMidia(m.media_path) : null,
  })))

  const comAnuncio = await anexarAnuncios(mensagens, ctx.tenantId!)
  return anexarCitacoes(comAnuncio, conversationId, ctx.tenantId!) as Promise<Message[]>
}

/** Plataforma do anúncio pelo link, que é o único lugar onde ela aparece. */
function plataformaDoLink(url: string | null | undefined): string | null {
  const u = (url ?? '').toLowerCase()
  if (!u) return null
  if (u.includes('instagram') || u.includes('ig.me')) return 'Instagram'
  if (u.includes('facebook') || u.includes('fb.')) return 'Facebook'
  return null
}

/**
 * Traduz o aviso de anúncio para o que a tela mostra.
 *
 * O aviso já traz título, texto e id do anúncio; campanha e conjunto vêm do
 * cache/Graph API e podem faltar. Faltando, a mensagem continua marcada como
 * vinda de anúncio — saber que veio já muda o atendimento, mesmo sem o nome
 * da campanha.
 */
async function anexarAnuncios(mensagens: any[], tenantId: string): Promise<any[]> {
  const comRef = mensagens.filter(m => m.ad_referral)
  if (comRef.length === 0) return mensagens

  const ids = comRef
    .map(m => (m.ad_referral?.source_id ?? null) as string | null)
    .filter(Boolean) as string[]

  // A busca de nomes nunca derruba a leitura da conversa: sem integração, sem
  // permissão ou com a Graph API fora do ar, o mapa volta vazio.
  let nomes = new Map<string, { adName?: string | null; adsetName?: string | null; campaignName?: string | null }>()
  if (ids.length > 0) {
    try {
      nomes = await nomesDeAnuncios(tenantId, ids)
    } catch (e) {
      console.error('[anexarAnuncios]', (e as Error).message)
    }
  }

  return mensagens.map(m => {
    const ref = m.ad_referral
    if (!ref) return m
    const id = (ref.source_id ?? null) as string | null
    const n = id ? nomes.get(id) : undefined
    const anuncio: AnuncioDaMensagem = {
      adId:         id,
      headline:     ref.headline ?? null,
      body:         ref.body ?? null,
      sourceUrl:    ref.source_url ?? null,
      plataforma:   plataformaDoLink(ref.source_url),
      adName:       n?.adName ?? null,
      adsetName:    n?.adsetName ?? null,
      campaignName: n?.campaignName ?? null,
    }
    return { ...m, anuncio }
  })
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
  /** `WON`/`LOST` = etapa de desfecho. É o que define oportunidade concluída. */
  outcome: 'OPEN' | 'WON' | 'LOST'
}

/** A pessoa, do jeito que a conversa a conhece. */
export interface ContatoDaConversa {
  conversationId: string
  nome:     string | null
  telefone: string | null
  tags:     string[]
  canal:    InboxChannel
}

/** Ficha de cliente, quando existe. Não é pré-requisito para nada. */
export interface ClienteDoContato {
  id:    string
  name:  string
  phone: string | null
  email: string | null
}

/** Oportunidade: o lead, agora só com o que é do negócio. */
export interface Oportunidade extends InboxLead {
  /** Valor negociado. Null = ainda sem proposta (zero seria "por nada"). */
  value:       number | null
  stage_name:  string | null
  funnel_id:   string | null
  funnel_name: string | null
  outcome:     'OPEN' | 'WON' | 'LOST'
  owner_id:    string | null
  owner_name:  string | null
  created_at:  string
}

export interface ConversationCard {
  contato:    ContatoDaConversa
  cliente:    ClienteDoContato | null
  /** Em andamento: etapa com outcome `OPEN`. */
  abertas:    Oportunidade[]
  /** Ganhas e perdidas, para consulta. */
  concluidas: Oportunidade[]
  /** Etapas de TODOS os funis: é daqui que sai o menu que move de funil. */
  stages:  InboxStage[]
  funnels: { id: string; name: string }[]
  /** Procedimentos ativos da rede: o que a oportunidade pode ter como produto. */
  procedimentos: { id: string; name: string; price: number }[]
  /**
   * Tags já em uso na rede — o que o card oferece para escolher.
   *
   * O card não cria tag: quem atende escolhe entre as que existem. Sem isso, a
   * mesma ideia vira "botox", "Botox" e "botox " em três atendimentos, e o
   * filtro por tag deixa de servir para qualquer coisa.
   */
  tagsDaRede: string[]
}


/**
 * Tudo que o painel lateral precisa: o contato, a ficha de cliente e as
 * oportunidades dele.
 *
 * As oportunidades vêm por DOIS caminhos, e o segundo importa: as ligadas a esta
 * conversa, e as do mesmo cliente. Quem já é cliente pode ter card criado direto
 * no quadro (uma campanha de reativação, por exemplo) — sem a segunda condição,
 * esse card não apareceria para quem está atendendo a pessoa.
 */
export async function getConversationCard(conversationId: string): Promise<ConversationCard | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  const admin = createAdminClient()

  const { data: conv, error: erroConv } = await admin
    .from('conversations')
    .select('id, contact_name, contact_phone, tags, client_id, channel')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroConv) { console.error('[getConversationCard]', erroConv.message); return null }
  if (!conv) return null

  const c = conv as any
  const clientId = c.client_id as string | null

  const funis  = await seedDefaultFunnel(ctx.tenantId!)
  const stages = (await listAllStages(ctx.tenantId!)) as InboxStage[]
  const funnels = funis
    .filter(f => f.archived_at === null)
    .map(f => ({ id: f.id, name: f.name }))

  const { data: tagRows, error: erroTags } = await admin
    .rpc('lead_tags_da_rede', { p_tenant: ctx.tenantId! })
  if (erroTags) console.error('[getConversationCard] tags:', erroTags.message)
  const tagsDaRede = ((tagRows ?? []) as { tag: string }[]).map(r => r.tag)

  // Catálogo da rede e das unidades (branch_id null = base da rede), como em
  // qualquer leitura de procedimento — ver CLAUDE.md §9.3.
  const { data: procRows, error: erroProc } = await admin
    .from('procedures')
    .select('id, name, price')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')
  if (erroProc) console.error('[getConversationCard] procedimentos:', erroProc.message)
  const procedimentos = ((procRows ?? []) as any[]).map(p => ({
    id: p.id as string, name: p.name as string, price: Number(p.price ?? 0),
  }))

  const [cliente, oportunidades] = await Promise.all([
    clientId ? buscarCliente(admin, ctx.tenantId!, clientId) : Promise.resolve(null),
    buscarOportunidades(admin, ctx.tenantId!, conversationId, clientId, stages),
  ])

  const abertas    = oportunidades.filter(o => o.outcome === 'OPEN')
  const concluidas = oportunidades.filter(o => o.outcome !== 'OPEN')

  return {
    contato: {
      conversationId,
      nome:     c.contact_name ?? null,
      telefone: c.contact_phone ?? null,
      tags:     (c.tags ?? []) as string[],
      canal:    c.channel as InboxChannel,
    },
    cliente, abertas, concluidas, stages, funnels, procedimentos, tagsDaRede,
  }
}

async function buscarCliente(
  admin: ReturnType<typeof createAdminClient>, tenantId: string, clientId: string,
): Promise<ClienteDoContato | null> {
  const { data, error } = await admin
    .from('clients')
    .select('id, name, phone, email')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) { console.error('[getConversationCard] cliente:', error.message); return null }
  return (data as ClienteDoContato) ?? null
}

async function buscarOportunidades(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string, conversationId: string, clientId: string | null,
  stages: InboxStage[],
): Promise<Oportunidade[]> {
  const filtro = clientId
    ? `conversation_id.eq.${conversationId},client_id.eq.${clientId}`
    : `conversation_id.eq.${conversationId}`

  const { data, error } = await admin
    .from('leads')
    .select('id, name, phone, email, social_media, source, notes, crm_stage_id, tags, branch_id, client_id, owner_id, created_at, value, lead_procedures(procedure_id)')
    .eq('tenant_id', tenantId)
    .or(filtro)
    .order('created_at', { ascending: false })

  if (error) { console.error('[getConversationCard] oportunidades:', error.message); return [] }
  const linhas = (data ?? []) as any[]
  if (linhas.length === 0) return []

  const porEtapa = new Map(stages.map(s => [s.id, s]))
  const funis = new Map(
    (await admin.from('crm_funnels').select('id, name').eq('tenant_id', tenantId)).data
      ?.map((f: any) => [f.id as string, f.name as string]) ?? [],
  )

  const ownerIds = [...new Set(linhas.map(l => l.owner_id).filter(Boolean))] as string[]
  const donos = new Map<string, string>()
  if (ownerIds.length > 0) {
    const { data: users } = await admin.from('users').select('id, name').in('id', ownerIds)
    for (const u of (users ?? []) as any[]) donos.set(u.id, u.name)
  }

  return linhas.map(l => {
    const etapa = l.crm_stage_id ? porEtapa.get(l.crm_stage_id) : undefined
    return {
      id: l.id, name: l.name, phone: l.phone, email: l.email,
      social_media: l.social_media, source: l.source, notes: l.notes,
      crm_stage_id: l.crm_stage_id, tags: (l.tags ?? []) as string[],
      branch_id: l.branch_id, client_id: l.client_id,
      procedure_ids: ((l.lead_procedures ?? []) as { procedure_id: string }[]).map(p => p.procedure_id),
      value:       l.value === null || l.value === undefined ? null : Number(l.value),
      stage_name:  etapa?.name ?? null,
      funnel_id:   etapa?.funnel_id ?? null,
      funnel_name: etapa ? funis.get(etapa.funnel_id) ?? null : null,
      // Sem etapa a oportunidade é tratada como aberta: sumir da tela por falta
      // de etapa seria pior que aparecer sem ela.
      outcome:     etapa?.outcome ?? 'OPEN',
      owner_id:    l.owner_id ?? null,
      owner_name:  l.owner_id ? donos.get(l.owner_id) ?? null : null,
      created_at:  l.created_at,
    }
  })
}

/**
 * Cria uma oportunidade para este contato.
 *
 * Herda nome, telefone, cliente e atribuição do contato. A atribuição é o ponto
 * silencioso: ela foi guardada quando a pessoa mandou a primeira mensagem, e é
 * aqui que reencontra o funil — sem isso, toda oportunidade nascida de anúncio
 * apareceria como orgânica no relatório de campanha.
 *
 * Não impede duplicata no mesmo funil: dois procedimentos diferentes negociados
 * ao mesmo tempo é caso real. Só avisa, e quem atende decide.
 */
export async function criarOportunidade(
  conversationId: string,
  funnelId: string,
  confirmarDuplicata = false,
): Promise<{ ok: boolean; leadId?: string; jaExisteAberta?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const { data: conv, error: erroConv } = await admin
    .from('conversations')
    .select('id, contact_name, contact_phone, contact_external_id, client_id, branch_id, channel, attribution, lead_id')
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroConv) return { ok: false, error: erroConv.message }
  if (!conv)    return { ok: false, error: 'Conversa não encontrada.' }
  const c = conv as any

  const stages = (await listAllStages(ctx.tenantId!)) as InboxStage[]
  const doFunil = stages.filter(s => s.funnel_id === funnelId).sort((a, b) => a.position - b.position)
  const primeira = doFunil[0]
  if (!primeira) return { ok: false, error: 'Este funil não tem etapas.' }

  if (!confirmarDuplicata) {
    const abertasNoFunil = doFunil.filter(s => s.outcome === 'OPEN').map(s => s.id)
    if (abertasNoFunil.length > 0) {
      const { data: existente } = await admin
        .from('leads')
        .select('id')
        .eq('tenant_id', ctx.tenantId!)
        .eq('conversation_id', conversationId)
        .in('crm_stage_id', abertasNoFunil)
        .limit(1)
      if (existente && existente.length > 0) {
        return { ok: false, jaExisteAberta: existente[0]!.id as string }
      }
    }
  }

  const atribuicao = (c.attribution ?? {}) as Record<string, string | undefined>
  const insert: Record<string, unknown> = {
    tenant_id:       ctx.tenantId!,
    branch_id:       c.branch_id ?? null,
    conversation_id: conversationId,
    client_id:       c.client_id ?? null,
    name:            c.contact_name || c.contact_phone || 'Sem nome',
    phone:           c.contact_phone ?? null,
    crm_stage_id:    primeira.id,
    owner_id:        ctx.internalUserId ?? null,
    source:          atribuicao.source ?? null,
  }
  if (!c.contact_phone) {
    insert.social_media = `${c.channel}: ${c.contact_name ?? c.contact_external_id ?? ''}`.trim()
  }
  if (atribuicao.utm_source) insert.utm_source = atribuicao.utm_source
  if (atribuicao.ctwa_clid)  insert.ctwa_clid  = atribuicao.ctwa_clid

  const { data: novo, error } = await admin
    .from('leads').insert(insert).select('id').single()

  if (error) return { ok: false, error: error.message }
  const leadId = (novo as { id: string }).id

  await registrarEventoLead({
    tenantId:    ctx.tenantId!,
    leadId,
    type:        'CREATED',
    toStageId:   primeira.id,
    actorUserId: ctx.internalUserId,
    actorName:   ctx.userName || null,
  })

  // O card nasce por dois caminhos — cadastro manual em Oportunidades e este,
  // a partir de uma conversa. Emitir nos dois é o que faz a automação de
  // "novo negócio" valer para os dois, e a chave determinística garante que
  // não haja evento repetido.
  await emitirEventoDeLead(EVENTOS.LEAD_CRIADO, leadId, ctx)

  // `conversations.lead_id` é a oportunidade PRINCIPAL: é por ela que o card do
  // quadro volta para a conversa certa. A primeira criada assume o posto.
  if (!c.lead_id) {
    await admin.from('conversations').update({ lead_id: leadId }).eq('id', conversationId)
  }

  revalidarInbox()
  revalidatePath('/admin/oportunidades')
  return { ok: true, leadId }
}

/**
 * Atualiza a pessoa e propaga para as oportunidades dela.
 *
 * A oportunidade guarda uma cópia de nome e telefone porque o card do quadro
 * precisa se identificar sozinho. Cópia que não acompanha o original vira mentira
 * — então a alteração desce para todas, e cada uma registra na sua linha do tempo
 * o que mudou, com valor anterior e autor. Só as que realmente mudaram: senão
 * salvar o contato carimbaria o histórico de oportunidades intocadas.
 */
export async function atualizarContato(
  conversationId: string,
  dados: { nome?: string; telefone?: string; tags?: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.nome     !== undefined) patch.contact_name  = dados.nome.trim() || null
  if (dados.telefone !== undefined) patch.contact_phone = dados.telefone.replace(/\D/g, '') || null
  if (dados.tags     !== undefined) patch.tags          = dados.tags

  const { error } = await admin
    .from('conversations')
    .update(patch)
    .eq('id', conversationId)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { ok: false, error: error.message }

  const mudouNome = patch.contact_name !== undefined
  const mudouFone = patch.contact_phone !== undefined
  if (mudouNome || mudouFone) {
    await propagarParaOportunidades(admin, ctx, conversationId, {
      name:  mudouNome ? (patch.contact_name as string | null) : undefined,
      phone: mudouFone ? (patch.contact_phone as string | null) : undefined,
    })
  }

  revalidarInbox()
  return { ok: true }
}

async function propagarParaOportunidades(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  conversationId: string,
  novos: { name?: string | null; phone?: string | null },
): Promise<void> {
  const { data, error } = await admin
    .from('leads')
    .select('id, name, phone')
    .eq('tenant_id', ctx.tenantId!)
    .eq('conversation_id', conversationId)

  if (error) { console.error('[atualizarContato] oportunidades:', error.message); return }

  for (const lead of (data ?? []) as any[]) {
    const patch: Record<string, unknown> = {}
    const changes: { campo: string; de: string | null; para: string | null }[] = []

    // Nome é NOT NULL no lead: contato sem nome não pode apagar o do card.
    if (novos.name !== undefined && novos.name && novos.name !== lead.name) {
      patch.name = novos.name
      changes.push({ campo: 'Nome', de: lead.name ?? null, para: novos.name })
    }
    if (novos.phone !== undefined && (novos.phone ?? null) !== (lead.phone ?? null)) {
      patch.phone = novos.phone
      changes.push({ campo: 'Telefone', de: lead.phone ?? null, para: novos.phone })
    }
    if (changes.length === 0) continue

    const { error: erroUpdate } = await admin.from('leads').update(patch).eq('id', lead.id)
    if (erroUpdate) { console.error('[atualizarContato] propagar:', erroUpdate.message); continue }

    await registrarEventoLead({
      tenantId:    ctx.tenantId!,
      leadId:      lead.id,
      type:        'UPDATED',
      actorUserId: ctx.internalUserId,
      actorName:   ctx.userName || null,
      changes,
    })
  }
}

/**
 * Situação da oportunidade: em aberto, ganha ou perdida.
 *
 * É sempre um movimento de etapa — a situação não é campo, é o `outcome` da
 * etapa em que a oportunidade está. Por isso `OPEN` também entra aqui: marcar
 * ganha por engano tem que poder ser desfeito, e sem reabrir a única saída
 * seria arrastar o card no quadro.
 *
 * Ganhar **não** cria cliente. São gestos separados de propósito: fechar venda de
 * quem não quer dar CPF é rotina, e exigir a ficha para registrar o ganho
 * deixaria o funil mentindo sobre o que aconteceu. Ligar as duas pontas é
 * trabalho do módulo de automações.
 */
export async function definirSituacaoOportunidade(
  leadId: string,
  desfecho: 'OPEN' | 'WON' | 'LOST',
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const { data: lead, error: erroLead } = await admin
    .from('leads')
    .select('id, crm_stage_id')
    .eq('id', leadId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (erroLead) return { ok: false, error: erroLead.message }
  if (!lead)    return { ok: false, error: 'Oportunidade não encontrada.' }

  const stages = (await listAllStages(ctx.tenantId!)) as InboxStage[]
  const atual  = stages.find(s => s.id === (lead as any).crm_stage_id)
  if (!atual) return { ok: false, error: 'Oportunidade sem etapa. Escolha um funil antes de concluir.' }

  // Reabrir volta para a PRIMEIRA etapa em aberto do funil, não para onde a
  // oportunidade estava: a etapa anterior não é guardada em lugar nenhum, e
  // adivinhar pelo histórico seria menos previsível do que recomeçar do começo
  // — de onde quem reabriu pode mover para a etapa certa em um clique.
  const destino = stages
    .filter(s => s.funnel_id === atual.funnel_id && s.outcome === desfecho)
    .sort((a, b) => a.position - b.position)[0]

  if (!destino) {
    const rotulo = desfecho === 'WON' ? 'ganho' : desfecho === 'LOST' ? 'perda' : 'andamento'
    return {
      ok: false,
      error: `Este funil não tem etapa de ${rotulo}. Ajuste as etapas em Oportunidades → Funis.`,
    }
  }
  if (destino.id === atual.id) return { ok: true }

  const { error } = await admin
    .from('leads').update({ crm_stage_id: destino.id }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  await registrarEventoLead({
    tenantId:    ctx.tenantId!,
    leadId,
    type:        'STAGE_CHANGED',
    fromStageId: atual.id,
    toStageId:   destino.id,
    actorUserId: ctx.internalUserId,
    actorName:   ctx.userName || null,
  })

  revalidarInbox()
  revalidatePath('/admin/oportunidades')
  return { ok: true }
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
  /** `external_id` da mensagem sendo respondida, quando é uma resposta. */
  replyToExternalId?: string | null,
): Promise<{ ok: boolean; message?: Message; error?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

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

  // O envio em si mora em `lib/inbox/enviar.ts`: a pessoa no inbox e o motor
  // de automações mandam pelo mesmo caminho, com a mesma checagem de canal e
  // de janela. Duas implementações divergiriam, e a primeira divergência seria
  // a janela de 24h — a regra que, quando falha, marca como "enviado" o que o
  // cliente nunca recebeu.
  const r = await enviarNaConversa(
    ctx.tenantId!, conversationId, content,
    { id: profile?.id ?? ctx.internalUserId ?? null, nome: profile?.name ?? null },
    { replyToExternalId },
  )

  if (!r.ok && !r.mensagemId) return { ok: false, error: r.error }

  // Mensagem da EQUIPE. Serve a automações que reagem ao atendimento (marcar
  // primeira resposta, parar uma sequência porque alguém já respondeu) e por
  // isso carrega o ator de verdade, ao contrário da recebida.
  await emitirEventoDeConversa(EVENTOS.CONVERSA_MENSAGEM_ENVIADA, conversationId, ctx.tenantId!, {
    texto:      content.trim(),
    mensagemId: r.mensagemId!,
    ctx,
  })

  revalidarInbox()

  const { data: msg } = await admin
    .from('messages').select('*').eq('id', r.mensagemId!).single()

  return r.ok
    ? { ok: true, message: msg as unknown as Message }
    : { ok: false, error: mensagemDeFalha(new Error(r.error ?? 'Falha no envio.')), message: msg as unknown as Message }
}

/** O WhatsApp recusa edição depois disso, e a recusa vem como erro genérico. */
const JANELA_DE_EDICAO_MS = 15 * 60 * 1000

/**
 * Reescreve uma mensagem já enviada.
 *
 * Edita no provedor ANTES de gravar: ao contrário do envio — onde a linha nasce
 * como `sending` para a falha ficar visível —, aqui já existe um texto correto
 * na tela e no celular do contato. Gravar primeiro e falhar depois deixaria a
 * conversa mostrando um texto que o contato nunca viu.
 */
export async function editMessage(
  messageId: string,
  texto: string,
): Promise<{ ok: boolean; message?: Message; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const novo = texto.trim()
  if (!novo) return { ok: false, error: 'A mensagem não pode ficar vazia.' }

  const { data: msg, error } = await admin
    .from('messages')
    .select('id, conversation_id, direction, status, channel, external_id, content, created_at, media_type')
    .eq('id', messageId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!msg)  return { ok: false, error: 'Mensagem não encontrada.' }

  if (msg.direction !== 'outbound') return { ok: false, error: 'Só dá para editar mensagem enviada por você.' }
  if (msg.media_type)               return { ok: false, error: 'Anexo não pode ser editado, só a mensagem de texto.' }
  if (msg.content === novo)         return { ok: true, message: msg as unknown as Message }

  const idade = Date.now() - new Date(msg.created_at as string).getTime()
  if (idade > JANELA_DE_EDICAO_MS) {
    return { ok: false, error: 'O WhatsApp só permite editar nos primeiros 15 minutos.' }
  }

  const canal = await resolverCanal(ctx.tenantId!, msg.channel as ChannelKind)

  const patch: Record<string, unknown> = {
    content: novo, edited_at: new Date().toISOString(),
  }

  // Nota interna nunca saiu daqui: edita direto, sem provedor.
  const soLocal = !canal || !msg.external_id || msg.status === 'failed'

  if (!soLocal) {
    if (!canal.provider.editMessage) {
      return { ok: false, error: 'Este canal não permite editar mensagens já enviadas.' }
    }
    try {
      const r = await canal.provider.editMessage(msg.external_id as string, novo)
      // O WhatsApp troca o id da mensagem ao editar. Guardar o novo é o que
      // mantém a próxima edição e os recibos apontando para o lugar certo.
      if (r?.externalId) patch.external_id = r.externalId
    } catch (err) {
      console.error('[editMessage]', err)
      return { ok: false, error: mensagemDeFalha(err) }
    }
  }

  const { data: atualizada, error: erroUpdate } = await admin
    .from('messages')
    .update(patch)
    .eq('id', messageId)
    .select()
    .single()

  if (erroUpdate) return { ok: false, error: erroUpdate.message }

  revalidarInbox()
  return { ok: true, message: atualizada as unknown as Message }
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
    // `leads!conversations_lead_id_fkey`: com `leads.conversation_id` existindo,
    // há duas relações entre as tabelas e o embed sem nome é recusado. Esta é a
    // oportunidade principal — que é de onde sai o nome para o template.
    .select('channel, contact_name, leads!conversations_lead_id_fkey(name)')
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
