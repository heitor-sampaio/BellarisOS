'use server'

import { getTenantContext } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { podeIncluirClinico, podeAutorizar, podeRevogar, HORAS_PADRAO, SO_A_ADMIN_AUTORIZA } from '@/lib/suporte/regras'
import { contextoDoNavegador } from '@/lib/suporte/chamados-regras'
import { revalidateTag } from 'next/cache'
import { sessoesEmCurso, tagDaSessao } from '@/lib/suporte/sessao'
import {
  chamadosDaRede, lerChamado, guardarAnexo, removerAnexo,
  type ChamadoResumo, type ChamadoCompleto, type AnexoDoChamado,
} from '@/lib/suporte/chamados'

/**
 * Os chamados de suporte, do lado da CLÍNICA (o botão "Ajuda" da topbar).
 *
 * - Quem abriu vê os seus; a Admin da rede vê os da rede inteira (é quem
 *   responde pela conta).
 * - Nota interna do suporte nunca sai daqui (`comInternas: false`).
 * - A sessão de suporte não abre nem responde chamado: seria o atendente
 *   conversando consigo mesmo em nome da clínica.
 * - Usuário, unidade e rede vêm da SESSÃO; do navegador só a tela, o tamanho
 *   dela e o navegador (`contextoDoNavegador`).
 */
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Os chamados dos colegas: só a Admin da rede (o cargo de sistema gravado),
 * como o resto da conta com o BellarisOS (Q04 do catálogo de Plataforma,
 * resolvida na revisão de 24/11). Era "A rede inteira" com Configurações em
 * Gerenciar, o critério de antes de 18/11.
 */
function veARede(ctx: TenantContext): boolean {
  return ctx.isNetworkAdmin
}

async function chamadoAoAlcance(ctx: TenantContext, chamadoId: string): Promise<ChamadoCompleto | null> {
  // Sem membro (cliente final, contexto sem id interno) não há "o meu" — e o
  // autor apagado (nulo) não pode casar com um contexto nulo.
  if (!ctx.tenantId || !ctx.internalUserId || ctx.isClient || !UUID.test(chamadoId ?? '')) return null
  const c = await lerChamado(chamadoId, { comInternas: false, tenantId: ctx.tenantId })
  if (!c) return null
  if (c.quemId !== ctx.internalUserId && !veARede(ctx)) return null
  return c
}

export async function abrirChamado(form: FormData): Promise<Resultado<{ chamadoId: string; numero: number }>> {
  const ctx = await getTenantContext()
  if (ctx.suporte) return { ok: false, error: 'No modo suporte não se abre chamado.' }
  if (!ctx.tenantId || ctx.isClient) return { ok: false, error: 'Sem acesso.' }

  const assunto = String(form.get('assunto') ?? '').trim()
  const corpo = String(form.get('corpo') ?? '').trim()
  if (assunto.length < 3 || assunto.length > 120) return { ok: false, error: 'Escreva um assunto (de 3 a 120 caracteres).' }
  if (!corpo || corpo.length > 5000) return { ok: false, error: 'Conte o que aconteceu (até 5.000 caracteres).' }

  const autorizar = form.get('autorizar') === '1'
  // Autorizar o suporte é só da Admin da rede (auditoria das regras, 2026-11-18).
  if (autorizar && !podeAutorizar(ctx)) return { ok: false, error: SO_A_ADMIN_AUTORIZA }
  const clinico = autorizar && form.get('clinico') === '1'
  if (clinico && !podeIncluirClinico(ctx)) return { ok: false, error: 'Só quem gerencia o prontuário libera dado clínico ao suporte.' }

  let navegador: ReturnType<typeof contextoDoNavegador>
  try { navegador = contextoDoNavegador(JSON.parse(String(form.get('contexto') ?? '{}'))) }
  catch { navegador = contextoDoNavegador({}) }

  let anexo: AnexoDoChamado | null = null
  try {
    const guardado = await guardarAnexo(ctx.tenantId, form.get('anexo'))
    if (guardado && 'error' in guardado) return { ok: false, error: guardado.error }
    anexo = guardado
    const anexos: AnexoDoChamado[] = anexo ? [anexo] : []
    // Autorizar pelo chamado substitui a autorização anterior, e o banco
    // derruba a sessão que corria nela: lidas antes, para expirar o cache.
    const emCurso = autorizar && ctx.internalUserId ? await sessoesEmCurso({ alvo: ctx.internalUserId }) : []

    const unidade = ctx.branchId
      ? (await ler(createAdminClient().from('branches').select('name').eq('id', ctx.branchId).maybeSingle(), 'ler a unidade') as { name: string } | null)?.name ?? null
      : null
    const contexto = {
      ...navegador,
      usuario: ctx.userName, cargo: ctx.roleLabel || null,
      unidade, portal: ctx.branchId ? 'unidade' : 'rede',
    }
    const { data, error } = await createAdminClient().rpc('chamado_abrir', {
      p_tenant: ctx.tenantId, p_branch: ctx.branchId, p_user: ctx.internalUserId,
      p_assunto: assunto, p_corpo: corpo, p_contexto: contexto, p_anexos: anexos,
      p_autorizar: autorizar, p_clinico: clinico, p_horas: HORAS_PADRAO,
    })
    if (error) { await removerAnexo(anexo); return { ok: false, error: error.message } }
    const linha = (data as { chamado_id: string; numero: number }[] | null)?.[0]
    if (!linha) return { ok: false, error: 'Não consegui abrir o chamado.' }
    for (const s of emCurso) if (s.authSessionId) revalidateTag(tagDaSessao(s.authSessionId), { expire: 0 })
    return { ok: true, chamadoId: linha.chamado_id, numero: Number(linha.numero) }
  } catch (e) {
    await removerAnexo(anexo)
    return { ok: false, error: mensagemDoErro(e) }
  }
}

