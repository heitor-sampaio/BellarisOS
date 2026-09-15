/**
 * Contrato comum dos canais do inbox.
 *
 * Estes tipos moravam em `lib/whatsapp/types.ts`, quando WhatsApp era o único
 * canal que funcionava. Instagram e Messenger precisam dos mesmos, e
 * `lib/meta/` importar de `lib/whatsapp/` seria uma dependência com a direção
 * errada — daí o lugar neutro. `lib/whatsapp/types.ts` reexporta, para não
 * quebrar quem já importava de lá.
 */

export type ChannelKind = 'whatsapp' | 'instagram' | 'messenger' | 'email' | 'manual'

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'other'

export type MediaKind = 'image' | 'audio' | 'video' | 'document'

/** Dados de atribuição de anúncio click-to-WhatsApp (Meta) ou equivalente. */
export interface InboundReferral {
  sourceType?: string   // 'ad' | 'post' (Meta CTWA)
  sourceId?:   string   // ad id
  sourceUrl?:  string   // usado para inferir plataforma (facebook|instagram)
  ctwaClid?:   string   // click id do click-to-WhatsApp
  headline?:   string   // título do anúncio
}

/**
 * Mídia recebida, do jeito que o provedor entrega.
 *
 * Z-API manda a URL pronta; a Graph API manda só um id, que exige uma segunda
 * chamada autenticada para virar URL — e essa URL ainda expira. Por isso as
 * duas formas convivem aqui, e quem resolve é `lib/inbox/media.ts`.
 */
export interface InboundMedia {
  kind:      MediaKind
  url?:      string
  mediaId?:  string
  mimeType?: string
}

export interface InboundMsg {
  /**
   * Identidade do contato NO CANAL: telefone no WhatsApp, PSID no Messenger,
   * IGSID no Instagram. É o que identifica a conversa.
   */
  externalUserId: string
  /** Telefone, quando o canal tem um. Instagram e Messenger não têm. */
  phone?:      string | null
  content:     string
  externalId:  string      // id da mensagem no provedor
  timestamp:   string      // ISO 8601
  type:        MessageType
  media?:      InboundMedia
  displayName?: string     // nome público do contato (vira o nome do card)
  referral?:   InboundReferral
}

export interface StatusUpdate {
  externalId: string
  status:     'sent' | 'delivered' | 'read' | 'failed'
}

/**
 * O que o inbox precisa de um canal para enviar.
 *
 * Deliberadamente menor que os provedores: `sendMessage` só pergunta "como eu
 * mando neste canal". Webhook e teste de conexão são assunto de quem
 * implementa, não do envio.
 */
export interface SendProvider {
  /** `to` é o `contact_external_id` da conversa. */
  send(to: string, content: string): Promise<{ externalId: string }>
  /** Baixa a mídia recebida; nem todo provedor precisa de autenticação. */
  fetchMedia?(media: InboundMedia): Promise<{ bytes: ArrayBuffer; mimeType: string } | null>
}

/**
 * Canais regidos pela janela de 24h da Meta: só dá para responder livremente
 * até 24h da última mensagem do contato.
 *
 * Z-API fica de fora porque não passa pela API oficial e não tem essa trava.
 * É o mesmo motivo de a janela ser decidida pelo PROVEDOR configurado, e não
 * só pelo canal — ver `lib/channels/window.ts`.
 */
export const CANAIS_COM_JANELA: ChannelKind[] = ['instagram', 'messenger']
