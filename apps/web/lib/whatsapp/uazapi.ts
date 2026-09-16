import type { WhatsAppProvider, UazapiConfig } from './types'
import type {
  InboundMsg, InboundMedia, MediaKind, StatusUpdate, OutboundMedia, SendOptions,
} from '@/lib/channels/types'
import {
  montarIdentidade, classificarIdentificador, ehConversaDeGrupo,
} from '@/lib/channels/identity'

/**
 * uazapi — provedor não oficial de WhatsApp.
 *
 * Substituiu a Z-API por três motivos: não tem teto de instâncias por chave,
 * custa uma fração, e sai por um proxy gerenciado por instância — que é o que
 * impede o banimento de uma clínica escalar para as outras do mesmo IP.
 *
 * A base URL vem da CONFIG, não de constante: cada conta tem seu subdomínio, e
 * instâncias criadas antes de uma troca de servidor precisam continuar apontando
 * para o antigo.
 */

/**
 * Ids de mensagem na uazapi vêm em duas formas.
 *
 * Os endpoints devolvem o COMPOSTO (`{owner}:{messageid}`) e o webhook traz os
 * dois. Gravamos sempre o curto em `messages.external_id`; se `parseStatus`
 * devolvesse o composto, `updateMessageStatus` nunca casaria e toda mensagem
 * ficaria eternamente em um tique — funcionando na aparência e quebrada de fato.
 */
function idCurto(valor: unknown): string {
  return String(valor ?? '').split(':').pop() ?? ''
}

/**
 * Telefone da conta conectada, a partir do JID.
 *
 * O JID do dono vem com o número do aparelho colado
 * (`554861360066:3@s.whatsapp.net`). Cortar só no `@` deixa o `:3` no telefone
 * — que é o que a tela mostra e o que vai para `connectedPhone`. Aqui a parte
 * de antes do `:` é sempre o número, ao contrário de `idCurto`, onde o que
 * interessa é a parte de depois.
 */
export function telefoneDoJid(jid: string | null | undefined): string | null {
  const antesDoArroba = String(jid ?? '').split('@')[0] ?? ''
  const numero = antesDoArroba.split(':')[0] ?? ''
  return numero || null
}

/** Texto pode vir em quatro campos, e `content` às vezes é objeto. */
function primeiroTexto(...candidatos: unknown[]): string | undefined {
  for (const c of candidatos) {
    if (typeof c === 'string' && c.trim()) return c
  }
  return undefined
}

const TIPO_DE_MIDIA: Record<string, MediaKind> = {
  image: 'image', video: 'video', audio: 'audio',
  ptt: 'audio',        // nota de voz
  sticker: 'image',
  document: 'document', file: 'document',
}

/** Baileys usa inteiros para ACK; a uazapi repassa ora número, ora string. */
const STATUS_NUMERICO: Record<number, StatusUpdate['status'] | null> = {
  0: 'failed',
  1: null,          // pending — não é transição que interesse
  2: 'sent',
  3: 'delivered',
  4: 'read',
  5: 'read',        // played
}

const STATUS_TEXTO: Record<string, StatusUpdate['status'] | null> = {
  ERROR: 'failed', FAILED: 'failed',
  PENDING: null,
  SERVER_ACK: 'sent', SENT: 'sent',
  DELIVERY_ACK: 'delivered', DELIVERED: 'delivered',
  READ: 'read', PLAYED: 'read',
}

export class UazapiProvider implements WhatsAppProvider {
  private token: string
  private base:  string

  constructor(config: UazapiConfig) {
    this.token = config.token
    this.base  = (config.baseUrl ?? process.env.UAZAPI_BASE_URL ?? '').replace(/\/$/, '')
  }

