import { createHmac, timingSafeEqual } from 'crypto'
import type {
  SendProvider, InboundMsg, InboundMedia, MediaKind, ChannelKind, OutboundMedia,
  SendOptions, StatusRecibo,
} from '@/lib/channels/types'

const GRAPH = 'https://graph.facebook.com/v25.0'

/**
 * Instagram Direct e Facebook Messenger.
 *
 * Um provedor só porque é a mesma API: `POST /{page-id}/messages` com
 * `recipient.id`. O que muda é de onde vem o id do contato (PSID no Messenger,
 * IGSID no Instagram) e o campo `object` do webhook — e nada disso altera o
 * envio. Separar em duas classes seria duplicar o arquivo inteiro para trocar
 * uma string.
 */
export interface MetaMessagingPage {
  pageId:      string
  pageName:    string
  /** Token da PÁGINA, não do usuário. Derivado de token longo, não expira. */
  pageToken:   string
  igUserId?:   string | null
  igUsername?: string | null
}

export interface MetaMessagingConfig {
  provider: 'meta_messaging'
  pages:    MetaMessagingPage[]
  /** Página escolhida para operar; as demais ficam listadas para troca. */
  activePageId: string
}

const TIPO_POR_ANEXO: Record<string, MediaKind> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  file:  'document',
}

export class MetaMessagingProvider implements SendProvider {
  constructor(
    private page: MetaMessagingPage,
    private channel: ChannelKind,
  ) {}

  async send(
    to: string, content: string, options?: SendOptions,
  ): Promise<{ externalId: string }> {
    // Citar no Messenger e no Instagram Direct é `reply_to.mid`, dentro da
    // própria `message`. O mid é o mesmo id que guardamos em `external_id`.
    const message: Record<string, unknown> = { text: content }
    if (options?.replyToExternalId) {
      message.reply_to = { mid: options.replyToExternalId }
    }

    const res = await fetch(`${GRAPH}/${this.page.pageId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient:      { id: to },
        message,
        // RESPONSE = resposta dentro da janela de 24h. Fora dela a Meta recusa,
        // e é por isso que `estadoDaJanela` barra antes de chegar aqui.
        messaging_type: 'RESPONSE',
        access_token:   this.page.pageToken,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(
        `Meta Messaging ${res.status}: ${JSON.stringify(err?.error ?? {})}`,
      )
    }

    const data = await res.json()
    return { externalId: (data?.message_id as string) ?? '' }
  }

  /**
   * Envia um arquivo pelo Messenger ou Instagram Direct.
   *
   * Aqui a Meta baixa da URL que passamos (ao contrário da Cloud API do
   * WhatsApp, que exige upload antes). `is_reusable: false` porque o arquivo já
   * vive no nosso bucket: guardar uma segunda cópia na Meta só cria um id que
   * ninguém vai usar de novo.
   */
  async sendMedia(to: string, media: OutboundMedia): Promise<{ externalId: string }> {
    // O Messenger chama documento de `file`; os outros três têm o mesmo nome.
    const tipo = media.kind === 'document' ? 'file' : media.kind

    const res = await fetch(`${GRAPH}/${this.page.pageId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: to },
        message: {
          attachment: {
            type:    tipo,
            payload: { url: media.url, is_reusable: false },
          },
        },
        messaging_type: 'RESPONSE',
        access_token:   this.page.pageToken,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(
        `Meta Messaging ${res.status}: ${JSON.stringify(err?.error ?? {})}`,
      )
    }
    const data = await res.json()
    return { externalId: (data?.message_id as string) ?? '' }
  }

