import { createAdminClient } from '@/lib/supabase/admin'
import type { InboundMedia, SendProvider } from '@/lib/channels/types'

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

/** Provedor que entrega URL pública e sem autenticação (Z-API). */
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
