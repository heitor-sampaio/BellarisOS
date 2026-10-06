import 'server-only'
import { createAdminClient } from './supabase/admin'
import { ler } from './db'

// Buckets PRIVADOS — nunca públicos (dados de prontuário/LGPD).
// Guardamos o PATH no banco e geramos signed URLs (temporárias) para exibir.
export const ANAMNESIS_BUCKET   = 'anamnesis-photos'
export const CLIENT_DOCS_BUCKET  = 'client-documents'
/** PDFs enviados como modelo de termo/contrato: `<tenant>/<sha256>.pdf`. */
export const MODELOS_DE_DOCUMENTO_BUCKET = 'modelos-de-documento'
/** Termos e contratos assinados: a digitalização do papel e o PDF final. */
export const DOCUMENTOS_ASSINADOS_BUCKET = 'documentos-assinados'

const DEFAULT_EXPIRES = 60 * 60 // 1h

// Bucket que já se viu existir não some. Conferir de novo a cada upload era
// uma chamada a mais ao Storage por arquivo, listando TODOS os buckets — e,
// sob carga, a que falhava ou demorava: "Não consegui listar os buckets" no
// meio da assinatura no papel, e o chamado preso em "Enviando…" (2026-10-05).
const bucketsConfirmados = new Set<string>()

/** Garante que o bucket exista e seja privado (uma vez por processo). */
export async function ensurePrivateBucket(name: string): Promise<void> {
  if (bucketsConfirmados.has(name)) return
  const admin = createAdminClient()
  const buckets = await ler(admin.storage.listBuckets(), 'listar os buckets')
  if (!buckets?.find(b => b.name === name)) {
    // Dois uploads simultâneos podem criar o mesmo bucket: "já existe" é o
    // resultado que se queria. Qualquer outra falha para o fluxo — sem ela, o
    // upload seguinte falharia com uma mensagem que não aponta para cá.
    const { error } = await admin.storage.createBucket(name, { public: false })
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Não consegui criar o bucket ${name}: ${error.message}`)
    }
  }
  bucketsConfirmados.add(name)
}

/** Signed URL para um único path (null se path vazio/erro). */
export async function getSignedUrl(bucket: string, path: string | null | undefined, expiresIn = DEFAULT_EXPIRES): Promise<string | null> {
  if (!path) return null
  // Contrato: null em erro — é a foto/arquivo na tela, e a tela sabe mostrar
  // "sem imagem". Mas a falha fica registrada, não some.
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) console.error(`[getSignedUrl] ${bucket}/${path}:`, error.message)
  return data?.signedUrl ?? null
}

/** Signed URLs em lote → mapa { path: signedUrl }. */
export async function getSignedUrls(bucket: string, paths: (string | null | undefined)[], expiresIn = DEFAULT_EXPIRES): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  if (!unique.length) return map
  // Mesmo contrato de getSignedUrl: o que falhar fica sem URL, e registrado.
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrls(unique, expiresIn)
  if (error) console.error(`[getSignedUrls] ${bucket} (${unique.length}):`, error.message)
  for (const it of data ?? []) {
    if (it.path && it.signedUrl) map[it.path] = it.signedUrl
  }
  return map
}
