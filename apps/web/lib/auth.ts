import { cache } from 'react'
import { redirect } from 'next/navigation'
import type {
  TenantContext, UserRole, JwtClaims, AppModule,
  ResolvedPermissions, ResolvedScopes, ReportTab,
} from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { getCachedMember, getCachedRede, getCachedRedeDoCliente, getCachedRolePermissions, getCachedRoleReportTabs } from '@/lib/cached-queries'
import { redeBloqueada } from '@/lib/redes/situacao'
import {
  resolvePermissions, resolveScopes, resolveReportTabs, hasLevel,
  NO_PERMISSIONS, ALL_PERMISSIONS, ALL_SCOPES, ALL_REPORT_TABS,
} from '@/lib/permissions'
import { semAcesso } from '@/lib/sem-acesso'
import { abasForaDoPlano, modulosForaDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'
import { headers } from 'next/headers'
import { sessaoDeSuporte, sessaoVigente, registrarAcessoDoSuporte } from '@/lib/suporte/sessao'
import { marcarSessaoDeSuporte } from '@/lib/suporte/requisicao'
import { nomeComSuporte } from '@/lib/suporte/regras'

// Resolve permissões + campos derivados do membro a partir das claims do JWT.
// Durante a transição, role_id/provides_services vêm do banco (getCachedMember)
// caso o JWT ainda não os carregue.
async function buildContext(authId: string, meta: Partial<JwtClaims>): Promise<TenantContext> {
  // Quem é da PLATAFORMA não é membro de rede nem cliente final: sem esta
  // linha, a falta de `role` o faria virar CLIENTE no padrão logo abaixo e
  // passar pelo portal do cliente. O lugar dele é o /suporte.
  const marca = (meta as { plataforma?: string }).plataforma
  // A equipe da plataforma entra pelos apps dela (sistema e suporte, outros
  // hosts): aqui, nada. O proxy já desfaz a sessão; isto é a segunda parede.
  if (marca) redirect('/login?acesso=plataforma')

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

  // Rede BLOQUEADA (desligada pela plataforma, ou assinatura suspensa ou
  // cancelada): a equipe inteira só vê a tela de regularizar — páginas E
  // actions, porque toda action passa por aqui (lib/redes/situacao.ts).
  // O paciente de uma clínica bloqueada também não usa o portal (nem agenda).
  const redeDoContexto = isClient
    ? (meta.client_id ? await getCachedRedeDoCliente(meta.client_id) : null)
    : tenantId
  const rede = redeDoContexto ? await getCachedRede(redeDoContexto) : null
  if (rede && redeBloqueada(rede)) redirect('/conta-suspensa')
  // O PLANO da rede (o retrato; null = sem plano = tudo liberado).
  const plano = rede?.recursos ?? null

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

  // O PLANO corta por cima do cargo — inclusive o do dono da rede: módulo
  // fora do plano vale NONE (menu, busca, configurações e toda action que
  // passa por assertPermission/can), e a aba de Relatórios de uma
  // funcionalidade fora também sai (lib/planos/recursos.ts).
  if (!isClient && plano) {
    const fora = modulosForaDoPlano(plano)
    if (fora.length) permissions = { ...permissions, ...Object.fromEntries(fora.map(m => [m, 'NONE'])) }
    const abasFora = abasForaDoPlano(plano)
    reportTabs = reportTabs.filter(t => !abasFora.includes(t))
    if (reportTabs.length === 0) permissions = { ...permissions, reports: 'NONE' }
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
    plano,
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

  const ctx = await buildContext(authId, meta)

  // Esta sessão é do SUPORTE da plataforma entrando na conta do membro?
  // Achada pelo `session_id` do JWT (lib/suporte/sessao.ts) — não depende de
  // cookie nenhum que o atendente possa apagar.
  const sessionId = (claims as { session_id?: string }).session_id
  if (!sessionId || ctx.isClient || !ctx.internalUserId) return ctx
  const sessao = await sessaoDeSuporte(sessionId)
  if (!sessao) return ctx

  // Encerrada, revogada ou vencida: o fim devolve o atendente ao painel.
  if (!sessaoVigente(sessao) || sessao.targetUserId !== ctx.internalUserId) redirect('/auth/suporte-fim?motivo=venceu')

  marcarSessaoDeSuporte(sessao.id)
  await registrarEstaRequisicao(sessao.id)

  return {
    ...ctx,
    // O nome que fica em TUDO o que esta sessão grava.
    userName: nomeComSuporte(ctx.userName, sessao.atendenteNome),
    // Dado clínico fora, salvo autorização que o inclua (a RLS também barra).
    permissions: sessao.includesClinical ? ctx.permissions : { ...ctx.permissions, medical_records: 'NONE' },
    suporte: {
      sessaoId:      sessao.id,
      atendenteNome: sessao.atendenteNome,
      nomeDoMembro:  ctx.userName,
      incluiClinico: sessao.includesClinical,
      expiraEm:      sessao.expiresAt,
      chamadoId:     sessao.ticketId,
    },
  }
})

/**
 * Registra a requisição feita na sessão de suporte (`support_access_log`):
 * página ou action, com o caminho que o proxy anota em `x-bellaris-caminho`.
 * Prefetch não conta — ninguém abriu aquela tela.
 */
async function registrarEstaRequisicao(sessaoId: string): Promise<void> {
  try {
    const h = await headers()
    if (h.get('next-router-prefetch')) return
    const [metodo, ...caminho] = (h.get('x-bellaris-caminho') ?? '').split(' ')
    await registrarAcessoDoSuporte(sessaoId, {
      method:   metodo || null,
      path:     caminho.join(' ') || null,
      actionId: h.get('next-action'),
      ip:       h.get('x-real-ip'),
    })
  } catch (e) {
    console.error('[suporte] registrar a requisição:', e instanceof Error ? e.message : e)
  }
}

/** Gate do portal do cliente (role CLIENT). */
export function assertClient(ctx: TenantContext): void {
  if (!ctx.isClient) {
    throw semAcesso()
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
    throw semAcesso()
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
    throw semAcesso()
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
  if (!podeReceber(ctx)) throw semAcesso()
}

/**
 * O cargo enxerga dado CLÍNICO (evolução, anexos clínicos, anotação do
 * profissional no plano)? É o módulo de prontuário, e só ele.
 *
 * Existe porque esses dados vazavam por telas de outros módulos: a evolução
 * do atendimento saía com `agenda`, o exame e o laudo do cliente com
 * `clients`, a anotação do plano com `agenda` (corrigido em 2026-10-03).
 * Com escopo OWN, só o profissional do registro (`responsavelId`).
 */
export function podeVerClinico(ctx: TenantContext, responsavelId?: string | null): boolean {
  if (!can(ctx, 'medical_records', 'VIEW')) return false
  if (responsavelId === undefined || !isOwnScope(ctx, 'medical_records')) return true
  return !!responsavelId && ctx.internalUserId === responsavelId
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
  if (!alcancaUnidade(ctx, branchId)) throw semAcesso()
}


// Destino pós-login: abrangência de filial → dashboard da filial; rede → /admin.
// A autorização fina de cada página é feita por assertPermission.
export function getRedirectPath(_role: string, branchSlug?: string | null): string {
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/admin/dashboard'
}
