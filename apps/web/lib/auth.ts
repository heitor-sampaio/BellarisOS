import { cache } from 'react'
import { redirect } from 'next/navigation'
import type {
  TenantContext, UserRole, JwtClaims, AppModule,
  ResolvedPermissions, ReportTab,
} from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { getCachedMember, getCachedRede, getCachedRedeDoCliente, getCachedFichasDoLogin, getCachedRolePermissions, getCachedRoleReportTabs, getCachedTodasAsUnidades } from '@/lib/cached-queries'
import { unidadesDoMembro, unidadeEmQueEsta } from '@/lib/unidades/do-membro'
import { fichaDaRequisicao, slugDoCaminho } from '@/lib/clientes/ficha-da-requisicao'
import { redeAbreParaCliente, fichasQueAbrem } from '@/lib/clientes/disponibilidade'
import { ROTA_DO_SELETOR } from '@/lib/clientes/entrada'
import { redeBloqueada } from '@/lib/redes/situacao'
import {
  resolvePermissions, resolveReportTabs, hasLevel, abaDeRelatorioVale, abasQueValem,
  NO_PERMISSIONS, ALL_PERMISSIONS, ALL_REPORT_TABS, MODULOS_SO_DA_ADMIN,
} from '@/lib/permissions'
import { semAcesso } from '@/lib/sem-acesso'
import { abasForaDoPlano, modulosForaDoPlano, type ChaveDeFuncionalidade } from '@estetica-os/nucleo/lib/planos/recursos'
import { headers, cookies } from 'next/headers'
import { claimsVelhas, renovaNestaRequisicao, COOKIE_DA_RENOVACAO } from '@/lib/sessao/claims-velhas'
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
  const isClient = role === 'CLIENT'

  // O banco vem ANTES do claim: trocar o cargo de alguém já cadastrado tem
  // efeito na hora. Com a precedência invertida, o `role_id` velho continuava
  // no JWT até o token renovar e a mudança parecia não ter acontecido.
  const member = isClient ? null : await getCachedMember(authId)
  // O "tudo" da Admin da rede também é do BANCO (C58, F70): o cargo de
  // sistema pela chave, nunca a claim `role` — a Admin rebaixada seguia com
  // tudo até o token renovar, e quem não é membro não é Admin de nada.
  const isNetworkAdmin = member?.ehAdminDaRede === true

  // Membro DESATIVADO não opera, com sessão ou sem. A conta também é bloqueada
  // no Auth ao desativar (não renova o token nem entra de novo), mas o token
  // que já estava na mão vale até expirar — é esta linha que o barra no meio.
  // `redirect` e não `throw`: numa página vira a tela de login, não a de erro.
  if (member && !member.isActive) redirect('/login?acesso=desativado')

  // A CLIENTE pode ter uma ficha em cada clínica, com um login só: vale a da
  // clínica do ENDEREÇO (lib/clientes/ficha-da-requisicao.ts). No portal de
  // uma clínica em que ela não tem ficha, volta para a porta de entrada.
  let clientId = meta.client_id ?? null
  let redeDaCliente: string | null = null
  if (isClient) {
    const fichas = await getCachedFichasDoLogin(authId)
    const caminho = await caminhoDaRequisicao()
    let ficha = fichaDaRequisicao(fichas, caminho, clientId)
    if (ficha === 'fora') redirect('/auth/redirect')
    // Clínica FECHADA (bloqueada, ou sem o portal no plano) não tranca a conta
    // inteira: fora do portal dela, vale uma ficha que abre; no portal dela, o
    // seletor. Nenhuma abre → segue, e o portão abaixo manda à conta suspensa.
    if (ficha && !(await redeAbreParaCliente(ficha.tenantId))) {
      const abertas = await fichasQueAbrem(fichas)
      const slugDaRota = slugDoCaminho(caminho)
      if (abertas.length && slugDaRota && (slugDaRota === ficha.slug || ficha.slugsDaRede?.includes(slugDaRota))) {
        redirect(ROTA_DO_SELETOR)
      } else if (abertas.length) {
        ficha = abertas.find(f => f.clientId === clientId) ?? abertas[0]!
      }
    }
    if (ficha) { clientId = ficha.clientId; redeDaCliente = ficha.tenantId }
    else if (clientId) redeDaCliente = await getCachedRedeDoCliente(clientId)
  }

  // Rede BLOQUEADA (desligada pela plataforma, ou assinatura suspensa ou
  // cancelada): a equipe inteira só vê a tela de regularizar — páginas E
  // actions, porque toda action passa por aqui (lib/redes/situacao.ts).
  // O paciente de uma clínica bloqueada também não usa o portal (nem agenda).
  const redeDoContexto = isClient ? redeDaCliente : tenantId
  const rede = redeDoContexto ? await getCachedRede(redeDoContexto) : null
  if (rede && redeBloqueada(rede)) redirect('/conta-suspensa')
  // O PLANO da rede (o retrato; null = sem plano = tudo liberado).
  const plano = rede?.recursos ?? null
  // O portal do cliente é uma funcionalidade do plano: fora dele, o paciente
  // vê "Portal indisponível" (a mesma tela da rede bloqueada).
  if (isClient && plano && !plano.funcionalidades.includes('portal')) redirect('/conta-suspensa')

  const roleId = member?.roleId ?? meta.role_id ?? null

  // A abrangência segue a mesma regra, pelo mesmo motivo. Ela decide em quais
  // unidades a pessoa trabalha e qual portal ela abre (`app/admin/layout.tsx`
  // manda embora quem tem unidade fixa): lendo só do JWT, promover alguém a
  // abrangência de rede o deixava até uma hora trancado fora do portal certo.
  // `undefined` = membro não carregado (cliente final); `null` = rede.
  //
  // As UNIDADES do membro (EQ1a, 2026-11-14): null = "A rede inteira"; senão
  // a principal (`users.branch_id`) e as outras (`users.outras_unidades`).
  // `branchId` é a unidade em que a pessoa ESTÁ: a do endereço, quando é uma
  // das dela (o portal de B para quem tem A e B); senão a principal. Nulo só
  // para a rede inteira — `ctx.branchId !== null` segue querendo dizer "não é
  // da rede" (H7, o /admin, EQ1b), e `ctx.branchId ?? pedido` prende a leitura
  // à unidade em que ela está. Com uma unidade só, nada muda.
  const principal = member ? member.branchId : (meta.branch_id ?? null)
  const unidades = member ? unidadesDoMembro(member) : (principal === null ? null : [principal])
  let branchId = principal
  if (member && tenantId && unidades && unidades.length > 1) {
    const slug = slugDoCaminho(await caminhoDaRequisicao())
    const doEndereco = slug ? (await getCachedTodasAsUnidades(tenantId)).find(u => u.slug === slug)?.id ?? null : null
    branchId = unidadeEmQueEsta(unidades, doEndereco)
  }

  let permissions: ResolvedPermissions
  let reportTabs: ReportTab[]
  if (isClient) {
    permissions = NO_PERMISSIONS
    reportTabs  = []
  } else if (isNetworkAdmin) {
    permissions = ALL_PERMISSIONS
    reportTabs  = [...ALL_REPORT_TABS]
    // Abaixo: o cargo de sistema "Não definido" não tem permissão de NADA (item
    // 20 de 18/11, o Heitor): nenhuma linha da matriz vale para ele, nem a que
    // um dia aparecer gravada — a tela de Cargos não o edita, e isto é a parede.
  } else if (member?.semCargo) {
    permissions = NO_PERMISSIONS
    reportTabs  = []
  } else if (roleId && tenantId) {
    const [rows, tabRows] = await Promise.all([
      getCachedRolePermissions(tenantId, roleId),
      getCachedRoleReportTabs(tenantId, roleId),
    ])
    permissions = resolvePermissions(rows)
    reportTabs  = resolveReportTabs(tabRows)

    // Relatórios sem nenhuma aba é o mesmo que não ter relatórios: sem esta
    // linha o menu mostraria a entrada e a tela abriria vazia, parecendo
    // defeito em vez de permissão.
    if (reportTabs.length === 0) permissions = { ...permissions, reports: 'NONE' }
  } else {
    permissions = NO_PERMISSIONS
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

  // A aba que pede outro módulo só vale com ele (a Financeiro pede o
  // Financeiro — o Heitor, 23/11: "financeiro é uma coisa, vendas é outra"),
  // depois do corte do plano: o cargo gravado antes da regra com só a aba
  // Financeiro não abre os Relatórios vazios (A5).
  if (!isClient) {
    reportTabs = abasQueValem(reportTabs, permissions)
    if (reportTabs.length === 0) permissions = { ...permissions, reports: 'NONE' }
  }

  // A Auditoria é só da Admin da rede (2026-11-16): nenhum cargo a dá — a
  // linha que um cargo tenha gravada já não vale (`resolvePermissions`); esta
  // é a segunda parede.
  if (!isNetworkAdmin) permissions = { ...permissions, ...Object.fromEntries(MODULOS_SO_DA_ADMIN.map(m => [m, 'NONE'])) }

  return {
    userId: authId,
    internalUserId: member?.id ?? null,
    userName: member?.name ?? '',
    roleLabel: member?.roleLabel ?? '',
    tenantId,
    branchId,
    unidades,
    role,
    roleId,
    clientId,
    permissions,
    reportTabs,
    providesServices: member?.providesServices ?? false,
    atendeEm: member?.atendeEm ?? [],
    comissaoDeVenda: member?.comissaoDeVenda ?? false,
    isNetworkAdmin,
    semCargo: member?.semCargo === true,
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
  if (ctx.isClient || !ctx.internalUserId) return ctx
  const sessao = sessionId ? await sessaoDeSuporte(sessionId) : null
  if (!sessao) {
    // A unidade ou o cargo mudaram com a sessão aberta (D9 da 9ª): a página
    // renova o token antes de seguir (lib/sessao/claims-velhas.ts).
    await renovarSeAsClaimsEstaoVelhas(ctx, meta)
    return ctx
  }

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

async function renovarSeAsClaimsEstaoVelhas(ctx: TenantContext, meta: Partial<JwtClaims>): Promise<void> {
  // A claim `branch_id` é a unidade PRINCIPAL gravada (set_user_claims), não a
  // do endereço: a pessoa de várias unidades no portal de B não tem token velho.
  const principal = ctx.unidades === undefined ? ctx.branchId : (ctx.unidades?.[0] ?? null)
  if (!claimsVelhas(meta as { branch_id?: string | null; role_id?: string | null }, { branchId: principal, roleId: ctx.roleId })) return
  const caminho = renovaNestaRequisicao(await caminhoDaRequisicao())
  if (!caminho) return
  // Acabou de renovar e não pegou: segue com o banco (sem laço).
  try { if ((await cookies()).get(COOKIE_DA_RENOVACAO)?.value === ctx.userId) return } catch { return }
  redirect(`/auth/renovar?next=${encodeURIComponent(caminho)}`)
}

/**
 * O "MÉTODO /caminho" desta requisição, como o proxy anotou
 * (`x-bellaris-caminho`; o vindo do navegador é sobrescrito). Fora de uma
 * requisição (sem cabeçalhos), vazio.
 */
export async function caminhoDaRequisicao(): Promise<string> {
  try {
    return (await headers()).get('x-bellaris-caminho') ?? ''
  } catch {
    return ''
  }
}

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

/**
 * A rede tem esta FUNCIONALIDADE no plano? (lib/planos/recursos.ts; sem plano,
 * tudo.) Os módulos inteiros já saíram de `ctx.permissions` em buildContext;
 * isto é para o que é PARTE de um módulo — pacotes, pré-pago, planos de
 * tratamento, inbox, oportunidades, templates, campanhas, anúncios, comissões.
 */
export function temRecurso(ctx: TenantContext, chave: ChaveDeFuncionalidade): boolean {
  return !ctx.plano || ctx.plano.funcionalidades.includes(chave)
}

/** Barra a action/página de uma funcionalidade fora do plano — para o dono também. */
export function assertRecurso(ctx: TenantContext, chave: ChaveDeFuncionalidade): void {
  if (!temRecurso(ctx, chave)) throw semAcesso()
}

/** Versão booleana (para esconder UI / derivar canWrite em pages) */
export function can(ctx: TenantContext, module: AppModule, required: 'VIEW' | 'MANAGE' = 'VIEW'): boolean {
  return hasLevel(ctx.permissions[module], required)
}

/**
 * A Auditoria é SÓ da Admin da rede (o Heitor, 2026-11-16: "Auditoria é só
 * admin"): não se dá a outro cargo. É a exceção documentada no CLAUDE.md §11
 * (como `lib/equipe/admin-da-rede.ts`): `ctx.isNetworkAdmin` vem do cargo de
 * SISTEMA no banco (`tenant_roles.key = 'NETWORK_ADMIN'` com `is_system`),
 * nunca do rótulo nem da claim `role`. O `can` segue junto: o plano corta.
 */
export function podeVerAuditoria(ctx: TenantContext): boolean {
  return ctx.isNetworkAdmin && can(ctx, 'audit', 'VIEW')
}

/** A trava da tela e da leitura da Auditoria. */
export function assertAuditoria(ctx: TenantContext): void {
  if (!podeVerAuditoria(ctx)) throw semAcesso()
}

/**
 * O cargo pode RECEBER dinheiro do cliente?
 *
 * Dois módulos, o mesmo gesto: `cashier` recebe na recepção, `financial` lança
 * e estorna. Quem tem qualquer um dos dois pode fechar uma venda — é o mesmo
 * critério do "Receber no PDV" (a comanda do atendimento).
 *
 * Existe porque o checkout do plano de tratamento exigia `procedures: MANAGE`,
 * o módulo do CATÁLOGO: a recepção precisava poder editar preço de procedimento
 * da rede para receber um plano, e na prática não conseguia fechar nada.
 */
export function podeReceber(ctx: TenantContext): boolean {
  return can(ctx, 'cashier', 'MANAGE') || can(ctx, 'financial', 'MANAGE')
}

/**
 * Vê o Fechamento do dia — o dinheiro da UNIDADE inteira: quem recebe
 * (`cashier`) ou quem vê o Financeiro. O `veFechamento` de lib/menu, pelo
 * contexto.
 */
export function podeVerFechamento(ctx: TenantContext): boolean {
  return can(ctx, 'cashier', 'MANAGE') || can(ctx, 'financial', 'VIEW')
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
 */
export function podeVerClinico(ctx: TenantContext): boolean {
  return can(ctx, 'medical_records', 'VIEW')
}

/**
 * O cargo enxerga esta aba de Relatórios?
 *
 * `reports` sozinho é grosso demais — liberar relatórios ao time comercial
 * entregava junto o faturamento da rede. A aba é escolhida uma a uma na tela de
 * Cargos; aqui só se lê o que ficou gravado.
 *
 * A aba Financeiro (entradas, saídas, lucro) pede também o Financeiro em Ver;
 * a Vendas, não (o Heitor, 2026-11-23: "financeiro é uma coisa, vendas é
 * outra") — `abaDeRelatorioVale`, a mesma régua da tela de Cargos.
 */
export function podeVerRelatorio(ctx: TenantContext, tab: ReportTab): boolean {
  return can(ctx, 'reports', 'VIEW') && ctx.reportTabs.includes(tab) && abaDeRelatorioVale(tab, ctx.permissions)
}

/**
 * A VISTA PESSOAL (sem o "só os meus", o Heitor, 2026-11-23: "pode tirar, as
 * vistas pessoais resolvem"): quem não tem o módulo vê o que é dela — a Minha
 * agenda (`agenda`) quem ATENDE; as Minhas comissões (`financial`) quem atende
 * ou tem comissão no nome dela (quem só vende também ganha comissão: o percentual
 * próprio ou a regra da rede para a venda do plano e do produto). Devolve o
 * id dela para o filtro da consulta, ou `null` quando não é vista pessoal
 * (quem tem o módulo vê tudo, nas unidades ao alcance; quem não atende não
 * tem o que é dela).
 *
 * A vista só MOSTRA: o que se faz (iniciar, remarcar, receber) continua
 * pedindo a permissão do módulo de cada passo.
 */
export function vistaPessoal(ctx: TenantContext, modulo: 'agenda' | 'financial'): string | null {
  if (ctx.isClient || !ctx.internalUserId || ctx.permissions[modulo] !== 'NONE') return null
  // Fora do PLANO da rede, nem a vista: o módulo é NONE por isso, não pelo cargo.
  if (!temRecurso(ctx, modulo === 'agenda' ? 'agenda' : 'financeiro')) return null
  const temOQueVer = modulo === 'agenda' ? ctx.providesServices : (ctx.providesServices || !!ctx.comissaoDeVenda)
  return temOQueVer ? ctx.internalUserId : null
}

/**
 * As unidades do contexto: `ctx.unidades` (null = a rede inteira); no
 * contexto montado à mão, sem ela, o `branchId` (nulo = a rede; senão, só ele).
 */
export function unidadesDoContexto(ctx: Pick<TenantContext, 'branchId' | 'unidades'>): string[] | null {
  if (ctx.unidades !== undefined) return ctx.unidades
  return ctx.branchId === null ? null : [ctx.branchId]
}

/**
 * A ABRANGÊNCIA do membro (§11): quem tem "A rede inteira" (`unidades` nulo)
 * alcança todas as unidades; quem tem unidades, só as DELE (EQ1a, 2026-11-14:
 * a pessoa de A e B alcança as duas, em qualquer dos dois portais).
 *
 * O registro de UNIDADE que chega por id — agendamento, lançamento, plano,
 * estoque, mapa, membro — passa por aqui depois de conferida a rede. Até
 * 2026-09-28 quase nenhuma action olhava isto, e a recepção da unidade A
 * cancelava, recebia e estornava na unidade B pelo id.
 *
 * `branchId` nulo no REGISTRO é coisa da rede (catálogo, cliente sem
 * unidade): só quem é da rede mexe.
 */
export function alcancaUnidade(ctx: Pick<TenantContext, 'branchId' | 'unidades'>, branchId: string | null | undefined): boolean {
  const minhas = unidadesDoContexto(ctx)
  return minhas === null || (!!branchId && minhas.includes(branchId))
}

/**
 * O AGENDAMENTO está ao alcance? É a unidade dele (`alcancaUnidade`), e só.
 * O "Atende" só vale nas unidades da pessoa (o Heitor, 2026-11-23: "uma pessoa
 * só pode atender nas unidades que faz parte, isso é obvio"): saiu o caminho
 * de quem atendia numa unidade fora da abrangência e chegava aos agendamentos
 * DELA de lá (AG-30). Fica com o nome, num lugar só, porque toda action do
 * atendimento confere o agendamento por aqui; a profissional não muda nada.
 */
export function alcancaOAgendamento(
  ctx: Pick<TenantContext, 'branchId' | 'unidades'>, branchId: string | null | undefined,
  professionalId?: string | null,
): boolean {
  void professionalId // quem atende não muda o alcance (o AG-30 saiu)
  return alcancaUnidade(ctx, branchId)
}

/** `alcancaUnidade` que barra — mesma resposta de quem não tem o módulo. */
export function assertUnidade(ctx: TenantContext, branchId: string | null | undefined): void {
  if (!alcancaUnidade(ctx, branchId)) throw semAcesso()
}


// Destino pós-login: abrangência de unidade → dashboard da unidade; rede → /admin.
// A autorização fina de cada página é feita por assertPermission.
export function getRedirectPath(_role: string, branchSlug?: string | null): string {
  if (branchSlug) return `/${branchSlug}/dashboard`
  return '/admin/dashboard'
}
