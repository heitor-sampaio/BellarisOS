'use server'

import { conferirLimite } from '@estetica-os/nucleo/lib/planos/limites'
import { revalidatePath } from 'next/cache'
import { EVENTOS } from '@estetica-os/types'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { registrarNaPlataforma } from '@estetica-os/nucleo/lib/plataforma/auditoria'
import { urlDaClinica } from '@estetica-os/nucleo/lib/plataforma/destino'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler, mensagemDoErro } from '@estetica-os/nucleo/lib/db'
import { gravarEvento, retratoDoMembro } from '@estetica-os/nucleo/lib/events/gravar'
import { reativarMembro } from '@/lib/equipe/ativacao'

/**
 * O que o SUPORTE faz por um membro de uma rede SEM entrar na conta dele:
 * reenviar o acesso e reativar quem foi desativado. Moram só aqui (o sistema
 * manda para cá — é atendimento).
 *
 * Todo export daqui é endpoint público (§6): cada um confere quem chama com
 * `getPlatformContext` (marca + equipe ativa + verificação em duas etapas), e
 * fica registrado em `platform_audit_log`, que a clínica também vê.
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

/**
 * O link de "definir senha" vai ao e-mail do membro — e volta pela CLÍNICA
 * (`CLINICA_URL`), não por este host: é lá que o membro entra.
 */
export async function reenviarAcesso(tenantId: string, userId: string): Promise<Resultado> {
  const ctx = await getPlatformContext()
  if (!ehUuid(tenantId) || !ehUuid(userId)) return { ok: false, error: 'Pedido inválido.' }
  try {
    const membro = await membroDaRede(tenantId, userId)
    if (!membro) return { ok: false, error: 'Membro não encontrado nesta rede.' }
    const { error } = await createAdminClient().auth.resetPasswordForEmail(membro.email, {
      redirectTo: `${urlDaClinica()}/auth/confirm?next=/update-password`,
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
    // O LIMITE de membros do plano vale para o suporte também (lib/planos/limites.ts).
    const limite = await conferirLimite(tenantId, 'membros')
    if (limite) return { ok: false, error: limite }
    const admin = createAdminClient()
    await reativarMembro(admin, { id: membro.id, tenantId, authId: membro.auth_id })
    // O fato fica na corrente da clínica como do SISTEMA (a plataforma não é
    // membro da rede; quem foi está no registro da plataforma) — e NÃO
    // dispara automação: ação da plataforma não vira fluxo da clínica.
    const { dados, branchId } = await retratoDoMembro(userId, tenantId)
    await gravarEvento(EVENTOS.MEMBRO_REATIVADO, { tenantId, branchId, entidadeId: userId, dados, ator: { tipo: 'sistema' } })
    await registrarNaPlataforma(ctx, 'membro.reativado', { tenantId, targetUserId: userId })
    revalidatePath(`/redes/${tenantId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}
