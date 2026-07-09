import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Buckets PRIVADOS — nunca públicos (dados de prontuário/LGPD).
// Guardamos o PATH no banco e geramos signed URLs (temporárias) para exibir.
export const ANAMNESIS_BUCKET   = 'anamnesis-photos'
export const CLIENT_DOCS_BUCKET  = 'client-documents'

const DEFAULT_EXPIRES = 60 * 60 // 1h

/** Garante que o bucket exista e seja privado. */
export async function ensurePrivateBucket(name: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.storage.listBuckets()
  if (!data?.find(b => b.name === name)) {
    await admin.storage.createBucket(name, { public: false })
  }
}

/** Signed URL para um único path (null se path vazio/erro). */
export async function getSignedUrl(bucket: string, path: string | null | undefined, expiresIn = DEFAULT_EXPIRES): Promise<string | null> {
  if (!path) return null
  const { data } = await createAdminClient().storage.from(bucket).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}

/** Signed URLs em lote → mapa { path: signedUrl }. */
export async function getSignedUrls(bucket: string, paths: (string | null | undefined)[], expiresIn = DEFAULT_EXPIRES): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  if (!unique.length) return map
  const { data } = await createAdminClient().storage.from(bucket).createSignedUrls(unique, expiresIn)
  for (const it of data ?? []) {
    if (it.path && it.signedUrl) map[it.path] = it.signedUrl
  }
  return map
}
