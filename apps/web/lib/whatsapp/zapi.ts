import type { WhatsAppProvider, ZAPIConfig } from './types'
import type { InboundMsg, InboundMedia, MediaKind, StatusUpdate } from '@/lib/channels/types'
import {
  montarIdentidade, classificarIdentificador, ehConversaDeGrupo,
} from '@/lib/channels/identity'

const DEFAULT_BASE = 'https://api.z-api.io'

const STATUS_MAP: Record<string, StatusUpdate['status']> = {
  SENT:         'sent',
  DELIVERY_ACK: 'delivered',
  READ:         'read',
  PLAYED:       'read',
  ERROR:        'failed',
}

export class ZAPIProvider implements WhatsAppProvider {
  private instanceId: string
  private token:      string
  private base:       string

  constructor(config: ZAPIConfig) {
    this.instanceId = config.instanceId
    this.token      = config.token
    this.base       = config.baseUrl ?? DEFAULT_BASE
  }

  private url(path: string) {
    return `${this.base}/instances/${this.instanceId}/token/${this.token}${path}`
  }

  async send(to: string, content: string): Promise<{ externalId: string }> {
    // ⚠️ `to` pode ser um @lid. O `replace(/\D/g,'')` que havia aqui arrancava
    // o sufixo e mandava 15 dígitos soltos, que a Z-API não resolve para
    // ninguém. Ela aceita o @lid inteiro no mesmo campo `phone`; só telefone
    // é que precisa virar dígitos.
    const phone = classificarIdentificador(to) === 'phone'
      ? to.replace(/\D/g, '')
      : to

    const res = await fetch(this.url('/send-text'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone, message: content }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Z-API send error ${res.status}: ${body}`)
    }
    const data = await res.json()
    return { externalId: data.zaapId ?? data.messageId ?? '' }
  }

  parseInbound(payload: unknown): InboundMsg | null {
    const p = payload as any
    // Z-API inbound: { phone, chatLid, senderLid, participantPhone, participantLid,
    //                  isGroup, fromMe, text.message, messageId, momment, senderName }

    // Eco da mensagem que a própria clínica mandou (pelo celular, por exemplo).
    // Sem este corte ela entra como se fosse do cliente e ainda zera o
    // "aguardando resposta".
    if (p?.fromMe === true) return null

    // Grupos, listas e canais não são atendimento um-a-um: cada um viraria um
    // lead no funil com o nome do grupo no lugar do cliente.
    if (p?.isGroup === true || ehConversaDeGrupo(p?.phone, p?.chatLid)) return null

    // A identidade pode vir em qualquer um destes campos, e o `phone` às vezes
    // traz o próprio @lid. A ordem importa: o primeiro telefone de verdade vira
    // a chave, e todo o resto fica como alias para reconciliar.
    const identidade = montarIdentidade([
      p?.phone,
      p?.participantPhone,
      p?.chatLid,
      p?.senderLid,
      p?.participantLid,
    ])
    if (!identidade) return null

    // Mídia: a Z-API manda o anexo num objeto por tipo, com URL já pública.
    // Antes só texto entrava — foto do cliente era descartada no webhook.
    const ANEXOS: [string, MediaKind][] = [
      ['image', 'image'], ['audio', 'audio'], ['video', 'video'], ['document', 'document'],
    ]
    let media: InboundMedia | undefined
    for (const [campo, kind] of ANEXOS) {
      const a = p[campo]
      const url = a?.imageUrl ?? a?.audioUrl ?? a?.videoUrl ?? a?.documentUrl ?? a?.url
      if (url) {
        media = { kind, url: url as string, mimeType: a.mimeType as string | undefined }
        break
      }
    }

    const texto = (p.text?.message as string | undefined)
      ?? (p.image?.caption ?? p.video?.caption ?? p.document?.caption) as string | undefined
      ?? (media ? `[${media.kind}]` : undefined)
    if (!texto) return null

    const out: InboundMsg = {
      externalUserId: identidade.externalUserId,
      phone:          identidade.phone,
      aliases:        identidade.aliases,
      content:    texto,
      externalId: (p.messageId ?? p.zaapId ?? '') as string,
      timestamp:  p.momment
        ? new Date((p.momment as number) * 1000).toISOString()
        : new Date().toISOString(),
      type: media ? (media.kind === 'document' ? 'document' : media.kind) : 'text',
      media,
    }

    const nome = p.senderName ?? p.chatName ?? p.notifyName
    if (nome) out.displayName = nome as string

    // Referral de anúncio click-to-WhatsApp (Z-API expõe de forma inconsistente; parsing defensivo)
    const ref = p.referral ?? p.adReferral ?? p.ctwaContext
    if (ref && typeof ref === 'object') {
      const r = ref as any
      out.referral = {
        sourceType: r.sourceType ?? r.source_type ?? undefined,
        sourceId:   r.sourceId   ?? r.source_id   ?? undefined,
        sourceUrl:  r.sourceUrl  ?? r.source_url  ?? undefined,
        ctwaClid:   r.ctwaClid   ?? r.ctwa_clid   ?? undefined,
        headline:   r.headline   ?? r.title       ?? undefined,
      }
    }

    return out
  }

  parseStatus(payload: unknown): StatusUpdate | null {
    const p = payload as any
    // Z-API status: { messageId, status, phone }
    if (!p?.messageId || !p?.status) return null
    const status = STATUS_MAP[p.status as string]
    if (!status) return null
    return { externalId: p.messageId as string, status }
  }

  async testConnection(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await fetch(this.url('/status'), { method: 'GET' })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const data = await res.json()
      // Z-API returns { connected: true/false, session: 'CONNECTED' | ... }
      const connected = data?.connected === true || data?.session === 'CONNECTED'
      return { ok: connected, detail: data?.session ?? undefined }
    } catch (err: any) {
      return { ok: false, detail: err?.message }
    }
  }
}
