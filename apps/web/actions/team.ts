'use server'

import { conferirLimite, limiteDoPlano } from '@estetica-os/nucleo/lib/planos/limites'
import { erroDoAuth } from '@/lib/erro-do-auth'
import { normalizarHorario, type Horario } from '@/lib/agenda/horario'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade, can, temRecurso } from '@/lib/auth'
import { parseDinheiro } from '@estetica-os/utils'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { createAdminClient } from '@/lib/supabase/admin'
import { membroCriado, membroDesativado, membroReativado } from '@/lib/events/cadastro'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { cargoEhAdminDaRede, souAdminDaRede, recusaDeMexerNaAdmin } from '@/lib/equipe/admin-da-rede'
import { comLoginNovo } from '@/lib/login-novo'
import { EntradaDoRepasse, aplicarRepasse, pendenciasDoMembro, type PendenciasDoMembro } from '@/lib/equipe/repasse'
import { falaDaRede } from '@/lib/unidades/uma-so'
import { atendeDoFormulario, atendeQueGrava, listaDeUnidades } from '@/lib/equipe/atende'

/** As unidades ATIVAS da rede (o checklist do "Atende" só marca estas). */
async function unidadesAtivas(admin: ReturnType<typeof createAdminClient>, tenantId: string): Promise<string[]> {
  return ((await ler(admin.from('branches').select('id').eq('tenant_id', tenantId).eq('is_active', true), 'carregar as unidades da rede')) ?? [])
    .map(b => b.id as string)
}

// Resolve a abrangência (branch_id) de um membro a partir do form.
// Apenas NETWORK_ADMIN pode criar membros de rede (branch_id null); gerentes de
// filial ficam restritos à própria filial.
// Abrangência é atributo do MEMBRO (`users.branch_id`), não do nome do cargo:
// quem tem `branchId === null` opera a rede toda. Antes isto olhava para
// `isNetworkAdmin`, e um cargo de rede que não fosse NETWORK_ADMIN caía na
// última linha e jogava o membro editado para `branch_id = null` em silêncio.
function resolveScope(
  ctx: { branchId: string | null },
  scope: string | null,
  branchId: string | null,
): { branchId: string | null } | { error: string } {
  const isNetworkWide = ctx.branchId === null

  if (scope === 'network') {
    if (!isNetworkWide) return { error: 'Só quem tem abrangência de rede pode criar membros de rede.' }
    return { branchId: null }
  }
  // Filial
  if (isNetworkWide) {
    if (!branchId) return { error: 'Selecione a unidade.' }
    return { branchId }
  }
  // Quem é de uma filial só mexe na própria
  return { branchId: ctx.branchId }
}

/**
 * O cargo a dar é da rede e pode ser dado por quem age. Cargo de sistema não
 * se dá pela Equipe — com UMA exceção (revisão do Heitor, 2026-10-29: "somente
 * um admin pode promover alguém a admin"): quem TEM o cargo de sistema Admin
 * da rede dá esse cargo a outro membro. `admin: true` diz que é ele, e a
 * abrangência dele é sempre a rede.
 */
