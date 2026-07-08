import { cache } from 'react'
import type { TenantContext, UserRole, JwtClaims } from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { getCachedInternalUserId } from '@/lib/cached-queries'

export const getTenantContext = cache(async function getTenantContext(): Promise<TenantContext> {
  const supabase = await createClient()

  // getClaims() valida o JWT LOCALMENTE (ES256/WebCrypto) — sem round-trip ao
  // servidor de Auth. Em token expirado ele renova via getSession() (o refresh
  // token de 7 dias permanece válido). Substitui o antigo getUser() (rede).
  const { data: claimsData, error } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (error || !claims?.sub) throw new Error('Unauthenticated')

  // As claims custom ficam sob `app_metadata` no payload do JWT (setadas via
  // set_user_claims/set_client_claims). O `role` de topo do JWT é o role do
  // Postgres ('authenticated') — NÃO usar; usar sempre app_metadata.role.
  const meta = (claims.app_metadata ?? {}) as Partial<JwtClaims>
  const authId = claims.sub as string

  // users.id interno — cacheado por auth_id (evita round-trip por request)
  const internalUserId = await getCachedInternalUserId(authId)

  return {
    userId: authId,
    internalUserId,
    tenantId: meta.tenant_id ?? null,
    branchId: meta.branch_id ?? null,
    role: meta.role ?? 'CLIENT',
    clientId: meta.client_id ?? null,
    isNetworkAdmin: meta.role === 'NETWORK_ADMIN',
    isClient: (meta.role ?? 'CLIENT') === 'CLIENT',
  }
})

export function assertRole(ctx: TenantContext, allowed: UserRole[]): void {
  if (!allowed.includes(ctx.role)) {
    throw new Error('Forbidden')
  }
}

export function assertBranchAccess(ctx: TenantContext): asserts ctx is TenantContext & { branchId: string } {
  if (!ctx.branchId) throw new Error('Branch context required')
}

export function assertNetworkAccess(ctx: TenantContext): asserts ctx is TenantContext & { tenantId: string } {
  if (!ctx.tenantId) throw new Error('Tenant context required')
}

export function getRedirectPath(role: UserRole, branchSlug?: string | null): string {
  if (role === 'NETWORK_ADMIN') return '/admin/dashboard'
  if (role === 'FINANCIAL')     return '/admin/financeiro'
  if (role === 'MARKETING')     return '/admin/marketing'
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/login'
}

/** Roles que operam em nível de rede (sem branch_id no JWT) */
export const NETWORK_LEVEL_ROLES: UserRole[] = ['NETWORK_ADMIN', 'FINANCIAL', 'MARKETING']
