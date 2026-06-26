import { createHmac, timingSafeEqual } from 'crypto'
import type { WhatsAppProvider, InboundMsg, StatusUpdate, OfficialConfig } from './types'

const GRAPH = 'https://graph.facebook.com/v19.0'

const STATUS_MAP: Record<string, StatusUpdate['status']> = {
  sent:      'sent',
  delivered: 'delivered',
  read:      'read',
  failed:    'failed',
}

export class OfficialAPIProvider implements WhatsAppProvider {
  private config: OfficialConfig

  constructor(config: OfficialConfig) {
    this.config = config
  }

  async send(to: string, content: string): Promise<{ externalId: string }> {
    const res = await fetch(`${GRAPH}/${this.config.phoneNumberId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   to.replace(/\D/g, ''),
        type: 'text',
        text: { body: content },
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(err?.error)}`)
    }
    const data = await res.json()
    return { externalId: data.messages?.[0]?.id ?? '' }
  }

  parseInbound(payload: unknown): InboundMsg | null {
    // Meta Cloud API payload: entry[0].changes[0].value.messages[0]
    const p     = payload as any
    const value = p?.entry?.[0]?.changes?.[0]?.value
    const msg   = value?.messages?.[0]
    if (!msg) return null

    const type    = msg.type as string
    const content = type === 'text'
      ? (msg.text?.body ?? '')
      : (msg.image?.caption ?? msg.document?.caption ?? msg.video?.caption ?? `[${type}]`)

    return {
      from:       msg.from as string,
      content,
      externalId: msg.id as string,
      timestamp:  new Date(parseInt(msg.timestamp as string) * 1000).toISOString(),
      type:       type === 'text' ? 'text'
               : type === 'image' ? 'image'
               : type === 'audio' || type === 'voice' ? 'audio'
               : type === 'video' ? 'video'
               : type === 'document' ? 'document'
               : 'other',
    }
  }

  parseStatus(payload: unknown): StatusUpdate | null {
    const p       = payload as any
    const value   = p?.entry?.[0]?.changes?.[0]?.value
    const statusObj = value?.statuses?.[0]
    if (!statusObj) return null
    const status = STATUS_MAP[statusObj.status as string]
    if (!status) return null
    return { externalId: statusObj.id as string, status }
  }

  // Verify webhook subscription (GET request from Meta)
  handleChallenge(url: URL): string | null {
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === this.config.verifyToken) return challenge
    return null
  }

  // Verify HMAC-SHA256 signature on POST payloads
  verifySignature(body: string, signature: string | null): boolean {
    if (!signature) return false
    const expected = `sha256=${createHmac('sha256', this.config.appSecret).update(body).digest('hex')}`
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch {
      return false
    }
  }

  async testConnection(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await fetch(`${GRAPH}/${this.config.phoneNumberId}?fields=display_phone_number,verified_name`, {
        headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
      })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const data = await res.json()
      return { ok: true, detail: data?.display_phone_number ?? undefined }
    } catch (err: any) {
      return { ok: false, detail: err?.message }
    }
  }
}
