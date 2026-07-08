// TEMPORÁRIO — endpoint de diagnóstico de latência. REMOVER após a investigação.
// Mede o custo real de cada round-trip Railway↔Supabase (PostgREST + Auth).
export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const admin  = createAdminClient()
  const server = await createClient()
  const r: Record<string, unknown> = {}

  // 1 round-trip PostgREST puro (rede compute→Supabase→compute)
  let t = performance.now()
  await admin.from('tenants').select('id').limit(1)
  r.postgrestOne = Math.round((performance.now() - t) * 10) / 10

  // getUser (rede → GoTrue) vs getClaims (local ES256, sem rede)
  t = performance.now()
  await server.auth.getUser()
  r.getUser = Math.round((performance.now() - t) * 10) / 10

  t = performance.now()
  const c = await server.auth.getClaims()
  r.getClaims = Math.round((performance.now() - t) * 10) / 10

  // Confirma o caminho das claims custom (tenant_id no topo vs app_metadata)
  const claims = (c.data?.claims ?? null) as Record<string, unknown> | null
  r.claimsShape = claims ? Object.keys(claims) : null
  r.appMetadata = claims && typeof claims.app_metadata === 'object' && claims.app_metadata !== null
    ? Object.keys(claims.app_metadata as Record<string, unknown>)
    : null
  r.tenantIdTop = claims ? claims.tenant_id ?? null : null
  r.tenantIdMeta = claims && typeof claims.app_metadata === 'object' && claims.app_metadata !== null
    ? (claims.app_metadata as Record<string, unknown>).tenant_id ?? null
    : null

  // 5x warm — round-trip médio PostgREST
  const times: number[] = []
  for (let i = 0; i < 5; i++) {
    t = performance.now()
    await admin.from('tenants').select('id').limit(1)
    times.push(Math.round((performance.now() - t) * 10) / 10)
  }
  r.warmAvg = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
  r.times = times

  // 3x getClaims warm (após JWKS cacheado deve ser ~0ms se local)
  const claimTimes: number[] = []
  for (let i = 0; i < 3; i++) {
    t = performance.now()
    await server.auth.getClaims()
    claimTimes.push(Math.round((performance.now() - t) * 10) / 10)
  }
  r.getClaimsWarm = claimTimes

  return Response.json(r)
}