async function assertRoleInTenant(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  roleId: string,
): Promise<{ error: string } | { ok: true; admin: boolean }> {
  const role = await ler(admin
    .from('tenant_roles')
    .select('is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar o cargo')
  if (!role) return { error: 'Cargo inválido.' }
  if (await cargoEhAdminDaRede(admin, ctx.tenantId!, roleId)) {
    if (!(await souAdminDaRede(admin, ctx))) return { error: await falaDaRede(ctx.tenantId, 'Só quem é Admin da rede dá o cargo de Admin da rede.') }
    return { ok: true, admin: true }
  }
  if (role.is_system) return { error: 'Esse cargo não pode ser atribuído pela equipe.' }
  return { ok: true, admin: false }
}

/**
 * A unidade do membro tem de ser DA REDE.
 *
 * O `branchId` vem do formulário. Sem esta conferência, um admin de rede
 * criava um membro preso à unidade de OUTRA clínica — e toda consulta que
 * filtra só por `branch_id` passava a entregar os dados dela a esse membro.
 * O id da unidade não é segredo: o slug aparece na URL.
 */
async function assertBranchInTenant(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  branchId: string | null,
): Promise<{ error: string } | { ok: true }> {
  if (branchId === null) return { ok: true }
  const unidade = await ler(admin
    .from('branches').select('id').eq('id', branchId).eq('tenant_id', tenantId).maybeSingle(),
    'buscar a unidade')
  return unidade ? { ok: true } : { error: 'Unidade inválida.' }
}

export async function createTeamMember(
  _prevState: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')
  // Um membro criado pelo suporte seria um login permanente, fora do prazo da autorização.
  const travado = bloqueioDoSuporte(ctx, 'cadastrar membro na equipe')
  if (travado) return { error: travado }

  const name             = (formData.get('name') as string)?.trim()
  const email            = (formData.get('email') as string)?.trim().toLowerCase()
  const roleId           = formData.get('roleId') as string
  const password         = formData.get('password') as string
  const scope            = formData.get('scope') as string | null
  const branchId         = formData.get('branchId') as string | null
  // O "Atende" por unidade (decisão 2 da 8ª): a lista do checklist; o
  // formulário de antes manda só `providesServices` (o gatilho do banco dá a
  // unidade que a pessoa alcança).
  const pedidoDoAtende   = atendeDoFormulario(formData)
  let   providesServices = pedidoDoAtende ? pedidoDoAtende.length > 0 : formData.get('providesServices') === 'on'
  const redirectPath     = (formData.get('redirectPath') as string) ?? '/admin/team'
  // O percentual padrão de comissão de quem atende (A10): só quem gere o financeiro grava.
  const comissaoTexto    = ((formData.get('comissao_padrao') as string | null) ?? '').trim()
  let   comissaoPadrao   = providesServices && comissaoTexto ? parseDinheiro(comissaoTexto) : null
  if (comissaoPadrao !== null && (!Number.isFinite(comissaoPadrao) || comissaoPadrao < 0 || comissaoPadrao > 100)) {
    return { error: 'A comissão padrão é um percentual entre 0 e 100.' }
  }

  if (!name || !email || !roleId || !password) return { error: 'Preencha todos os campos.' }
  if (password.length < 8) return { error: 'A senha deve ter pelo menos 8 caracteres.' }
  // O LIMITE de membros do plano da rede (lib/planos/limites.ts).
  const limite = await conferirLimite(ctx.tenantId!, 'membros')
  if (limite) return { error: limite }

  const admin = createAdminClient()

  const roleCheck = await assertRoleInTenant(admin, ctx, roleId)
  if ('error' in roleCheck) return roleCheck

  // A Admin da rede é sempre da rede, peça o formulário o que pedir.
  const scoped = roleCheck.admin ? { branchId: null } : resolveScope(ctx, scope, branchId)
  if ('error' in scoped) return scoped
  const effectiveBranchId = scoped.branchId
  const branchCheck = await assertBranchInTenant(admin, ctx.tenantId!, effectiveBranchId)
  if ('error' in branchCheck) return branchCheck
  const atendeEm = pedidoDoAtende
    ? atendeQueGrava({ pedido: pedidoDoAtende, antes: [], ativas: await unidadesAtivas(admin, ctx.tenantId!), unidadeDeQuemEdita: ctx.branchId })
    : null
  if (atendeEm) {
    providesServices = atendeEm.length > 0
    if (!providesServices) comissaoPadrao = null
  }

  // 1. Criar usuário no Supabase Auth (exige service role)
  // A senha é de quem criou: provisória, troca-se no primeiro acesso (o proxy).
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { senha_provisoria: true },
  })
  if (authError || !authData.user) {
    if (authError?.message?.includes('already registered')) {
      return { error: 'Esse e-mail já está cadastrado.' }
    }
    // Em português (D12): a senha fraca, o e-mail inválido… o Auth fala inglês.
    console.error('[equipe] criar o login:', authError?.code, authError?.message)
    return { error: erroDoAuth(authError) }
  }

  const authId = authData.user.id

  // 2 e 3. As claims no JWT (role do cargo; abrangência = branch_id — a RLS
  // depende delas) e a linha em `users`. Falhou um dos dois, o login some
  // (`comLoginNovo`): nenhum login sem vínculo (o Heitor, 2026-11-01). Antes,
  // claims que falhavam deixavam o login solto.
  let novo: { id: string } | null
  try {
    novo = await comLoginNovo(admin, authId, async () => {
      await gravar(admin.rpc('set_user_claims', {
        p_auth_id:   authId,
        p_tenant_id: ctx.tenantId!,
        p_branch_id: effectiveBranchId,
        p_role_id:   roleId,
      }), 'gravar o acesso do membro')
      const { data, error: insertError } = await admin.from('users').insert({
        auth_id:           authId,
        tenant_id:         ctx.tenantId!,
        branch_id:         effectiveBranchId,
        name,
        email,
        role_id:           roleId,
        provides_services: providesServices,
        ...(atendeEm ? { atende_em: atendeEm } : {}),
      }).select('id').single()
      return insertError || !data ? null : data as { id: string }
    }, r => r === null)
  } catch {
    novo = null
  }
  if (!novo) return { error: 'Erro ao salvar membro. Tente novamente.' }

  await membroCriado(novo.id as string, ctx)

  // A comissão é do financeiro, não da equipe: sem `financial: MANAGE` (e o
  // recurso no plano) o campo é ignorado, mesmo que venha no pedido.
  let avisoDaComissao: string | null = null
  if (comissaoPadrao !== null && can(ctx, 'financial', 'MANAGE') && temRecurso(ctx, 'comissoes')) {
    try {
      await gravar(admin.rpc('comissao_regras_definir', {
        p_tenant: ctx.tenantId!, p_profissional: novo.id as string,
        p_padrao: { tipo: 'PERCENTAGE', valor: comissaoPadrao }, p_excecoes: [], p_ator: ctx.internalUserId ?? null,
      }), 'salvar a comissão do membro')
    } catch {
      avisoDaComissao = 'O membro foi criado, mas a comissão não foi gravada: defina pelo chip de comissão na lista.'
    }
  }

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, { expire: 0 })
  revalidateTag(`user:${authId}`, { expire: 0 })
  if (avisoDaComissao) return { error: avisoDaComissao }
  // A3 da 8ª simulação: sem a comissão, o chip "Sem comissão" ficava escondido
  // na linha — quem cadastra fica sabendo na hora, e onde se define.
  if (providesServices && comissaoPadrao === null && can(ctx, 'financial', 'MANAGE') && temRecurso(ctx, 'comissoes')) {
    return { success: true, aviso: `${name} entrou sem comissão: os atendimentos dela não geram comissão até alguém definir, no chip “Sem comissão” da linha dela.` }
  }
  return { success: true }
}