  private async chamar(path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', token: this.token },
      body:    body ? JSON.stringify(body) : undefined,
    })
    const texto = await res.text()
    let json: any = null
    try { json = texto ? JSON.parse(texto) : null } catch { /* não-JSON */ }

    if (!res.ok) {
      throw new Error(`uazapi ${path} ${res.status}: ${json?.error ?? json?.message ?? texto}`)
    }
    return json
  }

  /** Telefone vai em dígitos; `@lid` vai inteiro, senão a uazapi não resolve. */
  private destino(to: string): string {
    return classificarIdentificador(to) === 'phone' ? to.replace(/\D/g, '') : to
  }

  async send(
    to: string, content: string, options?: SendOptions,
  ): Promise<{ externalId: string }> {
    const corpo: Record<string, unknown> = {
      number: this.destino(to),
      text:   content,
      linkPreview: false,
    }
    // `replyid` aceita tanto o id curto quanto o composto; mandamos o curto,
    // que é o que guardamos em `messages.external_id`.
    if (options?.replyToExternalId) corpo.replyid = options.replyToExternalId

    const data = await this.chamar('/send/text', corpo)
    return { externalId: data?.messageid ? String(data.messageid) : idCurto(data?.id) }
  }

  /**
   * Edita uma mensagem já enviada.
   *
   * O WhatsApp só aceita edição nos primeiros 15 minutos; passando disso a
   * uazapi devolve erro, que sobe como está para quem chamou.
   */
  async editMessage(externalId: string, texto: string): Promise<void> {
    await this.chamar('/message/edit', { id: externalId, text: texto })
  }

  /**
   * Envia arquivo.
   *
   * Um endpoint só, com `type` discriminando — bem melhor que a Z-API, que
   * tinha rota diferente por tipo e ainda pedia a extensão no caminho.
   *
   * `file` vai como URL (link assinado do bucket, 1h) e não base64: um vídeo de
   * 16 MB viraria 21 MB de JSON.
   */
  async sendMedia(to: string, media: OutboundMedia): Promise<{ externalId: string }> {
    const corpo: Record<string, unknown> = {
      number: this.destino(to),
      type:   media.kind,
      file:   media.url,
    }
    // Áudio não tem legenda em lugar nenhum do WhatsApp.
    if (media.kind !== 'audio' && media.caption) corpo.text = media.caption
    if (media.kind === 'document') corpo.docName = media.filename

    const data = await this.chamar('/send/media', corpo)
    return { externalId: data?.messageid ? String(data.messageid) : idCurto(data?.id) }
  }

  /**
   * Baixa mídia recebida.
   *
   * Tenta a URL direta primeiro; se não houver, pede à uazapi. `generate_mp3`
   * não é capricho: nota de voz crua vem em ogg/opus, que o Safari não toca — a
   * bolha mostraria um player travado em 0:00.
   */
  /**
   * Nome do contato pelo `/chat/details`.
   *
   * `name` é o nome consolidado pela uazapi; `wa_name` é o que a pessoa põe no
   * perfil (o pushName) e `wa_contactName` é o da agenda do celular conectado —
   * os dois voltam string vazia quando não existem, e vazio não é nome.
   */
  async fetchDisplayName(externalUserId: string): Promise<string | null> {
    try {
      const data = await this.chamar('/chat/details', { number: this.destino(externalUserId) })
      for (const campo of [data?.name, data?.wa_name, data?.wa_contactName]) {
        if (typeof campo === 'string' && campo.trim()) return campo.trim()
      }
      return null
    } catch {
      return null
    }
  }

  async fetchMedia(media: InboundMedia): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
    if (media.url) {
      try {
        const res = await fetch(media.url)
        if (res.ok) {
          return {
            bytes:    await res.arrayBuffer(),
            mimeType: res.headers.get('content-type') ?? media.mimeType ?? 'application/octet-stream',
          }
        }
      } catch { /* cai no download pela API */ }
    }

    if (!media.mediaId) return null

    try {
      const data = await this.chamar('/message/download', {
        id: media.mediaId, return_link: true, generate_mp3: media.kind === 'audio',
      })
      const url = data?.fileURL ?? data?.fileUrl
      if (!url) return null

      const arquivo = await fetch(url as string)
      if (!arquivo.ok) return null
      return {
        bytes:    await arquivo.arrayBuffer(),
        mimeType: data?.mimetype ?? arquivo.headers.get('content-type') ?? 'application/octet-stream',
      }
    } catch {
      return null
    }
  }

  /**
   * Lê uma entrega do webhook.
   *
   * O payload real é PLANO (`{owner, chat, message, token}`), ao contrário do
   * `{event, instance, data}` que a documentação mostra — daí o `p?.data ?? p`.
   */
  parseInbound(payload: unknown): InboundMsg | null {
    const p = payload as any
    const raiz = p?.data ?? p
    const m = raiz?.message
    const c = raiz?.chat
    if (!m) return null

    // Eco: mensagem que nós mesmos enviamos volta como webhook, e o app da
    // clínica no celular também. Sem o corte, ela entra como se fosse do cliente
    // e ainda zera o "aguardando resposta".
    if (m.fromMe === true) return null

    // Grupo e lista viram lead no funil com o nome do grupo no lugar do cliente.
    if (m.isGroup === true || ehConversaDeGrupo(m.chatid, c?.phone)) return null

    // `sender_pn` primeiro: é o telefone de verdade, enquanto `sender` pode ser
    // um @lid. Isso faz a conversa nascer com telefone sempre que possível — e
    // de quebra evita ter de enviar para um @lid depois.
    const identidade = montarIdentidade([m.sender_pn, c?.phone, m.chatid, m.sender])
    if (!identidade) return null

    const kind = m.mediaType ? TIPO_DE_MIDIA[String(m.mediaType).toLowerCase()] : undefined
    const media: InboundMedia | undefined = kind
      ? {
          kind,
          url:      m.file ?? m.fileURL ?? m.mediaUrl ?? undefined,
          mediaId:  m.owner && m.messageid ? `${m.owner}:${m.messageid}` : (m.id ?? undefined),
          mimeType: m.mimetype ?? undefined,
        }
      : undefined

    // Figurinha é imagem para efeito de download e de bucket, mas não para a
    // tela: renderizada do tamanho de uma foto, ocupa a conversa inteira. O
    // rótulo preserva a distinção que `media_type` perde ao virar 'image' —
    // não há coluna para isso, e o texto de apoio já viaja junto.
    const ehSticker = String(m.mediaType ?? '').toLowerCase() === 'sticker'

    // ⚠️ `content` é OBJETO em resposta de botão e de lista. Sem filtrar por
    // string, a conversa gravaria "[object Object]".
    const texto = primeiroTexto(m.text, m.body, m.caption, m.content)
      ?? (media ? (ehSticker ? '[sticker]' : `[${media.kind}]`) : undefined)
    if (!texto) return null

    // Timestamp vem em segundos ou em milissegundos, dependendo do evento.
    const ts = Number(m.messageTimestamp ?? m.timestamp ?? Date.now())
    const timestamp = new Date(ts > 1e12 ? ts : ts * 1000).toISOString()

    const out: InboundMsg = {
      externalUserId: identidade.externalUserId,
      phone:          identidade.phone,
      aliases:        identidade.aliases,
      content:        texto,
      externalId:     m.messageid ? String(m.messageid) : idCurto(m.id),
      timestamp,
      type:           media ? (media.kind === 'document' ? 'document' : media.kind) : 'text',
      media,
    }

    const nome = c?.name ?? m.senderName ?? m.pushName
    if (nome) out.displayName = String(nome)

    // Resposta a uma mensagem anterior. Vem no id curto ou composto; guardamos
    // sempre o curto, para casar com o que está em `messages.external_id`.
    const citada = m.quoted ?? m.quotedMsgId ?? m.contextInfo?.stanzaId
    if (citada) out.replyToExternalId = idCurto(citada)

    return out
  }

  /**
   * Lê um recibo de entrega.
   *
   * Chega em três formas, porque a uazapi repassa o evento do Baileys quase
   * cru: objeto de mensagem com `status`, array `[{key, update}]` nativo, ou
   * par `messageid` + código.
   */
  parseStatus(payload: unknown): StatusUpdate | null {
    const p = payload as any
    const raiz = p?.data ?? p

    // Forma 2: array nativo do Baileys.
    const doArray = Array.isArray(raiz) ? raiz[0] : Array.isArray(raiz?.messages) ? raiz.messages[0] : null
    if (doArray?.key?.id && doArray?.update?.status !== undefined) {
      const st = STATUS_NUMERICO[Number(doArray.update.status)]
      return st ? { externalId: idCurto(doArray.key.id), status: st } : null
    }

    // Formas 1 e 3: campo de status no objeto de mensagem.
    const m = raiz?.message ?? raiz
    const bruto = m?.status ?? m?.ack ?? m?.messageStatus
    if (bruto === undefined || bruto === null) return null

    const id = m?.messageid ?? m?.id ?? m?.key?.id
    if (!id) return null

    const st = typeof bruto === 'number'
      ? STATUS_NUMERICO[bruto]
      : STATUS_TEXTO[String(bruto).toUpperCase()]

    return st ? { externalId: idCurto(id), status: st } : null
  }

  async testConnection(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await fetch(`${this.base}/instance/status`, {
        headers: { token: this.token },
      })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const data = await res.json()

      const conectado = data?.status?.connected === true && data?.status?.loggedIn !== false
      return {
        ok: conectado,
        detail: data?.status?.jid ?? data?.instance?.status ?? undefined,
      }
    } catch (err: any) {
      return { ok: false, detail: err?.message }
    }
  }
}
