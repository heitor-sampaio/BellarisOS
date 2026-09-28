import { cache } from 'react'
import { redirect } from 'next/navigation'
import type {
  TenantContext, UserRole, JwtClaims, AppModule,
  ResolvedPermissions, ResolvedScopes, ReportTab,
} from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { getCachedMember, getCachedRolePermissions, getCachedRoleReportTabs } from '@/lib/cached-queries'
import {
  resolvePermissions, resolveScopes, resolveReportTabs, hasLevel,
  NO_PERMISSIONS, ALL_PERMISSIONS, ALL_SCOPES, ALL_REPORT_TABS,
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

  // Membro DESATIVADO não opera, com sessão ou sem. A conta também é bloqueada
  // no Auth ao desativar (não renova o token nem entra de novo), mas o token
  // que já estava na mão vale até expirar — é esta linha que o barra no meio.
  // `redirect` e não `throw`: numa página vira a tela de login, não a de erro.
  if (member && !member.isActive) redirect('/login?acesso=desativado')

  const roleId = member?.roleId ?? meta.role_id ?? null

  // A abrangência segue a mesma regra, pelo mesmo motivo. Ela decide em quais
  // unidades a pessoa trabalha e qual portal ela abre (`app/admin/layout.tsx`
  // manda embora quem tem filial fixa): lendo só do JWT, promover alguém a
  // abrangência de rede o deixava até uma hora trancado fora do portal certo.
  // `undefined` = membro não carregado (cliente final); `null` = rede.
  const branchId = member ? member.branchId : (meta.branch_id ?? null)

  let permissions: ResolvedPermissions
  let scopes: ResolvedScopes
  let reportTabs: ReportTab[]
  if (isClient) {
    permissions = NO_PERMISSIONS
    scopes      = ALL_SCOPES
    reportTabs  = []
  } else if (isNetworkAdmin) {
    permissions = ALL_PERMISSIONS
    scopes      = ALL_SCOPES
    reportTabs  = [...ALL_REPORT_TABS]
  } else if (roleId && tenantId) {
    const [rows, tabRows] = await Promise.all([
      getCachedRolePermissions(tenantId, roleId),
      getCachedRoleReportTabs(tenantId, roleId),
    ])
    permissions = resolvePermissions(rows)
    scopes      = resolveScopes(rows)
    reportTabs  = resolveReportTabs(tabRows)

    // Relatórios sem nenhuma aba é o mesmo que não ter relatórios: sem esta
    // linha o menu mostraria a entrada e a tela abriria vazia, parecendo
    // defeito em vez de permissão.
    if (reportTabs.length === 0) permissions = { ...permissions, reports: 'NONE' }
  } else {
    permissions = NO_PERMISSIONS
    scopes      = ALL_SCOPES
    reportTabs  = []
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
    reportTabs,
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
 * Dois módulos, o mesmo gesto: `cashier` recebe na recepção, `financial` lança
 * e estorna. Quem tem qualquer um dos dois pode fechar uma venda — é o mesmo
 * critério que a tela de atendimento já usa para "Confirmar pagamento".
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
 * O cargo enxerga esta aba de Relatórios?
 *
 * `reports` sozinho é grosso demais — liberar relatórios ao time comercial
 * entregava junto o faturamento da rede. A aba é escolhida uma a uma na tela de
 * Cargos; aqui só se lê o que ficou gravado.
 */
export function podeVerRelatorio(ctx: TenantContext, tab: ReportTab): boolean {
  return can(ctx, 'reports', 'VIEW') && ctx.reportTabs.includes(tab)
}

/** Barra quem não tem a aba. Use nas páginas que abrem um relatório direto. */
export function assertRelatorio(ctx: TenantContext, tab: ReportTab): void {
  if (!podeVerRelatorio(ctx, tab)) throw new Error('Forbidden')
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

/**
 * A ABRANGÊNCIA do membro (§11): quem é da rede (`branchId` nulo) alcança
 * todas as unidades; quem tem unidade fixa, só a dele.
 *
 * O registro de UNIDADE que chega por id — agendamento, lançamento, plano,
 * estoque, mapa, membro — passa por aqui depois de conferida a rede. Até
 * 2026-09-28 quase nenhuma action olhava isto, e a recepção da unidade A
 * cancelava, recebia e estornava na unidade B pelo id.
 *
 * `branchId` nulo no REGISTRO é coisa da rede (catálogo, cliente sem
 * unidade): só quem é da rede mexe.
 */
export function alcancaUnidade(ctx: TenantContext, branchId: string | null | undefined): boolean {
  return ctx.branchId === null || (!!branchId && branchId === ctx.branchId)
}

/** `alcancaUnidade` que barra — mesma resposta de quem não tem o módulo. */
export function assertUnidade(ctx: TenantContext, branchId: string | null | undefined): void {
  if (!alcancaUnidade(ctx, branchId)) throw new Error('Forbidden')
}


// Destino pós-login: abrangência de filial → dashboard da filial; rede → /admin.
// A autorização fina de cada página é feita por assertPermission.
export function getRedirectPath(_role: string, branchSlug?: string | null): string {
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/admin/dashboard'
}
