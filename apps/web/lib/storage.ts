import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

// Buckets PRIVADOS — nunca públicos (dados de prontuário/LGPD).
// Guardamos o PATH no banco e geramos signed URLs (temporárias) para exibir.
export const ANAMNESIS_BUCKET   = 'anamnesis-photos'
export const CLIENT_DOCS_BUCKET  = 'client-documents'

const DEFAULT_EXPIRES = 60 * 60 // 1h

/** Garante que o bucket exista e seja privado. */
export async function ensurePrivateBucket(name: string): Promise<void> {
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