/** O que a janela de editar recebe: erro, sucesso, a pergunta de rebaixar a Admin ou o repasse do "Atende" (D3 da 9ª). */
export type ResultadoDaEdicaoDoMembro =
  | { error: string } | { success: boolean } | { pergunta: string }
  | { repasseDoAtende: PendenciasDoMembro & { unidades: string } }

export async function updateTeamMember(
  _prevState: ResultadoDaEdicaoDoMembro | undefined,
  formData: FormData,
): Promise<ResultadoDaEdicaoDoMembro> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')
  const travado = bloqueioDoSuporte(ctx, 'mudar o cargo ou o acesso de um membro')
  if (travado) return { error: travado }

  const userId           = formData.get('userId') as string
  const roleId           = formData.get('roleId') as string
  const scope            = formData.get('scope') as string | null
  const branchId         = formData.get('branchId') as string | null
  const pedidoDoAtende   = atendeDoFormulario(formData)
  const providesServices = formData.get('providesServices') === 'on'
  const redirectPath     = (formData.get('redirectPath') as string) ?? '/admin/team'
  // O horário de atendimento (2026-10-21): vazio = segue a unidade.
  const horarioBruto     = formData.get('horario')
  let horario: Horario | null | undefined = undefined
  if (typeof horarioBruto === 'string') {
    if (!horarioBruto.trim()) horario = null
    else {
      try { horario = normalizarHorario(JSON.parse(horarioBruto)) } catch { horario = null }
      if (!horario) return { error: 'Horário inválido: confira se cada período fecha depois de abrir e se não há períodos sobrepostos.' }
    }
  }

  if (!userId || !roleId) return { error: 'Dados incompletos.' }

  const admin = createAdminClient()

  const member = await ler(admin
    .from('users')
    .select('id, auth_id, branch_id, role_id, is_active, name, atende_em')
    .eq('id', userId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar o usuário')
  // O membro tem de estar ao alcance de quem edita (§11): a gerente da unidade
  // A editava — e puxava para a A — gente da B e até da rede.
  if (!member || !alcancaUnidade(ctx, member.branch_id as string | null)) return { error: 'Membro não encontrado.' }

  // "Somente admin pode alterar admin" (revisão do Heitor, 2026-10-29): a
  // Admin da rede só é alterada — cargo, "atende", horário — por outra Admin
  // da rede, ou por ela mesma no que já podia. A gerente da rede, com a
  // Equipe em Gerenciar, deixou de poder.
  const recusa = await recusaDeMexerNaAdmin(admin, ctx, member as { id: string; role_id: string | null })
  if (recusa) return { error: recusa }

  // O cargo de SISTEMA de quem já o tem (D2 da simulação de 2026-10-29): a dona
  // da clínica (Admin da rede) que também atende marca o "atende", a comissão e
  // o horário sem passar pelo cargo. Mantido o mesmo cargo de sistema, cargo e
  // abrangência ficam como estão.
  const cargoAtual = member.role_id
    ? await ler(admin.from('tenant_roles').select('key, is_system')
        .eq('id', member.role_id as string).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cargo do membro')
    : null
  // Tirar o cargo de Admin da rede: só outra Admin (conferido acima), nunca de
  // si mesma, e nunca da última Admin ativa — a rede ficaria sem ninguém com
  // acesso total.
  if (await cargoEhAdminDaRede(admin, ctx.tenantId!, member.role_id as string | null) && roleId !== member.role_id) {
    if (member.id === ctx.internalUserId) return { error: await falaDaRede(ctx.tenantId, 'Você não muda o próprio cargo de Admin da rede: peça a outra Admin.') }
    if (await ehAUltimaAdminAtiva(admin, ctx.tenantId!, member as { id: string; is_active: boolean; role_id: string | null })) {
      return { error: await falaDaRede(ctx.tenantId, 'Essa é a única Admin da rede ativa: a rede ficaria sem ninguém com acesso total.') }
    }
    // A10 da 6ª simulação: rebaixar a dona não perguntava nada. A Admin
    // decide (princípio 2: no máximo, avisar) — mas confirmando.
    if (formData.get('_rebaixarAdmin') !== 'sim') {
      return { pergunta: await falaDaRede(ctx.tenantId,
        `${(member as { name?: string | null }).name ?? 'Esta pessoa'} é Admin da rede: com o cargo novo, deixa de ter acesso total e passa a ver só o que o cargo libera. Trocar o cargo mesmo assim?`) }
    }
  }
  const mantemCargoDoSistema = !!cargoAtual?.is_system && roleId === member.role_id

  let effectiveBranchId = member.branch_id as string | null
  if (!mantemCargoDoSistema) {
    // Dar o cargo de Admin da rede só quem o tem (`assertRoleInTenant`).
    const roleCheck = await assertRoleInTenant(admin, ctx, roleId)
    if ('error' in roleCheck) return roleCheck

    // A Admin da rede é sempre da rede, peça o formulário o que pedir.
    const scoped = roleCheck.admin ? { branchId: null } : resolveScope(ctx, scope, branchId)
    if ('error' in scoped) return scoped
    effectiveBranchId = scoped.branchId
    const branchCheck = await assertBranchInTenant(admin, ctx.tenantId!, effectiveBranchId)
    if ('error' in branchCheck) return branchCheck
  }

  // O checklist (decisão 2 da 8ª): a gerente de unidade fixa muda só a dela.
  const atendeEm = pedidoDoAtende
    ? atendeQueGrava({
        pedido: pedidoDoAtende, antes: ((member as { atende_em?: string[] | null }).atende_em ?? []) as string[],
        ativas: await unidadesAtivas(admin, ctx.tenantId!), unidadeDeQuemEdita: ctx.branchId,
      })
    : null

  // Deixar de atender numa unidade com agendamentos em aberto ali (D3 da 9ª
  // simulação; decidido pelo princípio 3): eles sumiam da grade, sem aviso nem
  // repasse. Sem a resposta, o "Atende" não muda — a janela oferece o repasse
  // do Desativar (H6: repassar, um a um ou todos, ou cancelar); com ela, o
  // repasse vale antes, e o que falhar volta à tela sem mudar nada.
  const antesDoAtende = ((member as { atende_em?: string[] | null }).atende_em ?? []) as string[]
  const depoisDoAtende = atendeEm ?? (providesServices ? null : [])
  const saem = depoisDoAtende ? antesDoAtende.filter(u => !depoisDoAtende.includes(u)) : []
  if (saem.length) {
    const nomes = listaDeUnidades(((await ler(admin.from('branches').select('name')
      .eq('tenant_id', ctx.tenantId!).in('id', saem).order('name'), 'buscar as unidades que saem')) ?? []).map(b => b.name as string))
    const quem = { id: member.id as string, nome: ((member as { name?: string | null }).name ?? '') || 'A profissional' }
    const resposta = formData.get('_repasseDoAtende')
    if (typeof resposta !== 'string' || !resposta) {
      const pendencias = await pendenciasDoMembro(admin, ctx, quem, { unidades: saem })
      if (pendencias.agendamentos.length) return { repasseDoAtende: { ...pendencias, unidades: nomes } }
    } else {
      let lido: ReturnType<typeof EntradaDoRepasse.safeParse> | null = null
      try { lido = EntradaDoRepasse.safeParse(JSON.parse(resposta)) } catch { lido = null }
      if (!lido?.success) return { error: 'O repasse veio inválido. Feche a janela e tente de novo.' }
      if (lido.data.agendamentos.length || lido.data.cancelar.length) {
        const falhas = await aplicarRepasse(admin, ctx, quem, { ...lido.data, oportunidades: [] }, { deixouDeAtenderEm: nomes })
        if (falhas.length) {
          revalidatePath(redirectPath)
          return { error: `O “Atende” não mudou: ${falhas.join(' ')} O resto do repasse já foi feito.` }
        }
      }
    }
  }

  const { error } = await admin
    .from('users')
    .update({
      ...(mantemCargoDoSistema ? {} : { role_id: roleId, branch_id: effectiveBranchId }),
      // Com a lista, o gatilho do banco acerta `provides_services` (= atende em alguma).
      ...(atendeEm ? { atende_em: atendeEm } : { provides_services: providesServices }),
      ...(horario !== undefined ? { horario } : {}),
    })
    .eq('id', userId)
    .eq('tenant_id', ctx.tenantId!)
  if (error) return { error: 'Erro ao atualizar membro.' }

  // Reemite os claims do JWT. O app já lê cargo e abrangência do banco (com a
  // invalidação de `user:` logo abaixo), então a mudança vale na hora; os claims
  // continuam sendo reescritos porque é deles que o RLS do Postgres depende.
  // Com o cargo de sistema mantido, cargo e abrangência não mudaram.
  if (!mantemCargoDoSistema) {
    await gravar(admin.rpc('set_user_claims', {
      p_auth_id:   member.auth_id,
      p_tenant_id: ctx.tenantId!,
      p_branch_id: effectiveBranchId,
      p_role_id:   roleId,
    }), 'atualizar o acesso do membro')
  }

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, { expire: 0 })
  // `updateTag` expira na hora; o perfil 'max' ainda serviria o valor velho na
  // próxima requisição — um cargo rebaixado ganharia mais uma com o acesso antigo.
  revalidateTag(`user:${member.auth_id}`, { expire: 0 })
  return { success: true }
}

/**
 * O membro, DA REDE da sessão, com o login dele.
 *
 * O `auth_id` vai para o Auth (bloquear, desbloquear): lido sem o filtro de
 * rede, um id de membro de outra clínica bloquearia a conta dela.
 */
async function membroDaRede(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  userId: string,
) {
  const membro = await ler(admin
    .from('users').select('id, name, auth_id, branch_id, is_active, role_id')
    .eq('id', userId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o membro')
  // E ao alcance (§11): a gerente da unidade A desativava — e bania do login —
  // gente da B e admins da rede.
  if (!membro || !alcancaUnidade(ctx, membro.branch_id as string | null)) throw new Error('Membro não encontrado.')
  return membro as { id: string; name: string; auth_id: string | null; is_active: boolean; role_id: string | null }
}

/**
 * Desativar (ou rebaixar) a ÚLTIMA Admin da rede ativa deixa a rede sem
 * ninguém de cargo de sistema — e só uma Admin dá esse cargo (revisão do
 * Heitor, 2026-10-29). Quem desativa é outra pessoa (ninguém se desativa).
 */
async function ehAUltimaAdminAtiva(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  membro: { id: string; is_active: boolean; role_id: string | null },
): Promise<boolean> {
  if (!membro.is_active || !membro.role_id) return false
  if (!(await cargoEhAdminDaRede(admin, tenantId, membro.role_id))) return false
  const outras = await ler(admin.from('users').select('id')
    .eq('tenant_id', tenantId).eq('role_id', membro.role_id).eq('is_active', true).neq('id', membro.id)
    .limit(1), 'contar as admins da rede')
  return (outras ?? []).length === 0
}

/**
 * O que fica com o membro ao desativá-lo — os agendamentos futuros e as
 * oportunidades abertas — e para quem pode ir (H6, decisão do Heitor,
 * 2026-11-01). A janela do "Desativar" mostra isso antes de confirmar.
 */
export async function pendenciasParaDesativar(userId: string): Promise<PendenciasDoMembro | { error: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')
  try {
    const admin = createAdminClient()
    const membro = await membroDaRede(admin, ctx, userId)
    return await pendenciasDoMembro(admin, ctx, { id: membro.id, nome: membro.name })
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function deactivateTeamMember(
  userId: string, redirectPath: string = '/admin/team', repasseBruto?: unknown,
): Promise<{ error: string } | undefined> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')
  // Desativar a si mesmo tranca a pessoa do lado de fora sem ninguém para
  // desfazer — se for a única que administra a equipe, a rede fica sem.
  if (userId === ctx.internalUserId) throw new Error('Você não pode desativar o seu próprio acesso.')
  const repasse = EntradaDoRepasse.safeParse(repasseBruto ?? {})
  if (!repasse.success) return { error: 'O repasse veio inválido. Recarregue a página e tente de novo.' }

  const admin = createAdminClient()
  const membro = await membroDaRede(admin, ctx, userId)
  if (await ehAUltimaAdminAtiva(admin, ctx.tenantId!, membro)) {
    return { error: await falaDaRede(ctx.tenantId, 'Essa é a única Admin da rede ativa: a rede ficaria sem ninguém com acesso total.') }
  }
  // Só outra Admin da rede desativa uma Admin (revisão do Heitor, 2026-10-29).
  const recusa = await recusaDeMexerNaAdmin(admin, ctx, membro)
  if (recusa) return { error: recusa }

  // O repasse escolhido na janela (H6), ANTES de desativar: cada item é
  // conferido de novo; o que falhar volta à tela e a pessoa segue ativa até
  // o repasse escolhido valer (a janela recarrega o que sobrou).
  if (repasse.data.agendamentos.length || repasse.data.cancelar.length || repasse.data.oportunidades.length) {
    const falhas = await aplicarRepasse(admin, ctx, { id: membro.id, nome: membro.name }, repasse.data)
    if (falhas.length) {
      revalidatePath(redirectPath)
      return { error: `A pessoa continua ativa: ${falhas.join(' ')} O resto do repasse já foi feito.` }
    }
  }

  await gravar(admin.from('users').update({ is_active: false }).eq('id', userId).eq('tenant_id', ctx.tenantId!), 'desativar o membro')

  // Desativar TIRA o acesso — até 2026-09-27 era só uma coluna que nada lia.
  // O bloqueio no Auth impede renovar o token e entrar de novo; o `updateTag`
  // faz o contexto (`buildContext`) ver o `is_active` já na próxima requisição,
  // e é ele que barra o token que ainda está na mão.
  if (membro.auth_id) {
    // Resposta do Auth, não do PostgREST: o erro é tratado aqui, e alto.
    const { error: erroBloqueio } = await admin.auth.admin.updateUserById(membro.auth_id, { ban_duration: '876000h' })
    if (erroBloqueio) throw new Error(`Desativado, mas não consegui bloquear o login: ${erroBloqueio.message}`)
    revalidateTag(`user:${membro.auth_id}`, { expire: 0 })
  }

  // Quem sai da equipe leva junto a autorização de suporte que tinha dado (e
  // a sessão de suporte em curso na conta dele cai).
  const vigente = await ler(admin.from('support_grants').select('id')
    .eq('target_user_id', userId).eq('tenant_id', ctx.tenantId!).is('revoked_at', null).maybeSingle(), 'buscar a autorização de suporte')
  if (vigente) {
    const sessoes = await gravar(admin.rpc('suporte_revogar_autorizacao', {
      p_grant: vigente.id, p_tenant: ctx.tenantId!, p_por_user: ctx.internalUserId, p_por_staff: null, p_motivo: 'membro desativado',
    }), 'revogar a autorização de suporte') as string[] | null
    for (const s of sessoes ?? []) revalidateTag(`suporte-sessao:${s}`, { expire: 0 })
  }

  // O retrato leva o cargo e a abrangência que a pessoa tinha — é o que uma
  // automação de "revogar o que ela ainda alcança" precisa saber, e depois de
  // desativada essa informação vira arqueologia.
  await membroDesativado(userId, ctx)

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, { expire: 0 })
}

export async function reactivateTeamMember(userId: string, redirectPath: string = '/admin/team'): Promise<{ error: string } | undefined> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')

  const admin = createAdminClient()
  const membro = await membroDaRede(admin, ctx, userId)
  // Só outra Admin da rede reativa uma Admin (revisão do Heitor, 2026-10-29).
  const recusa = await recusaDeMexerNaAdmin(admin, ctx, membro)
  if (recusa) return { error: recusa }
  // Reativar conta para o LIMITE de membros do plano (lib/planos/limites.ts).
  if (!membro.is_active) {
    const limite = await conferirLimite(ctx.tenantId!, 'membros')
    if (limite) throw limiteDoPlano(limite)
  }
  await gravar(admin.from('users').update({ is_active: true }).eq('id', userId).eq('tenant_id', ctx.tenantId!), 'reativar o membro')
  if (membro.auth_id) {
    const { error: erroDesbloqueio } = await admin.auth.admin.updateUserById(membro.auth_id, { ban_duration: 'none' })
    if (erroDesbloqueio) throw new Error(`Reativado, mas não consegui desbloquear o login: ${erroDesbloqueio.message}`)
    revalidateTag(`user:${membro.auth_id}`, { expire: 0 })
  }

  await membroReativado(userId, ctx)

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, { expire: 0 })
}
