import { createHmac, timingSafeEqual } from 'crypto'
import type {
  SendProvider, InboundMsg, InboundMedia, MediaKind, ChannelKind,
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

  async send(to: string, content: string): Promise<{ externalId: string }> {
    const res = await fetch(`${GRAPH}/${this.page.pageId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient:      { id: to },
        message:        { text: content },
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
    }
  }

  /**
   * Nome e @ do contato.
   *
   * Sem isto o card nasce com o PSID como nome — um número de 16 dígitos, que
   * não diz nada para quem atende. Falha em silêncio de propósito: não ter o
   * nome não pode impedir a mensagem de entrar.
   */
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
