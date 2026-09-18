import { cache } from 'react'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import type {
  TenantContext, UserRole, JwtClaims, AppModule,
  ResolvedPermissions, ResolvedScopes,
} from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { getCachedMember, getCachedRolePermissions } from '@/lib/cached-queries'
import {
  resolvePermissions, resolveScopes, hasLevel,
  NO_PERMISSIONS, ALL_PERMISSIONS, ALL_SCOPES,
} from '@/lib/permissions'

// Resolve permissões + campos derivados do membro a partir das claims do JWT.
// Durante a transição, role_id/provides_services vêm do banco (getCachedMember)
// caso o JWT ainda não os carregue.
async function buildContext(authId: string, meta: Partial<JwtClaims>): Promise<TenantContext> {
  const tenantId = meta.tenant_id ?? null
  const role = (meta.role ?? 'CLIENT') as UserRole
  const isNetworkAdmin = role === 'NETWORK_ADMIN'
  const isClient = role === 'CLIENT'

  // O banco vem ANTES do claim: trocar o cargo de alguém já cadastrado tem
  // efeito na hora. Com a precedência invertida, o `role_id` velho continuava
  // no JWT até o token renovar e a mudança parecia não ter acontecido.
  const member = isClient ? null : await getCachedMember(authId)
  const roleId = member?.roleId ?? meta.role_id ?? null

  // A abrangência segue a mesma regra, pelo mesmo motivo. Ela decide em quais
  // unidades a pessoa trabalha e qual portal ela abre (`app/admin/layout.tsx`
  // manda embora quem tem filial fixa): lendo só do JWT, promover alguém a
  // abrangência de rede o deixava até uma hora trancado fora do portal certo.
  // `undefined` = membro não carregado (cliente final); `null` = rede.
  const branchId = member ? member.branchId : (meta.branch_id ?? null)

  let permissions: ResolvedPermissions
  let scopes: ResolvedScopes
  if (isClient) {
    permissions = NO_PERMISSIONS
    scopes      = ALL_SCOPES
  } else if (isNetworkAdmin) {
    permissions = ALL_PERMISSIONS
    scopes      = ALL_SCOPES
  } else if (roleId && tenantId) {
    const rows  = await getCachedRolePermissions(tenantId, roleId)
    permissions = resolvePermissions(rows)
    scopes      = resolveScopes(rows)
  } else {
    permissions = NO_PERMISSIONS
    scopes      = ALL_SCOPES
  }

  return {
    userId: authId,
    internalUserId: member?.id ?? null,
    userName: member?.name ?? '',
    roleLabel: member?.roleLabel ?? '',
    tenantId,
    branchId,
    role,
    roleId,
    clientId: meta.client_id ?? null,
    permissions,
    scopes,
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

/**
 * Passa se QUALQUER um dos módulos atende o nível — para telas que reúnem
 * assuntos de módulos diferentes (a de configurações junta `settings`, `roles`
 * e `forms`). Cada aba lá dentro ainda checa o seu próprio módulo.
 */
export function assertAnyPermission(
  ctx: TenantContext,
  modules: readonly AppModule[],
  required: 'VIEW' | 'MANAGE',
): void {
  if (!modules.some(m => hasLevel(ctx.permissions[m], required))) {
    throw new Error('Forbidden')
  }
}

/** Versão booleana (para esconder UI / derivar canWrite em pages) */
export function can(ctx: TenantContext, module: AppModule, required: 'VIEW' | 'MANAGE' = 'VIEW'): boolean {
  return hasLevel(ctx.permissions[module], required)
}

/**
 * O cargo pode RECEBER dinheiro do cliente?
 *
 * Caixa e financeiro são portas diferentes para o mesmo gesto: `cashier` recebe
 * e abre/fecha o caixa, `financial` lança e estorna. Quem tem qualquer um dos
 * dois pode fechar uma venda — é o mesmo critério que a tela de atendimento já
 * usa para "Confirmar pagamento".
 *
 * Existe porque o checkout do plano de tratamento exigia `procedures: MANAGE`,
 * o módulo do CATÁLOGO: a recepção precisava poder editar preço de procedimento
 * da rede para receber um plano, e na prática não conseguia fechar nada.
 */
export function podeReceber(ctx: TenantContext): boolean {
  return can(ctx, 'cashier', 'MANAGE') || can(ctx, 'financial', 'MANAGE')
}

/** Barra quem não pode receber. */
export function assertPodeReceber(ctx: TenantContext): void {
  if (!podeReceber(ctx)) throw new Error('Forbidden')
}

/**
 * O cargo enxerga só os próprios registros neste módulo?
 *
 * Substitui a heurística `ctx.providesServices && permissions.agenda !== 'MANAGE'`,
 * que estava repetida em seis lugares e tinha um efeito perverso: dar
 * "Gerenciar" agenda ao profissional para ele poder remarcar fazia com que
 * passasse a ver a agenda de todo mundo.
 */
export function isOwnScope(ctx: TenantContext, module: AppModule): boolean {
  return ctx.scopes[module] === 'OWN'
}

/**
 * `internalUserId` quando o cargo vê só os próprios registros do módulo, `null`
 * quando vê todos — pronto para alimentar o filtro da query.
 */
export function ownerFilter(ctx: TenantContext, module: AppModule): string | null {
  return isOwnScope(ctx, module) ? ctx.internalUserId : null
}


// Destino pós-login: abrangência de filial → dashboard da filial; rede → /admin.
// A autorização fina de cada página é feita por assertPermission.
export function getRedirectPath(_role: string, branchSlug?: string | null): string {
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/admin/dashboard'
}
