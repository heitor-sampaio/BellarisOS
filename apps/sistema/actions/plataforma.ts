'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { registrarNaPlataforma } from '@estetica-os/nucleo/lib/plataforma/auditoria'
import { sessoesEmCurso, tagDaSessao } from '@estetica-os/nucleo/lib/suporte/sessao'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@estetica-os/nucleo/lib/db'
import { linkDeDefinirSenha } from '@estetica-os/nucleo/lib/plataforma/destino'
import { expirarEm, expirarNaClinica } from '@estetica-os/nucleo/lib/plataforma/expirar-na-clinica'

/**
 * A EQUIPE DA PLATAFORMA (só ADMIN): cadastrar, ativar e redefinir a
 * verificação. Reenviar acesso e reativar membro de rede são atendimento:
 * moram no app do suporte (`apps/suporte/actions/membros.ts`).
 *
 * Todo export daqui é endpoint público (§6): cada um confere quem chama com
 * `getPlatformContext` (marca + equipe ativa + verificação em duas etapas), e
 * o que é só de admin pede `papel: 'ADMIN'`. Cada ação fica registrada em
 * `platform_audit_log`, que a clínica também vê.
 */

type Resultado = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

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
      redirectTo: linkDeDefinirSenha({ para: 'atendente', papel }),
    })
    await registrarNaPlataforma(ctx, 'equipe.criada', { dados: { email, papel } })
    revalidatePath('/equipe')
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
    // O cache da pessoa mora também no app do SUPORTE (outro processo).
    await expirarEm('suporte', [`plataforma:${pessoa.auth_id}`])
    if (!ativo) {
      // A sessão de suporte em curso cai junto — não espera os 60 minutos.
      for (const s of await sessoesEmCurso({ atendente: staffId })) {
        await gravar(admin.rpc('suporte_sessao_encerrar', { p_sessao: s.id, p_motivo: 'atendente desativado' }), 'encerrar a sessão de suporte')
        if (s.authSessionId) {
          updateTag(tagDaSessao(s.authSessionId))
          await expirarNaClinica([tagDaSessao(s.authSessionId)])
        }
      }
    }
    await registrarNaPlataforma(ctx, ativo ? 'equipe.reativada' : 'equipe.desativada', { dados: { email: pessoa.email } })
    revalidatePath('/equipe')
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
    revalidatePath('/equipe')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}
