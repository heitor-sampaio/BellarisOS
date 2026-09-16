import { createAdminClient } from '@/lib/supabase/admin'
import type { InboundMedia, SendProvider, MediaKind } from '@/lib/channels/types'

const BUCKET = 'inbox-media'

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'audio/ogg':  'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4':  'm4a',
  'video/mp4':  'mp4',
  'application/pdf': 'pdf',
}

/**
 * Baixa a mídia recebida e guarda no bucket.
 *
 * ⚠️ Guardar a URL do provedor não funciona: a da Meta expira em horas e exige
 * token para abrir, então a foto sumiria do histórico. Numa clínica isso é
 * conteúdo clínico — a cliente manda foto da área a tratar.
 *
 * Nunca lança: mídia que não desce não pode impedir a mensagem de entrar. O
 * texto (ou o "[imagem]") chega de qualquer jeito e o erro vai para o log.
 */
export async function guardarMidia(
  tenantId:       string,
  conversationId: string,
  externalId:     string,
  media:          InboundMedia,
  provider:       SendProvider,
): Promise<{ path: string } | null> {
  try {
    const baixado = provider.fetchMedia
      ? await provider.fetchMedia(media)
      : await baixarDireto(media)

    if (!baixado || baixado.bytes.byteLength === 0) return null

    const ext  = EXTENSAO[baixado.mimeType.split(';')[0]!] ?? 'bin'
    // O id da mensagem no provedor já é único e estável: reentrega do webhook
    // sobrescreve o mesmo arquivo em vez de duplicar.
    const path = `${tenantId}/${conversationId}/${externalId}.${ext}`

    const { error } = await createAdminClient()
      .storage
      .from(BUCKET)
      .upload(path, baixado.bytes, { contentType: baixado.mimeType, upsert: true })

    if (error) { console.error('[guardarMidia] upload:', error.message); return null }
    return { path }
  } catch (err) {
    console.error('[guardarMidia]', err)
    return null
  }
}

/** Provedor que entrega URL pública e sem autenticação (uazapi). */
async function baixarDireto(
  media: InboundMedia,
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  if (!media.url) return null
  const res = await fetch(media.url)
  if (!res.ok) return null
  return {
    bytes:    await res.arrayBuffer(),
    mimeType: res.headers.get('content-type') ?? media.mimeType ?? 'application/octet-stream',
  }
}

/**
 * Link temporário para exibir a mídia na conversa.
 *
 * O bucket é privado — a foto de uma cliente não pode ficar acessível por URL
 * adivinhável. Uma hora cobre a leitura da tela com folga.
 */
export async function urlDaMidia(path: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error) { console.error('[urlDaMidia]', error.message); return null }
  return data?.signedUrl ?? null
}

// -- Envio ---------------------------------------------------------------------

/**
 * O que a Meta aceita, por tipo.
 *
 * Os limites são dela, não nossos. Barrar aqui evita a pessoa esperar o upload
 * inteiro para receber um erro numérico da Graph API no fim.
 */
export const LIMITES_MIDIA: Record<MediaKind, { mb: number; mimes: string[] }> = {
  image: {
    mb: 5,
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  video: {
    mb: 16,
    mimes: ['video/mp4', 'video/3gpp'],
  },
  audio: {
    mb: 16,
    mimes: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/mp3'],
  },
  document: {
    mb: 100,
    mimes: [],   // qualquer coisa vira documento
  },
}

/** De qual tipo é este arquivo, do ponto de vista do WhatsApp. */
export function classificarArquivo(mimeType: string): MediaKind {
  const mime = mimeType.split(';')[0]!.trim().toLowerCase()
  if (LIMITES_MIDIA.image.mimes.includes(mime)) return 'image'
  if (LIMITES_MIDIA.video.mimes.includes(mime)) return 'video'
  if (LIMITES_MIDIA.audio.mimes.includes(mime)) return 'audio'
  // GIF e outras imagens que a Meta não aceita como `image` viram documento —
  // é isso ou a mensagem ser recusada.
  return 'document'
}

/** `null` quando está tudo certo; senão, o motivo em português. */
export function validarArquivo(kind: MediaKind, mimeType: string, bytes: number): string | null {
  const limite = LIMITES_MIDIA[kind]
  const mb     = bytes / (1024 * 1024)

  if (bytes === 0)    return 'O arquivo está vazio.'
  if (mb > limite.mb) {
    return `${kind === 'document' ? 'Documento' : kind === 'image' ? 'Imagem' : kind === 'video' ? 'Vídeo' : 'Áudio'}`
      + ` pode ter no máximo ${limite.mb} MB (este tem ${mb.toFixed(1)} MB).`
  }
  if (limite.mimes.length > 0 && !limite.mimes.includes(mimeType.split(';')[0]!.toLowerCase())) {
    return `O formato ${mimeType} não é aceito pelo WhatsApp neste tipo.`
  }
  return null
}

/**
 * Guarda o arquivo que a clínica está mandando.
 *
 * Diferente de `guardarMidia`, este LANÇA em caso de erro: aqui a pessoa está
 * olhando a tela esperando o envio, e falhar em silêncio deixaria uma mensagem
 * sem anexo sem ninguém entender por quê.
 */
export async function guardarUpload(
  tenantId:       string,
  conversationId: string,
  bytes:          ArrayBuffer,
  mimeType:       string,
  filename:       string,
): Promise<{ path: string; url: string }> {
  const ext  = filename.split('.').pop()?.toLowerCase()
    || EXTENSAO[mimeType.split(';')[0]!]
    || 'bin'
  // `out-` separa do que foi recebido, e o random evita que dois envios do
  // mesmo arquivo em segundos diferentes se sobrescrevam.
  const path = `${tenantId}/${conversationId}/out-${crypto.randomUUID()}.${ext}`

  const { error } = await createAdminClient()
    .storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false })

  if (error) throw new Error(`Falha ao guardar o arquivo: ${error.message}`)

  const url = await urlDaMidia(path)
  if (!url) throw new Error('Falha ao gerar o link do arquivo.')

  return { path, url }
}
