'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { getPlatformContext } from '@/lib/plataforma/contexto'
import { registrarNaPlataforma } from '@/lib/plataforma/auditoria'
import { sessoesEmCurso, tagDaSessao } from '@/lib/suporte/sessao'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { reativarMembro } from '@/lib/equipe/ativacao'
import { membroReativado } from '@/lib/events/cadastro'
import { headers } from 'next/headers'
import { origemPublicaDe } from '@/lib/origem'
import { SITUACOES_DO_PLANO, type SituacaoDoPlano } from '@/lib/plataforma/plano'

/**
 * As ações da PLATAFORMA sobre uma rede, sem entrar na conta de ninguém.
 *
 * Todo export daqui é endpoint público (§6): cada um confere quem chama com
 * `getPlatformContext` (marca + equipe ativa + verificação em duas etapas), e
 * o que é só de admin pede `papel: 'ADMIN'`. Cada ação fica registrada em
 * `platform_audit_log`, que a clínica também vê.
 */

type Resultado = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

async function membroDaRede(tenantId: string, userId: string) {
  return await ler(createAdminClient()
    .from('users').select('id, name, email, auth_id, is_active, tenant_id')
    .eq('id', userId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o membro') as
    { id: string; name: string; email: string; auth_id: string | null; is_active: boolean; tenant_id: string } | null
}

/** O link de "definir senha" vai ao e-mail do membro (o mesmo do "esqueci minha senha"). */
export async function reenviarAcesso(tenantId: string, userId: string): Promise<Resultado> {
  const ctx = await getPlatformContext()
  if (!ehUuid(tenantId) || !ehUuid(userId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    const membro = await membroDaRede(tenantId, userId)
    if (!membro) return { ok: false, error: 'Membro não encontrado nesta rede.' }
    const { error } = await createAdminClient().auth.resetPasswordForEmail(membro.email, {
      redirectTo: `${origemPublicaDe(await headers())}/auth/confirm?next=/update-password`,
    })
    if (error) return { ok: false, error: `O Auth recusou o envio: ${error.message}` }
    await registrarNaPlataforma(ctx, 'acesso.reenviado', { tenantId, targetUserId: userId, dados: { email: membro.email } })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Reativa um membro desativado — a linha e o login juntos. */
export async function reativarMembroDaRede(tenantId: string, userId: string): Promise<Resultado> {
  const ctx = await getPlatformContext()
  if (!ehUuid(tenantId) || !ehUuid(userId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    const membro = await membroDaRede(tenantId, userId)
    if (!membro) return { ok: false, error: 'Membro não encontrado nesta rede.' }
    if (membro.is_active) return { ok: false, error: 'Este membro já está ativo.' }
    const admin = createAdminClient()
    await reativarMembro(admin, { id: membro.id, tenantId, authId: membro.auth_id })
    // O evento sai como do SISTEMA (a plataforma não é membro da rede); quem
    // foi está no registro da plataforma.
    await membroReativado(userId, { tenantId })
    await registrarNaPlataforma(ctx, 'membro.reativado', { tenantId, targetUserId: userId })
    revalidatePath(`/suporte/redes/${tenantId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}


/** Plano, situação e fim do trial de uma rede. Só admin da plataforma. */
export async function alterarPlanoDaRede(tenantId: string, plano: {
  planName: string | null; planStatus: SituacaoDoPlano; trialEndsAt: string | null
}): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(tenantId)) return { ok: false, error: 'Pedido inválido.' }
  if (!SITUACOES_DO_PLANO.includes(plano?.planStatus)) return { ok: false, error: 'Situação de plano inválida.' }
  const planName = typeof plano.planName === 'string' ? plano.planName.trim().slice(0, 60) || null : null
  const trialEndsAt = plano.trialEndsAt ? new Date(plano.trialEndsAt) : null
  if (trialEndsAt && Number.isNaN(trialEndsAt.getTime())) return { ok: false, error: 'Data de fim do trial inválida.' }
  try {
    const admin = createAdminClient()
    const antes = await ler(admin.from('tenants').select('plan_name, plan_status, trial_ends_at')
      .eq('id', tenantId).maybeSingle(), 'buscar a rede')
    if (!antes) return { ok: false, error: 'Rede não encontrada.' }
    await gravar(admin.from('tenants').update({
      plan_name: planName, plan_status: plano.planStatus,
      trial_ends_at: trialEndsAt?.toISOString() ?? null, updated_at: new Date().toISOString(),
    }).eq('id', tenantId).select('id').single(), 'alterar o plano da rede')
    await registrarNaPlataforma(ctx, 'plano.alterado', {
      tenantId,
      dados: { antes, depois: { plan_name: planName, plan_status: plano.planStatus, trial_ends_at: trialEndsAt?.toISOString() ?? null } },
    })
    revalidatePath(`/suporte/redes/${tenantId}`)
    revalidatePath('/suporte/redes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

// --- Equipe da plataforma (só admin) ----------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Cadastra alguém na equipe da plataforma. O login nasce sem senha, com a
 * marca; o e-mail de "definir senha" sai junto, e a verificação em duas
 * etapas é cadastrada no primeiro acesso.
 *
 * E-mail de membro de rede é recusado: a mesma pessoa não pode ser as duas
 * coisas (a marca da plataforma tiraria o login dela do portal da rede).
 */
export async function criarAtendente(dados: { nome: string; email: string; papel: 'SUPORTE' | 'ADMIN' }): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  const nome  = typeof dados?.nome === 'string' ? dados.nome.trim().slice(0, 80) : ''
  const email = typeof dados?.email === 'string' ? dados.email.trim().toLowerCase() : ''
  const papel = dados?.papel === 'ADMIN' ? 'ADMIN' : 'SUPORTE'
  if (!nome) return { ok: false, error: 'Informe o nome.' }
  if (!EMAIL.test(email)) return { ok: false, error: 'E-mail inválido.' }
  try {
    const admin = createAdminClient()
    const [daRede, daPlataforma] = await Promise.all([
      ler(admin.from('users').select('id').eq('email', email).limit(1), 'conferir o e-mail na equipe das redes'),
      ler(admin.from('platform_staff').select('id').eq('email', email).limit(1), 'conferir o e-mail na plataforma'),
    ])
    if ((daRede ?? []).length) return { ok: false, error: 'Este e-mail é de um membro de rede. Use outro.' }
    if ((daPlataforma ?? []).length) return { ok: false, error: 'Este e-mail já está na equipe da plataforma.' }

    const { data: criado, error } = await admin.auth.admin.createUser({
      email, email_confirm: true, app_metadata: { plataforma: papel },
    })
    if (error || !criado.user) return { ok: false, error: `O Auth recusou o cadastro: ${error?.message ?? 'sem usuário'}` }

    const { error: eStaff } = await admin.from('platform_staff').insert({
      auth_id: criado.user.id, name: nome, email, papel, created_by: ctx.staffId,
    })
    if (eStaff) {
      await admin.auth.admin.deleteUser(criado.user.id)
      return { ok: false, error: `Não consegui cadastrar: ${eStaff.message}` }
    }
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${origemPublicaDe(await headers())}/auth/confirm?next=/update-password`,
    })
    await registrarNaPlataforma(ctx, 'equipe.criada', { dados: { email, papel } })
    revalidatePath('/suporte/equipe')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

async function atendente(staffId: string) {
  return await ler(createAdminClient().from('platform_staff')
    .select('id, auth_id, email, is_active').eq('id', staffId).maybeSingle(), 'buscar a pessoa da plataforma') as
    { id: string; auth_id: string; email: string; is_active: boolean } | null
}

/** Desativa ou reativa alguém da equipe — a linha e o login. Ninguém se desativa. */
export async function ativarAtendente(staffId: string, ativo: boolean): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(staffId)) return { ok: false, error: 'Pedido inválido.' }
  if (staffId === ctx.staffId && !ativo) return { ok: false, error: 'Você não pode desativar a si mesmo.' }
  try {
    const pessoa = await atendente(staffId)
    if (!pessoa) return { ok: false, error: 'Pessoa não encontrada.' }
    const admin = createAdminClient()
    await gravar(admin.from('platform_staff').update({ is_active: ativo, updated_at: new Date().toISOString() })
      .eq('id', staffId).select('id').single(), 'atualizar a equipe da plataforma')
    const { error } = await admin.auth.admin.updateUserById(pessoa.auth_id, { ban_duration: ativo ? 'none' : '876000h' })
    if (error) return { ok: false, error: `Atualizado, mas o Auth recusou o bloqueio: ${error.message}` }
    updateTag(`plataforma:${pessoa.auth_id}`)
    if (!ativo) {
      // A sessão de suporte em curso cai junto — não espera os 60 minutos.
      for (const s of await sessoesEmCurso({ atendente: staffId })) {
        await gravar(admin.rpc('suporte_sessao_encerrar', { p_sessao: s.id, p_motivo: 'atendente desativado' }), 'encerrar a sessão de suporte')
        if (s.authSessionId) updateTag(tagDaSessao(s.authSessionId))
      }
    }
    await registrarNaPlataforma(ctx, ativo ? 'equipe.reativada' : 'equipe.desativada', { dados: { email: pessoa.email } })
    revalidatePath('/suporte/equipe')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/**
 * Apaga os autenticadores de alguém da equipe (perdeu o celular): no próximo
 * login cadastra outro. As sessões dela caem junto — a de aal2 não pode
 * sobreviver ao fator que a provou.
 */
export async function redefinirVerificacao(staffId: string): Promise<Resultado> {
  const ctx = await getPlatformContext({ papel: 'ADMIN' })
  if (!ehUuid(staffId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    const pessoa = await atendente(staffId)
    if (!pessoa) return { ok: false, error: 'Pessoa não encontrada.' }
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: pessoa.auth_id })
    if (error) return { ok: false, error: `O Auth recusou a leitura: ${error.message}` }
    for (const fator of data?.factors ?? []) {
      const { error: e } = await admin.auth.admin.mfa.deleteFactor({ userId: pessoa.auth_id, id: fator.id })
      if (e) return { ok: false, error: `Não consegui apagar um autenticador: ${e.message}` }
    }
    await gravar(admin.rpc('plataforma_encerrar_sessoes', { p_auth_id: pessoa.auth_id }), 'encerrar as sessões')
    await registrarNaPlataforma(ctx, 'mfa.redefinido', { dados: { email: pessoa.email } })
    revalidatePath('/suporte/equipe')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}
