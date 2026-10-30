// As salas da unidade no agendamento (D5, decisão do Heitor, 2026-10-30). Sem
// 'use server': quem chama já conferiu a sessão, a permissão e o alcance.
// A regra (qual sala serve a qual procedimento) é a de `lib/agenda/salas.ts`.

import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { salasParaOProcedimento, salaSugerida } from '@/lib/agenda/salas'
import { horarioOcupado } from '@/lib/appointments/core'
import { alcancaUnidade } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'

type Admin = ReturnType<typeof createAdminClient>

export interface SalaParaAgendar { id: string; name: string; livre: boolean }

/** As salas ATIVAS da unidade e, do procedimento, as ligadas a ele entre elas. */
async function salasEDaLigacao(admin: Admin, branchId: string, procedureId: string | null) {
  const salas = ((await ler(admin.from('rooms').select('id, name')
    .eq('branch_id', branchId).eq('is_active', true).order('name').order('id'), 'carregar as salas da unidade')) ?? []) as { id: string; name: string }[]
  if (!procedureId || !salas.length) return { salas, ligadas: [] as string[] }
  const ligadas = ((await ler(admin.from('procedure_rooms').select('room_id')
    .eq('procedure_id', procedureId).in('room_id', salas.map(s => s.id)), 'carregar as salas do procedimento')) ?? []) as { room_id: string }[]
  return { salas, ligadas: ligadas.map(l => l.room_id) }
}

/**
 * A sala serve a este agendamento? Ativa, da unidade e, com o procedimento
 * ligado a salas aqui, uma das ligadas. Devolve a recusa, ou null.
 */
export async function recusaDaSala(admin: Admin, a: { branchId: string; roomId: string; procedureId?: string | null }): Promise<string | null> {
  const { salas, ligadas } = await salasEDaLigacao(admin, a.branchId, a.procedureId ?? null)
  if (!salas.some(s => s.id === a.roomId)) return 'Sala não encontrada nesta unidade.'
  if (!salasParaOProcedimento(salas, ligadas).some(s => s.id === a.roomId)) return 'Esta sala não é usada para este procedimento.'
  return null
}

/**
 * As salas que o agendar oferece para o procedimento, cada uma dizendo se está
 * livre no horário, e a sugerida (a primeira livre). Sem horário, todas livres.
 */
export async function salasParaOHorario(admin: Admin, a: {
  tenantId: string; branchId: string; procedureId: string | null
  inicio: Date | null; duracaoMin: number; excluir?: string | null
}): Promise<{ salas: SalaParaAgendar[]; sugerida: string | null }> {
  const { salas, ligadas } = await salasEDaLigacao(admin, a.branchId, a.procedureId)
  const servem = salasParaOProcedimento(salas, ligadas)
  const inicio = a.inicio && !Number.isNaN(a.inicio.getTime()) ? a.inicio : null
  const comLivre = await Promise.all(servem.map(async s => ({
    id: s.id, name: s.name,
    livre: inicio ? !(await horarioOcupado(admin, {
      tenantId: a.tenantId, roomId: s.id, branchId: a.branchId, inicio, duracaoMin: a.duracaoMin, excluir: a.excluir,
    })) : true,
  })))
  return { salas: comLivre, sugerida: salaSugerida(comLivre) }
}

/**
 * O que as actions do agendar (agenda e CRM) devolvem à tela: a unidade e o
 * procedimento são DA REDE da sessão e a unidade está ao alcance (§11) — senão,
 * nenhuma sala. Quem chama já conferiu a permissão.
 */
export async function salasDoAgendar(
  ctx: TenantContext, branchId: string, procedureId: string | null, scheduledAt: string | null, durationMin: number,
): Promise<{ salas: SalaParaAgendar[]; sugerida: string | null }> {
  const vazio = { salas: [], sugerida: null }
  if (typeof branchId !== 'string' || !UUID.test(branchId) || !alcancaUnidade(ctx, branchId)) return vazio
  if (procedureId != null && (typeof procedureId !== 'string' || !UUID.test(procedureId))) return vazio
  const admin = createAdminClient()
  const [unidade, procedimento] = await Promise.all([
    ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
    procedureId
      ? ler(admin.from('procedures').select('duration_min').eq('id', procedureId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento')
      : Promise.resolve(null),
  ])
  if (!unidade || (procedureId && !procedimento)) return vazio
  const duracao = Number((procedimento as { duration_min?: number } | null)?.duration_min)
    || (Number.isFinite(durationMin) && durationMin > 0 ? Math.min(Math.round(durationMin), 720) : 60)
  return salasParaOHorario(admin, {
    tenantId: ctx.tenantId!, branchId, procedureId,
    inicio: typeof scheduledAt === 'string' && scheduledAt ? new Date(scheduledAt) : null, duracaoMin: duracao,
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