export async function responderChamado(form: FormData): Promise<Resultado> {
  const ctx = await getTenantContext()
  if (ctx.suporte) return { ok: false, error: 'No modo suporte não se responde chamado.' }
  const chamadoId = String(form.get('chamadoId') ?? '')
  const corpo = String(form.get('corpo') ?? '').trim()
  if (!corpo || corpo.length > 5000) return { ok: false, error: 'Escreva a mensagem (até 5.000 caracteres).' }
  try {
    const chamado = await chamadoAoAlcance(ctx, chamadoId)
    if (!chamado || !ctx.tenantId) return { ok: false, error: 'Chamado não encontrado.' }
    const anexo = await guardarAnexo(ctx.tenantId, form.get('anexo'))
    if (anexo && 'error' in anexo) return { ok: false, error: anexo.error }
    const { error } = await createAdminClient().rpc('chamado_responder', {
      p_ticket: chamado.id, p_autor: 'usuario', p_user: ctx.internalUserId, p_staff: null,
      p_corpo: corpo, p_anexos: anexo ? [anexo] : [], p_interna: false, p_status: 'aberto',
    })
    if (error) { await removerAnexo(anexo); return { ok: false, error: error.message } }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** A autorização vigente do suporte na conta de quem pergunta — a dela, dada no chamado ou em Configurações → Suporte. */
export interface MinhaAutorizacao { id: string; expiraEm: string; clinico: boolean }

export async function meusChamados(): Promise<Resultado<{ chamados: ChamadoResumo[]; daRede: boolean; podeClinico: boolean; podeAutorizar: boolean; minhaAutorizacao: MinhaAutorizacao | null }>> {
  const ctx = await getTenantContext()
  if (ctx.suporte || !ctx.tenantId || ctx.isClient) return { ok: false, error: 'Sem acesso.' }
  try {
    const daRede = veARede(ctx)
    // Sem o id interno não há "os meus" — e nunca cai em "todos".
    const chamados = daRede ? await chamadosDaRede(ctx.tenantId, {})
      : ctx.internalUserId ? await chamadosDaRede(ctx.tenantId, { userId: ctx.internalUserId }) : []
    // "Revogar: a própria pessoa (a conta é dela)" (plataforma.md). A
    // autorização dada em Configurações → Suporte não tem chamado, e a aba é
    // só da Admin da rede: sem isto a pessoa não a via nem revogava (PLAT-05
    // da varredura de 18/11). Só a da PRÓPRIA conta — nunca a dos outros.
    const grant = ctx.internalUserId
      ? await ler(createAdminClient().from('support_grants').select('id, expires_at, includes_clinical')
          .eq('tenant_id', ctx.tenantId).eq('target_user_id', ctx.internalUserId)
          .is('revoked_at', null).gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false }).limit(1).maybeSingle(), 'buscar a autorização da sua conta') as
          { id: string; expires_at: string; includes_clinical: boolean } | null
      : null
    const minhaAutorizacao = grant ? { id: grant.id, expiraEm: grant.expires_at, clinico: !!grant.includes_clinical } : null
    return { ok: true, chamados, daRede, podeClinico: podeIncluirClinico(ctx), podeAutorizar: podeAutorizar(ctx), minhaAutorizacao }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

export async function verChamado(chamadoId: string): Promise<Resultado<{ chamado: ChamadoCompleto; meu: boolean; podeAutorizar: boolean; podeRevogar: boolean }>> {
  const ctx = await getTenantContext()
  if (ctx.suporte) return { ok: false, error: 'Sem acesso.' }
  try {
    const chamado = await chamadoAoAlcance(ctx, chamadoId)
    if (!chamado) return { ok: false, error: 'Chamado não encontrado.' }
    // A autorização do chamado é da conta de quem o abriu: só a Admin da rede a
    // dá; revogar, quem abriu e a Admin.
    const alvo = chamado.quemId ?? ''
    return {
      ok: true, chamado, meu: chamado.quemId === ctx.internalUserId,
      podeAutorizar: !!alvo && podeAutorizar(ctx), podeRevogar: !!alvo && podeRevogar(ctx, alvo),
    }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}