  /** A URL de anexo da Meta já vem assinada, mas expira — daí o download. */
  async fetchMedia(media: InboundMedia): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
    if (!media.url) return null
    const res = await fetch(media.url)
    if (!res.ok) return null
    return {
      bytes:    await res.arrayBuffer(),
      mimeType: res.headers.get('content-type') ?? media.mimeType ?? 'application/octet-stream',
    }
  }

  /**
   * Lê uma entrada do webhook.
   *
   * Messenger e Instagram usam o mesmo formato: `entry[].messaging[]`. O que
   * difere é o `object` do envelope, resolvido por quem chama.
   */
  /**
   * Recibo de entrega ou leitura.
   *
   * O Messenger manda `delivery` com a lista de mids e uma marca d'água, e
   * `read` só com a marca. O Instagram manda `read` nomeando uma mensagem
   * (`mid`) e não manda entrega nenhuma — lá a conversa vai de enviada direto
   * para lida. Os dois formatos convivem aqui porque é a mesma assinatura de
   * webhook, e tratar só um deixaria metade das mensagens paradas em um tique.
   */
  parseStatus(entrada: unknown): StatusRecibo | null {
    const e = entrada as any
    const m = e?.messaging?.[0]
    if (!m) return null

    // No recibo, quem "envia" o evento é o contato; a página é o destinatário.
    const externalUserId = m.sender?.id as string | undefined
    if (!externalUserId) return null

    const bruto = m.delivery ?? m.read
    if (!bruto) return null

    const ids: string[] = [
      ...(Array.isArray(bruto.mids) ? bruto.mids : []),
      ...(bruto.mid ? [bruto.mid] : []),
    ].map(String).filter(Boolean)

    return {
      status:         m.delivery ? 'delivered' : 'read',
      externalUserId,
      ...(ids.length > 0 ? { externalIds: ids } : {}),
      ...(bruto.watermark
        ? { watermark: new Date(Number(bruto.watermark)).toISOString() }
        : {}),
    }
  }

  parseInbound(entrada: unknown): InboundMsg | null {
    const e = entrada as any
    const m = e?.messaging?.[0]
    if (!m?.message) return null

    // `is_echo` é a nossa própria mensagem voltando. Sem isto, toda resposta
    // enviada entraria de novo como se fosse do cliente.
    if (m.message.is_echo) return null

    const anexo = m.message.attachments?.[0]
    const media: InboundMedia | undefined = anexo
      ? {
          kind:     TIPO_POR_ANEXO[anexo.type as string] ?? 'document',
          url:      anexo.payload?.url as string | undefined,
          mimeType: undefined,
        }
      : undefined

    const texto = (m.message.text as string | undefined)
      ?? (media ? `[${media.kind}]` : '')
    if (!texto && !media) return null

    return {
      externalUserId: m.sender?.id as string,
      phone:          null,   // Instagram e Messenger não expõem telefone
      content:        texto,
      externalId:     m.message.mid as string,
      timestamp:      new Date(Number(m.timestamp ?? Date.now())).toISOString(),
      type:           media ? (media.kind === 'document' ? 'document' : media.kind) : 'text',
      media,
      // Resposta a uma mensagem anterior: `reply_to.mid` é o mesmo id que
      // guardamos em `external_id`. No Instagram, responder a um story vem
      // neste mesmo campo — a citação some se a story expirar, e a resposta
      // continua na conversa, que é o comportamento certo.
      ...(m.message.reply_to?.mid
        ? { replyToExternalId: String(m.message.reply_to.mid) }
        : {}),
    }
  }

  /**
   * Nome e @ do contato.
   *
   * Sem isto o card nasce com o PSID como nome — um número de 16 dígitos, que
   * não diz nada para quem atende. Falha em silêncio de propósito: não ter o
   * nome não pode impedir a mensagem de entrar.
   */
  /**
   * Nome do contato para a lista de conversas.
   *
   * O webhook do Messenger e do Instagram não manda nome nenhum — só o PSID/
   * IGSID —, então sem esta consulta a conversa fica com o id como nome para
   * sempre. No Instagram o @ vale mais que o nome: é assim que a pessoa é
   * reconhecida.
   */
  async fetchDisplayName(externalUserId: string): Promise<string | null> {
    const perfil = await this.fetchPerfil(externalUserId)
    if (this.channel === 'instagram' && perfil.username) return `@${perfil.username}`
    return perfil.name?.trim() || null
  }

  async fetchPerfil(externalUserId: string): Promise<{ name?: string; username?: string }> {
    try {
      const campos = this.channel === 'instagram' ? 'name,username' : 'name'
      const res = await fetch(
        `${GRAPH}/${externalUserId}?fields=${campos}&access_token=${this.page.pageToken}`,
      )
      if (!res.ok) return {}
      const d = await res.json()
      return { name: d?.name, username: d?.username }
    } catch {
      return {}
    }
  }
}

/** Assinatura HMAC do webhook — mesma regra do WhatsApp oficial. */
export function verificarAssinaturaMeta(body: string, signature: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !signature) return false
  const esperado = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(esperado))
  } catch {
    return false
  }
}
