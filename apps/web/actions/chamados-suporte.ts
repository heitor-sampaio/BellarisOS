'use server'

import { revalidatePath } from 'next/cache'
import { getPlatformContext } from '@/lib/plataforma/contexto'
import { registrarNaPlataforma } from '@/lib/plataforma/auditoria'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, mensagemDoErro } from '@/lib/db'
import { notifyUser } from '@/lib/notifications/notify'
import { ehSituacao, situacaoDepois, ROTULO_DA_SITUACAO } from '@/lib/suporte/chamados-regras'
import { lerChamado, guardarAnexo, avisarResposta, removerAnexo } from '@/lib/suporte/chamados'
import type { PlatformContext } from '@/lib/plataforma/contexto'
import type { TipoDeRegistroDaPlataforma } from '@/lib/plataforma/auditoria'

/**
 * Os chamados do lado da PLATAFORMA (`/suporte/chamados`). Toda action passa
 * por `getPlatformContext` (marca, equipe ativa, verificação em duas etapas).
 *
 * Resposta do suporte avisa quem abriu pelo sino; nota interna não avisa
 * ninguém e não sai para a clínica.
 */
type Resultado = { ok: true } | { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O registro DEPOIS do efeito: se ele falhar, a action não devolve erro — o
 * atendente repetiria e a resposta (e o sino) sairiam duas vezes. A mensagem
 * já fica no chamado com o autor; a falha do registro vai para o log.
 */
async function registrar(ctx: PlatformContext, kind: TipoDeRegistroDaPlataforma, alvo: Parameters<typeof registrarNaPlataforma>[2]) {
  try { await registrarNaPlataforma(ctx, kind, alvo) }
  catch (e) { console.error('[chamados] registro da plataforma falhou:', kind, mensagemDoErro(e)) }
}

function recarregar(chamadoId: string) {
  revalidatePath('/suporte/chamados')
  revalidatePath(`/suporte/chamados/${chamadoId}`)
}

export async function responderComoSuporte(form: FormData): Promise<Resultado> {
  const ctx = await getPlatformContext()
  const chamadoId = String(form.get('chamadoId') ?? '')
  const corpo = String(form.get('corpo') ?? '').trim()
  const interna = form.get('interna') === '1'
  const pedida = String(form.get('status') ?? '')
  if (!UUID.test(chamadoId)) return { ok: false, error: 'Pedido inválido.' }
  if (!corpo || corpo.length > 5000) return { ok: false, error: 'Escreva a mensagem (até 5.000 caracteres).' }
  try {
    const chamado = await lerChamado(chamadoId, { comInternas: false })
    if (!chamado) return { ok: false, error: 'Chamado não encontrado.' }
    const anexo = await guardarAnexo(chamado.redeId, form.get('anexo'))
    if (anexo && 'error' in anexo) return { ok: false, error: anexo.error }
    const status = situacaoDepois(chamado.status, 'suporte', { interna, escolhida: ehSituacao(pedida) ? pedida : null })
    const { error } = await createAdminClient().rpc('chamado_responder', {
      p_ticket: chamadoId, p_autor: 'suporte', p_user: null, p_staff: ctx.staffId,
      p_corpo: corpo, p_anexos: anexo ? [anexo] : [], p_interna: interna, p_status: status,
    })
    if (error) { await removerAnexo(anexo); return { ok: false, error: error.message } }
    if (!interna) await avisarResposta(chamado)
    await registrar(ctx, interna ? 'chamado.nota_interna' : 'chamado.respondido', {
      tenantId: chamado.redeId, targetUserId: chamado.quemId, dados: { chamado: chamado.numero, status },
    })
    recarregar(chamadoId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** Muda a situação. Fica na conversa, como mensagem do sistema, para a clínica ver. */
export async function mudarSituacaoDoChamado(chamadoId: string, status: string): Promise<Resultado> {
  const ctx = await getPlatformContext()
  if (!UUID.test(chamadoId ?? '') || !ehSituacao(status)) return { ok: false, error: 'Pedido inválido.' }
  try {
    const chamado = await lerChamado(chamadoId, { comInternas: false })
    if (!chamado) return { ok: false, error: 'Chamado não encontrado.' }
    if (chamado.status === status) return { ok: true }
    const { error } = await createAdminClient().rpc('chamado_responder', {
      p_ticket: chamadoId, p_autor: 'sistema', p_user: null, p_staff: ctx.staffId,
      p_corpo: `${ctx.nome} marcou o chamado como "${ROTULO_DA_SITUACAO[status]}".`,
      p_anexos: [], p_interna: false, p_status: status,
    })
    if (error) return { ok: false, error: error.message }
    await registrar(ctx, 'chamado.situacao', { tenantId: chamado.redeId, dados: { chamado: chamado.numero, status } })
    recarregar(chamadoId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** "Assumir": o chamado passa a ser deste atendente (e sai de "aberto"). */
export async function assumirChamado(chamadoId: string): Promise<Resultado> {
  const ctx = await getPlatformContext()
  if (!UUID.test(chamadoId ?? '')) return { ok: false, error: 'Pedido inválido.' }
  try {
    const chamado = await lerChamado(chamadoId, { comInternas: false })
    if (!chamado) return { ok: false, error: 'Chamado não encontrado.' }
    await gravar(createAdminClient().from('support_tickets')
      .update({ assigned_staff_id: ctx.staffId, updated_at: new Date().toISOString(),
        ...(chamado.status === 'aberto' ? { status: 'em_andamento' } : {}) })
      .eq('id', chamadoId).select('id').single(), 'assumir o chamado')
    await gravar(createAdminClient().from('support_signals')
      .update({ updated_at: new Date().toISOString() }).eq('id', 1).select('id').single(), 'avisar a fila')
    await registrar(ctx, 'chamado.assumido', { tenantId: chamado.redeId, dados: { chamado: chamado.numero } })
    recarregar(chamadoId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/**
 * Pede à clínica que autorize o acesso (o suporte nunca se autoriza): uma
 * mensagem do sistema na conversa, e o sino de quem abriu leva à Ajuda,
 * onde está o botão "Autorizar".
 */
export async function pedirAutorizacao(chamadoId: string): Promise<Resultado> {
  const ctx = await getPlatformContext()
  if (!UUID.test(chamadoId ?? '')) return { ok: false, error: 'Pedido inválido.' }
  try {
    const chamado = await lerChamado(chamadoId, { comInternas: false })
    if (!chamado) return { ok: false, error: 'Chamado não encontrado.' }
    if (!chamado.quemId) return { ok: false, error: 'Quem abriu o chamado não está mais na rede.' }
    if (chamado.autorizacao) return { ok: false, error: 'A autorização já está vigente.' }
    const { error } = await createAdminClient().rpc('chamado_responder', {
      p_ticket: chamadoId, p_autor: 'sistema', p_user: null, p_staff: ctx.staffId,
      p_corpo: `${ctx.nome}, do suporte, pediu autorização para entrar na sua conta e olhar o problema de perto. Ela vale por 72 horas e você pode revogar a qualquer momento.`,
      p_anexos: [], p_interna: false, p_status: 'aguardando_clinica',
    })
    if (error) return { ok: false, error: error.message }
    await notifyUser(createAdminClient(), chamado.quemId, {
      type: 'suporte.chamado',
      title: `O suporte pede acesso · chamado #${chamado.numero}`,
      body: 'Abra o chamado para autorizar (ou não) o acesso à sua conta.',
      data: { chamadoId },
    })
    await registrar(ctx, 'chamado.autorizacao_pedida', {
      tenantId: chamado.redeId, targetUserId: chamado.quemId, dados: { chamado: chamado.numero },
    })
    recarregar(chamadoId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}
