import { cache } from 'react'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
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

/**
 * Resolve o TenantContext a partir de um access token (Authorization: Bearer),
 * SEM depender de cookies. Usado pelas rotas /api/ext consumidas pela extensão
 * de navegador, que roda em contexto separado e não tem os cookies do app.
 * Valida o token via getUser() (o JWT carrega as claims em app_metadata).
 */
export async function getTenantContextFromToken(accessToken: string): Promise<TenantContext> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase env ausente')

  const supabase = createSupabaseJsClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.getUser(accessToken)
  const user = data?.user
  if (error || !user) throw new Error('Unauthenticated')

  const meta = (user.app_metadata ?? {}) as Partial<JwtClaims>
  const authId = user.id
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
}

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
  if (role === 'NETWORK_ADMIN')      return '/admin/dashboard'
  if (role === 'FINANCIAL')          return '/admin/financeiro'
  if (role === 'MARKETING')          return '/admin/marketing'
  if (role === 'COMERCIAL')          return '/admin/crm'
  if (role === 'GERENTE_COMERCIAL')  return '/admin/comercial'
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/login'
}

/** Roles que operam em nível de rede (sem branch_id no JWT) */
export const NETWORK_LEVEL_ROLES: UserRole[] = ['NETWORK_ADMIN', 'FINANCIAL', 'MARKETING', 'COMERCIAL', 'GERENTE_COMERCIAL']
