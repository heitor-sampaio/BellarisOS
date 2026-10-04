'use server'

import { getTenantContext, can } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { podeIncluirClinico, HORAS_PADRAO } from '@/lib/suporte/regras'
import { contextoDoNavegador } from '@/lib/suporte/chamados-regras'
import { updateTag } from 'next/cache'
import { sessoesEmCurso, tagDaSessao } from '@/lib/suporte/sessao'
import {
  chamadosDaClinica, lerChamado, guardarAnexo, removerAnexo,
  type ChamadoResumo, type ChamadoCompleto, type AnexoDoChamado,
} from '@/lib/suporte/chamados'

/**
 * Os chamados de suporte, do lado da CLÍNICA (o botão "Ajuda" da topbar).
 *
 * - Quem abriu vê os seus; quem é da rede com `settings: MANAGE` vê os da
 *   rede inteira (é quem responde pela conta).
 * - Nota interna do suporte nunca sai daqui (`comInternas: false`).
 * - A sessão de suporte não abre nem responde chamado: seria o atendente
 *   conversando consigo mesmo em nome da clínica.
 * - Usuário, unidade e rede vêm da SESSÃO; do navegador só a tela, o tamanho
 *   dela e o navegador (`contextoDoNavegador`).
 */
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function veARede(ctx: TenantContext): boolean {
  return ctx.branchId === null && can(ctx, 'settings', 'MANAGE')
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
    for (const s of emCurso) if (s.authSessionId) updateTag(tagDaSessao(s.authSessionId))
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

export async function meusChamados(): Promise<Resultado<{ chamados: ChamadoResumo[]; daRede: boolean; podeClinico: boolean }>> {
  const ctx = await getTenantContext()
  if (ctx.suporte || !ctx.tenantId || ctx.isClient) return { ok: false, error: 'Sem acesso.' }
  try {
    const daRede = veARede(ctx)
    // Sem o id interno não há "os meus" — e nunca cai em "todos".
    const chamados = daRede ? await chamadosDaClinica(ctx.tenantId, {})
      : ctx.internalUserId ? await chamadosDaClinica(ctx.tenantId, { userId: ctx.internalUserId }) : []
    return { ok: true, chamados, daRede, podeClinico: podeIncluirClinico(ctx) }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

export async function verChamado(chamadoId: string): Promise<Resultado<{ chamado: ChamadoCompleto; meu: boolean }>> {
  const ctx = await getTenantContext()
  if (ctx.suporte) return { ok: false, error: 'Sem acesso.' }
  try {
    const chamado = await chamadoAoAlcance(ctx, chamadoId)
    if (!chamado) return { ok: false, error: 'Chamado não encontrado.' }
    return { ok: true, chamado, meu: chamado.quemId === ctx.internalUserId }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}
