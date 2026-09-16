import { createHmac, timingSafeEqual } from 'crypto'
import type { WhatsAppProvider, OfficialConfig } from './types'
import type {
  InboundMsg, InboundMedia, MediaKind, StatusUpdate, OutboundMedia, SendOptions,
} from '@/lib/channels/types'
import { montarIdentidade, classificarIdentificador } from '@/lib/channels/identity'

const GRAPH = 'https://graph.facebook.com/v25.0'

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

  async send(
    to: string, content: string, options?: SendOptions,
  ): Promise<{ externalId: string }> {
    const res = await fetch(`${GRAPH}/${this.config.phoneNumberId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        // Telefone vai em `to`; BSUID vai em `recipient` e o `to` some.
        // Mandar um BSUID em `to` (ou pior, só os dígitos dele) é recusado.
        ...(classificarIdentificador(to) === 'phone'
          ? { to: to.replace(/\D/g, '') }
          : { recipient_type: 'individual', recipient: to }),
        // Citação na Cloud API é `context.message_id`, no nível da mensagem.
        ...(options?.replyToExternalId
          ? { context: { message_id: options.replyToExternalId } }
          : {}),
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

  /**
   * Envia um arquivo.
   *
   * Dois passos, e o primeiro não é opcional: a Cloud API até aceita um `link`,
   * mas então ela precisa alcançar a nossa URL de fora, e o bucket é privado.
   * Subir os bytes e usar o id devolvido tira a rede do caminho.
   */
  async sendMedia(to: string, media: OutboundMedia): Promise<{ externalId: string }> {
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', media.mimeType)
    form.append('file', new Blob([media.bytes], { type: media.mimeType }), media.filename)

    const upload = await fetch(`${GRAPH}/${this.config.phoneNumberId}/media`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
      body:    form,
    })
    if (!upload.ok) {
      const err = await upload.json().catch(() => null)
      throw new Error(`WhatsApp media ${upload.status}: ${JSON.stringify(err?.error ?? {})}`)
    }
    const { id } = await upload.json() as { id?: string }
    if (!id) throw new Error('WhatsApp media: upload sem id')

    // Cada tipo tem seu objeto, e o que ele aceita muda: áudio não tem legenda,
    // documento é o único com nome de arquivo.
    const corpo: Record<string, unknown> =
        media.kind === 'audio'    ? { id }
      : media.kind === 'document' ? { id, filename: media.filename, ...(media.caption && { caption: media.caption }) }
      : { id, ...(media.caption && { caption: media.caption }) }

    const res = await fetch(`${GRAPH}/${this.config.phoneNumberId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...(classificarIdentificador(to) === 'phone'
          ? { to: to.replace(/\D/g, '') }
          : { recipient_type: 'individual', recipient: to }),
        type: media.kind,
        [media.kind]: corpo,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(err?.error ?? {})}`)
    }
    const data = await res.json()
    return { externalId: data.messages?.[0]?.id ?? '' }
  }

  /**
   * Envia um template aprovado.
   *
   * É o único jeito de falar com alguém fora da janela de 24h: a API recusa
   * `type: text` passado o prazo, mas aceita `type: template` sempre.
   */
  async sendTemplate(
    to: string,
    template: { name: string; language: string; components: Array<Record<string, unknown>> },
  ): Promise<{ externalId: string }> {
    const res = await fetch(`${GRAPH}/${this.config.phoneNumberId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...(classificarIdentificador(to) === 'phone'
          ? { to: to.replace(/\D/g, '') }
          : { recipient_type: 'individual', recipient: to }),
        type: 'template',
        template: {
          name:     template.name,
          language: { code: template.language },
          // Só vão os componentes COM variável. Mandar um `body` de parâmetros
          // vazio num template sem variável é recusado com `132000`.
          ...(template.components.length > 0 && { components: template.components }),
        },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(
        `WhatsApp API ${res.status}: ${JSON.stringify(err?.error ?? {})}`,
      )
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

    const kind: MediaKind | null =
        type === 'image' ? 'image'
      : type === 'audio' || type === 'voice' ? 'audio'
      : type === 'video' ? 'video'
      : type === 'document' ? 'document'
      : null

    // A Cloud API não manda a URL: manda um id que exige uma segunda chamada
    // autenticada (`fetchMedia`). O id fica guardado aqui e resolvido depois.
    const media: InboundMedia | undefined = kind
      ? {
          kind,
          mediaId:  msg[type]?.id as string | undefined,
          mimeType: msg[type]?.mime_type as string | undefined,
        }
      : undefined

    // Identidade na Cloud API deixou de ser só o telefone.
    //
    // `contacts[].user_id` e `messages[].from_user_id` trazem o BSUID
    // (`BR.1A2B…`) em todo webhook de mensagem; `wa_id` e `from` são omitidos
    // quando o contato usa username e não houve contato nos últimos 30 dias.
    // Ler só `from` fazia a conversa nascer com `undefined` como identidade.
    const contato = value?.contacts?.[0]
    const identidade = montarIdentidade([
      msg.from,
      contato?.wa_id,
      msg.from_user_id,
      contato?.user_id,
    ])
    if (!identidade) return null

    const out: InboundMsg = {
      externalUserId: identidade.externalUserId,
      phone:          identidade.phone,
      aliases:        identidade.aliases,
      content,
      externalId: msg.id as string,
      timestamp:  new Date(parseInt(msg.timestamp as string) * 1000).toISOString(),
      type:       kind ?? (type === 'text' ? 'text' : 'other'),
      media,
    }

    // nome público do contato: value.contacts[0].profile.name
    const nome = value?.contacts?.[0]?.profile?.name
    if (nome) out.displayName = nome as string

    // Resposta a uma mensagem anterior: a Cloud API põe o id da citada em
    // `context.id`, o mesmo formato que gravamos em `external_id`.
    const citada = msg.context?.id
    if (citada) out.replyToExternalId = String(citada)

    // referral: anúncio click-to-WhatsApp (só na primeira mensagem da conversa)
    const ref = msg.referral
    if (ref) {
      out.referral = {
        sourceType: ref.source_type ?? undefined,
        sourceId:   ref.source_id   ?? undefined,
        sourceUrl:  ref.source_url  ?? undefined,
        ctwaClid:   ref.ctwa_clid   ?? undefined,
        headline:   ref.headline    ?? undefined,
      }
    }

    return out
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

  /**
   * Mídia da Cloud API: dois passos.
   *
   * O webhook manda só o id; `GET /{media-id}` devolve uma URL que expira em
   * minutos e ainda exige o Bearer para baixar. Por isso o download acontece
   * aqui e o arquivo vai para o bucket — guardar a URL não serviria.
   */
  async fetchMedia(media: InboundMedia): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
    if (!media.mediaId) return null
    const auth = { 'Authorization': `Bearer ${this.config.accessToken}` }

    const metaRes = await fetch(`${GRAPH}/${media.mediaId}`, { headers: auth })
    if (!metaRes.ok) return null
    const { url, mime_type } = await metaRes.json()
    if (!url) return null

    const arquivo = await fetch(url as string, { headers: auth })
    if (!arquivo.ok) return null

    return {
      bytes:    await arquivo.arrayBuffer(),
      mimeType: (mime_type as string) ?? media.mimeType ?? 'application/octet-stream',
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
