import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { LinhaDoHistorico } from '@/lib/clients/historico-do-agendamento'

/**
 * Quem fez cada ação nos agendamentos da ficha (J-27): as linhas de
 * `appointment_history` desses agendamentos. A ficha lê no máximo 60
 * agendamentos (`getCachedClientProfileData`), e os ids vão no `.in()`.
 */
export async function historicoDosAgendamentos(
  admin: ReturnType<typeof createAdminClient>, ids: string[],
): Promise<LinhaDoHistorico[]> {
  if (ids.length === 0) return []
  return ((await ler(admin.from('appointment_history')
    .select('appointment_id, action, changed_by_name, created_at')
    .in('appointment_id', ids)
    .order('created_at')
    .limit(1000), 'ler quem fez cada ação nos agendamentos')) ?? []) as LinhaDoHistorico[]
}
