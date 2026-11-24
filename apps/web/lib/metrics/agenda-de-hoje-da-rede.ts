import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { fusosDasUnidades } from '@/lib/unidades/fuso-da-unidade'
import { janelasDoDiaNasUnidades } from '@/lib/metrics/agenda-do-dia'

/**
 * Os agendamentos de hoje das unidades (sem os cancelados e as faltas), cada
 * unidade no dia DELA (D5 da 26ª; `janelasDoDiaNasUnidades`). Uma consulta
 * por fuso — com todas as unidades no mesmo relógio, uma só, a de antes.
 */
export async function agendamentosDeHojeNasUnidades(args: {
  tenantId: string; branchIds: readonly string[]; agora: Date; fusoDoRecorte: string
}): Promise<{ id: string; status: string; branch_id: string }[]> {
  if (!args.branchIds.length) return []
  const fusos = await fusosDasUnidades(args.tenantId)
  const janelas = janelasDoDiaNasUnidades(args.agora, args.fusoDoRecorte, args.branchIds.map(id => ({ id, fuso: fusos[id] })))
  const admin = createAdminClient()
  const lotes = await Promise.all(janelas.map(j => lerTodas<{ id: string; status: string; branch_id: string }>((de, ate) => admin
    .from('appointments')
    .select('id, status, branch_id')
    .in('branch_id', j.ids)
    .gte('scheduled_at', j.de.toISOString())
    .lte('scheduled_at', j.ate.toISOString())
    .neq('status', 'CANCELLED')
    .neq('status', 'NO_SHOW')
    .order('id')
    .range(de, ate), 'carregar os agendamentos de hoje')))
  return lotes.flat()
}
