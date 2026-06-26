import type { TenantContext, UserRole, JwtClaims } from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'

export async function getTenantContext(): Promise<TenantContext> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) throw new Error('Unauthenticated')

  const claims = (user.app_metadata ?? {}) as JwtClaims

  // Resolve o users.id interno (diferente do auth user id)
  const { data: userRecord } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    internalUserId: userRecord?.id ?? null,
    tenantId: claims.tenant_id ?? null,
    branchId: claims.branch_id ?? null,
    role: claims.role ?? 'CLIENT',
    clientId: claims.client_id ?? null,
    isNetworkAdmin: claims.role === 'NETWORK_ADMIN',
    isClient: (claims.role ?? 'CLIENT') === 'CLIENT',
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
  if (role === 'NETWORK_ADMIN') return '/admin/dashboard'
  if (role === 'FINANCIAL')     return '/admin/financeiro'
  if (role === 'MARKETING')     return '/admin/marketing'
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/login'
}

/** Roles que operam em nível de rede (sem branch_id no JWT) */
export const NETWORK_LEVEL_ROLES: UserRole[] = ['NETWORK_ADMIN', 'FINANCIAL', 'MARKETING']
