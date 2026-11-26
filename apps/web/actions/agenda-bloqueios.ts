'use server'

/**
 * O bloqueio pontual da agenda (decisão 3 do Heitor, 7ª simulação,
 * 2026-11-05: "concordo") — "Bloquear horário", por profissional ou por sala,
 * com início, fim e motivo; e desfazer.
 *
 * Quem bloqueia é quem gerencia a agenda. A abrangência vale: quem tem unidade
 * fixa bloqueia na dela. Todo export é endpoint público — cada um confere a
 * sessão, a permissão, a rede e o alcance antes de gravar.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, lerTodas, mensagemDoErro } from '@/lib/db'
import { recusaDoBloqueio, avisoDosMarcadosNoBloqueio } from '@/lib/agenda/bloqueio'
import { DURACAO_COMUM_MIN, podemOcuparDesde } from '@/lib/appointments/core'
import { fimDaOcupacao, bateNaOcupacao } from '@/lib/appointments/ocupacao'
import { filtroDeQuemAtendeNaUnidade } from '@/lib/cached-queries'

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

const EntradaDoBloqueio = z.object({
  branchId:       UUID,
  professionalId: UUID.nullable().optional(),
  roomId:         UUID.nullable().optional(),
  inicio:         z.string().min(10).max(40),
  fim:            z.string().min(10).max(40),
  motivo:         z.string().max(400),
}).refine(e => !!e.professionalId !== !!e.roomId, 'Escolha quem atende ou a sala do bloqueio.')



type Resultado = { ok?: true; id?: string; aviso?: string | null; error?: string }

function revalidar() {
  revalidatePath('/[slug]/agenda', 'page')
  revalidatePath('/admin/agenda')
}

type Entrada = z.infer<typeof EntradaDoBloqueio>
type Admin = ReturnType<typeof createAdminClient>

/** A unidade, a profissional ou a sala do bloqueio são da rede e desta unidade. Nulo: tudo certo. */
async function recusaDoAlvo(admin: Admin, tenantId: string, e: Entrada): Promise<string | null> {
  const unidade = await ler(admin.from('branches').select('id').eq('id', e.branchId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a unidade')
  if (!unidade) return 'Unidade não encontrada.'
  if (e.professionalId) {
    // Quem atende NESTA unidade (a da rede atende em todas — D1).
    const prof = await ler(admin.from('users').select('id').eq('id', e.professionalId).eq('tenant_id', tenantId)
      .eq('is_active', true).or(filtroDeQuemAtendeNaUnidade(e.branchId)).maybeSingle(), 'buscar a profissional')
    if (!prof) return 'Profissional não encontrada nesta unidade.'
  } else {
    const sala = await ler(admin.from('rooms').select('id').eq('id', e.roomId!).eq('branch_id', e.branchId).eq('is_active', true).maybeSingle(), 'buscar a sala')
    if (!sala) return 'Sala não encontrada nesta unidade.'
  }
  return null
}

/**
 * Quantos atendimentos já marcados continuam no período (princípio 2).
 * "Perto" é o que começou até 12 h antes ou ainda ocupa o período, com
 * qualquer duração (25/11: o de 30 h de ontem ficava de fora, calado).
 */
async function contarMarcados(admin: Admin, tenantId: string, e: Entrada, inicio: string, fim: string): Promise<number> {
  const iniMs = new Date(inicio).getTime(), fimMs = new Date(fim).getTime()
  const marcados = await lerTodas((de, ate) => {
    let q = admin.from('appointments').select('id, scheduled_at, duration_min, status, completed_at, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenantId)
      .not('status', 'in', '("CANCELLED","NO_SHOW","COMPLETED")').lt('scheduled_at', fim)
      .or(podemOcuparDesde(iniMs))
    q = e.professionalId ? q.eq('professional_id', e.professionalId) : q.eq('room_id', e.roomId!)
    return q.order('scheduled_at').order('id').range(de, ate)
  }, 'contar os atendimentos do período') as { scheduled_at: string; duration_min: number | null; status: string; completed_at: string | null }[]
  return marcados.filter(a => {
    const aIni = new Date(a.scheduled_at).getTime()
    return aIni >= iniMs - DURACAO_COMUM_MIN * 60_000 || bateNaOcupacao(iniMs, fimMs, aIni, fimDaOcupacao(a))
  }).length
}

/**
 * O que o "Bloquear horário" diz ANTES de gravar (A10 da 32ª; AG-20): os
 * atendimentos que continuam no período. Não grava nada; confere o mesmo que
 * o bloquear (a permissão, o alcance, a profissional ou a sala da unidade).
 * Período pela metade ou ao contrário: sem aviso (a recusa fala no bloquear).
 */
export async function marcadosNoBloqueio(entrada: unknown): Promise<{ aviso?: string | null; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    const lido = EntradaDoBloqueio.safeParse(entrada)
    if (!lido.success) return { aviso: null }
    const e = lido.data
    if (!alcancaUnidade(ctx, e.branchId)) return { error: 'Você só bloqueia na sua unidade.' }
    const iniMs = new Date(e.inicio).getTime(), fimMs = new Date(e.fim).getTime()
    if (!Number.isFinite(iniMs) || !Number.isFinite(fimMs) || fimMs <= iniMs) return { aviso: null }
    const admin = createAdminClient()
    const recusa = await recusaDoAlvo(admin, ctx.tenantId!, e)
    if (recusa) return { error: recusa }
    const inicio = new Date(iniMs).toISOString(), fim = new Date(fimMs).toISOString()
    return { aviso: avisoDosMarcadosNoBloqueio(await contarMarcados(admin, ctx.tenantId!, e, inicio, fim)) }
  } catch (err) {
    return { error: mensagemDoErro(err) }
  }
}

export async function bloquearHorario(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    const lido = EntradaDoBloqueio.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const e = lido.data
    const recusa = recusaDoBloqueio({ inicio: e.inicio, fim: e.fim, motivo: e.motivo })
    if (recusa) return { error: recusa }

    if (!alcancaUnidade(ctx, e.branchId)) return { error: 'Você só bloqueia na sua unidade.' }

    const admin = createAdminClient()
    const recusaDoQue = await recusaDoAlvo(admin, ctx.tenantId!, e)
    if (recusaDoQue) return { error: recusaDoQue }

    const inicio = new Date(e.inicio).toISOString(), fim = new Date(e.fim).toISOString()
    const criado = await gravar(admin.from('agenda_bloqueios').insert({
      tenant_id: ctx.tenantId!, branch_id: e.branchId,
      professional_id: e.professionalId ?? null, room_id: e.roomId ?? null,
      inicio, fim, motivo: e.motivo.trim(),
      criado_por: ctx.internalUserId ?? null, criado_por_nome: ctx.userName || null,
    }).select('id').single(), 'gravar o bloqueio da agenda') as { id: string }

    // O que já estava marcado no período continua (princípio 2): a tela diz.
    const aviso = avisoDosMarcadosNoBloqueio(await contarMarcados(admin, ctx.tenantId!, e, inicio, fim))

    revalidar()
    return { ok: true, id: criado.id, aviso }
  } catch (err) {
    return { error: mensagemDoErro(err) }
  }
}

export async function desfazerBloqueio(id: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    const lido = UUID.safeParse(id)
    if (!lido.success) return { error: 'Bloqueio não encontrado.' }
    const admin = createAdminClient()
    const b = await ler(admin.from('agenda_bloqueios').select('id, branch_id, professional_id, room_id')
      .eq('id', lido.data).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o bloqueio') as
      { id: string; branch_id: string; professional_id: string | null; room_id: string | null } | null
    if (!b) return { error: 'Bloqueio não encontrado.' }
    if (!alcancaUnidade(ctx, b.branch_id)) return { error: 'Este bloqueio é de outra unidade.' }
    const apagados = await gravar(admin.from('agenda_bloqueios').delete().eq('id', b.id).select('id'), 'desfazer o bloqueio')
    if (!(apagados as unknown[] | null)?.length) return { error: 'Bloqueio não encontrado.' }
    revalidar()
    return { ok: true }
  } catch (err) {
    return { error: mensagemDoErro(err) }
  }
}
