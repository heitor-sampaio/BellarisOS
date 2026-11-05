'use server'

/**
 * O bloqueio pontual da agenda (decisão 3 do Heitor, 7ª simulação,
 * 2026-11-05: "concordo") — "Bloquear horário", por profissional ou por sala,
 * com início, fim e motivo; e desfazer.
 *
 * Quem bloqueia é quem gerencia a agenda; com "só os meus", só o PRÓPRIO
 * horário, sem sala (decisão desta frente, pelo "quem tem 'só os meus' vê 'só
 * os meus', em qualquer lugar" do Heitor). A abrangência vale: quem tem unidade
 * fixa bloqueia na dela. Todo export é endpoint público — cada um confere a
 * sessão, a permissão, a rede e o alcance antes de gravar.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, assertPermission, alcancaUnidade, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { recusaDoBloqueio, SO_O_PROPRIO } from '@/lib/agenda/bloqueio'
import { filtroDeQuemAtendeNaUnidade } from '@/lib/cached-queries'

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

const EntradaDoBloqueio = z.object({
  branchId:       UUID,
  professionalId: UUID.nullable().optional(),
  roomId:         UUID.nullable().optional(),
  inicio:         z.string().min(10).max(40),
  fim:            z.string().min(10).max(40),
  motivo:         z.string().max(400),
}).refine(e => !!e.professionalId !== !!e.roomId, 'Escolha a profissional ou a sala do bloqueio.')



type Resultado = { ok?: true; id?: string; aviso?: string | null; error?: string }

function revalidar() {
  revalidatePath('/[slug]/agenda', 'page')
  revalidatePath('/admin/agenda')
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

    // "Só os meus": o próprio horário, e nada de sala.
    if (isOwnScope(ctx, 'agenda') && (e.roomId || e.professionalId !== ctx.internalUserId)) return { error: SO_O_PROPRIO }
    if (!alcancaUnidade(ctx, e.branchId)) return { error: 'Você só bloqueia na sua unidade.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('branches').select('id').eq('id', e.branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
    if (!unidade) return { error: 'Unidade não encontrada.' }
    if (e.professionalId) {
      // Quem atende NESTA unidade (a da rede atende em todas — D1).
      const prof = await ler(admin.from('users').select('id').eq('id', e.professionalId).eq('tenant_id', ctx.tenantId!)
        .eq('is_active', true).or(filtroDeQuemAtendeNaUnidade(e.branchId)).maybeSingle(), 'buscar a profissional')
      if (!prof) return { error: 'Profissional não encontrada nesta unidade.' }
    } else {
      const sala = await ler(admin.from('rooms').select('id').eq('id', e.roomId!).eq('branch_id', e.branchId).eq('is_active', true).maybeSingle(), 'buscar a sala')
      if (!sala) return { error: 'Sala não encontrada nesta unidade.' }
    }

    const inicio = new Date(e.inicio).toISOString(), fim = new Date(e.fim).toISOString()
    const criado = await gravar(admin.from('agenda_bloqueios').insert({
      tenant_id: ctx.tenantId!, branch_id: e.branchId,
      professional_id: e.professionalId ?? null, room_id: e.roomId ?? null,
      inicio, fim, motivo: e.motivo.trim(),
      criado_por: ctx.internalUserId ?? null, criado_por_nome: ctx.userName || null,
    }).select('id').single(), 'gravar o bloqueio da agenda') as { id: string }

    // O que já estava marcado no período continua (princípio 2): a tela diz.
    let q = admin.from('appointments').select('id', { count: 'exact', head: true })
      .not('status', 'in', '("CANCELLED","NO_SHOW","COMPLETED")').lt('scheduled_at', fim)
      .gte('scheduled_at', new Date(new Date(inicio).getTime() - 12 * 3_600_000).toISOString())
    q = e.professionalId ? q.eq('professional_id', e.professionalId) : q.eq('room_id', e.roomId!)
    const { count } = await q
    const aviso = count ? `${count === 1 ? 'Já há 1 atendimento marcado' : `Já há ${count} atendimentos marcados`} perto desse período: ${count === 1 ? 'ele continua' : 'eles continuam'} na agenda. Remarque se precisar.` : null

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
    if (isOwnScope(ctx, 'agenda') && (b.room_id || b.professional_id !== ctx.internalUserId)) return { error: SO_O_PROPRIO }
    if (!alcancaUnidade(ctx, b.branch_id)) return { error: 'Este bloqueio é de outra unidade.' }
    const apagados = await gravar(admin.from('agenda_bloqueios').delete().eq('id', b.id).select('id'), 'desfazer o bloqueio')
    if (!(apagados as unknown[] | null)?.length) return { error: 'Bloqueio não encontrado.' }
    revalidar()
    return { ok: true }
  } catch (err) {
    return { error: mensagemDoErro(err) }
  }
}
