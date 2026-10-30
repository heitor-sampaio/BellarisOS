// Os atendimentos de dias ANTERIORES ainda abertos (J-32, 2026-10-30). Sem
// 'use server': a página que chama já conferiu a sessão e a unidade.
//
// A cliente que "Chegou" às 23:50 e não foi atendida sumia do dia depois da
// meia-noite — a agenda abre em hoje —, e o atendimento ficava aberto para
// sempre: sem conclusão, sem cobrança, sem falta. A agenda e o dashboard da
// unidade avisam.
//
// "Aberto" é quem CHEGOU (ARRIVED) ou está EM ATENDIMENTO (IN_PROGRESS): a
// cliente esteve na clínica e nada foi fechado. O agendado/confirmado que
// passou sem ninguém mexer não entra (decisão para o Heitor), e só os
// últimos 30 dias contam. Respeita o "só os meus" da agenda (`ownerFilter`).

import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownerFilter } from '@/lib/auth'
import { startOfDayTZ } from '@/lib/datetime'
import { mensagemDoErro } from '@/lib/db'

export const STATUS_ABERTOS_DE_ANTES = ['ARRIVED', 'IN_PROGRESS'] as const
const JANELA_DIAS = 30
const NA_TELA = 20

export interface AbertoDeAntes {
  id: string
  scheduledAt: string
  status: 'ARRIVED' | 'IN_PROGRESS'
  clientName: string
  professionalName: string
}

export async function abertosDeAntes(ctx: TenantContext, branchId: string, agora = new Date()): Promise<{ total: number; itens: AbertoDeAntes[] }> {
  const hoje = startOfDayTZ(agora)
  const desde = new Date(hoje.getTime() - JANELA_DIAS * 86_400_000)
  let q = createAdminClient().from('appointments')
    .select('id, scheduled_at, status, clients(name), users!professional_id(name), branches!inner(tenant_id)', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('branches.tenant_id', ctx.tenantId!)
    .in('status', [...STATUS_ABERTOS_DE_ANTES])
    .lt('scheduled_at', hoje.toISOString())
    .gte('scheduled_at', desde.toISOString())
  const dono = ownerFilter(ctx, 'agenda')
  if (dono) q = q.eq('professional_id', dono)
  const { data, count, error } = await q.order('scheduled_at').order('id').limit(NA_TELA)
  // É aviso: a falha vai ao log e a tela segue sem ele.
  if (error) { console.error('[abertos-de-antes]', mensagemDoErro(error)); return { total: 0, itens: [] } }
  return {
    total: count ?? (data ?? []).length,
    itens: ((data ?? []) as unknown as {
      id: string; scheduled_at: string; status: 'ARRIVED' | 'IN_PROGRESS'
      clients: { name: string } | null; users: { name: string } | null
    }[]).map(a => ({
      id: a.id, scheduledAt: a.scheduled_at, status: a.status,
      clientName: a.clients?.name ?? '—', professionalName: a.users?.name ?? '—',
    })),
  }
}
