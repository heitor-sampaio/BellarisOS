import type { WhatsAppProvider, InboundMsg, StatusUpdate, ZAPIConfig } from './types'

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
    const phone = to.replace(/\D/g, '')
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
    // Z-API inbound webhook: { phone, text.message, messageId, momment, isStatusReply }
    if (!p?.phone || !p?.text?.message) return null
    return {
      from:       p.phone.replace(/\D/g, ''),
      content:    p.text.message as string,
      externalId: (p.messageId ?? p.zaapId ?? '') as string,
      timestamp:  p.momment
        ? new Date((p.momment as number) * 1000).toISOString()
        : new Date().toISOString(),
      type: 'text',
    }
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
