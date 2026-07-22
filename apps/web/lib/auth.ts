import { cache } from 'react'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import type { TenantContext, UserRole, JwtClaims, AppModule, ResolvedPermissions } from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { getCachedMember, getCachedRolePermissions } from '@/lib/cached-queries'
import { resolvePermissions, hasLevel, NO_PERMISSIONS, ALL_PERMISSIONS } from '@/lib/permissions'

// Resolve permissões + campos derivados do membro a partir das claims do JWT.
// Durante a transição, role_id/provides_services vêm do banco (getCachedMember)
// caso o JWT ainda não os carregue.
async function buildContext(authId: string, meta: Partial<JwtClaims>): Promise<TenantContext> {
  const tenantId = meta.tenant_id ?? null
  const role = (meta.role ?? 'CLIENT') as UserRole
  const isNetworkAdmin = role === 'NETWORK_ADMIN'
  const isClient = role === 'CLIENT'

  const member = isClient ? null : await getCachedMember(authId)
  const roleId = meta.role_id ?? member?.roleId ?? null

  let permissions: ResolvedPermissions
  if (isClient) {
    permissions = NO_PERMISSIONS
  } else if (isNetworkAdmin) {
    permissions = ALL_PERMISSIONS
  } else if (roleId && tenantId) {
    permissions = resolvePermissions(await getCachedRolePermissions(tenantId, roleId))
  } else {
    permissions = NO_PERMISSIONS
  }

  return {
    userId: authId,
    internalUserId: member?.id ?? null,
    tenantId,
    branchId: meta.branch_id ?? null,
    role,
    roleId,
    clientId: meta.client_id ?? null,
    permissions,
    providesServices: member?.providesServices ?? false,
    isNetworkAdmin,
    isClient,
  }
}

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

  return buildContext(authId, meta)
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
  return buildContext(user.id, meta)
}

/** Gate do portal do cliente (role CLIENT). */
export function assertClient(ctx: TenantContext): void {
  if (!ctx.isClient) {
    throw new Error('Forbidden')
  }
}

/**
 * Autorização por funcionalidade — fonte única de verdade.
 * NETWORK_ADMIN passa em tudo (permissions = ALL_PERMISSIONS).
 * `required` é o nível mínimo exigido para a operação ('VIEW' | 'MANAGE').
 */
export function assertPermission(
  ctx: TenantContext,
  module: AppModule,
  required: 'VIEW' | 'MANAGE',
): void {
  if (!hasLevel(ctx.permissions[module], required)) {
    throw new Error('Forbidden')
  }
}

/** Versão booleana (para esconder UI / derivar canWrite em pages) */
export function can(ctx: TenantContext, module: AppModule, required: 'VIEW' | 'MANAGE' = 'VIEW'): boolean {
  return hasLevel(ctx.permissions[module], required)
}

export function assertBranchAccess(ctx: TenantContext): asserts ctx is TenantContext & { branchId: string } {
  if (!ctx.branchId) throw new Error('Branch context required')
}

export function assertNetworkAccess(ctx: TenantContext): asserts ctx is TenantContext & { tenantId: string } {
  if (!ctx.tenantId) throw new Error('Tenant context required')
}

// Destino pós-login: abrangência de filial → dashboard da filial; rede → /admin.
// A autorização fina de cada página é feita por assertPermission.
export function getRedirectPath(_role: string, branchSlug?: string | null): string {
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/admin/dashboard'
}
