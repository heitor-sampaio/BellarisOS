import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSignedUrls, MODELOS_DE_DOCUMENTO_BUCKET } from '@/lib/storage'
import { imagensDoDocumento, lerConteudo } from './arvore'

/**
 * As imagens dos documentos (o logo da clínica, por exemplo).
 *
 * Moram em `modelos-de-documento/<rede>/imagens/<sha256>.<ext>` — endereçadas
 * pelo CONTEÚDO, então o arquivo de um caminho nunca muda. A árvore guarda o
 * caminho e o sha256, e o hash do documento assinado cobre a imagem exata.
 *
 * A tela recebe URLs temporárias à parte (`urlsDasImagens`): a URL nunca entra
 * na forma canônica. O PDF baixa o arquivo e CONFERE o sha256 antes de desenhar.
 */

/** URLs temporárias das imagens de um conteúdo gravado (v1 não tem nenhuma). */
export async function urlsDasImagens(conteudo: string | null): Promise<Record<string, string>> {
  const doc = conteudo ? lerConteudo(conteudo) : null
  const caminhos = doc ? imagensDoDocumento(doc).map(i => i.caminho) : []
  if (!caminhos.length) return {}
  return getSignedUrls(MODELOS_DE_DOCUMENTO_BUCKET, caminhos, 30 * 60)
}

/** Os bytes de uma imagem, só se o hash bater — senão o PDF não sai. */
export async function bytesDaImagem(caminho: string, sha256: string): Promise<Uint8Array> {
  const { data, error } = await createAdminClient().storage.from(MODELOS_DE_DOCUMENTO_BUCKET).download(caminho)
  if (error || !data) throw new Error(`Não consegui baixar a imagem do documento (${error?.message ?? 'vazia'}).`)
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error('A imagem do documento não confere com a que foi assinada.')
  }
  return bytes
}
