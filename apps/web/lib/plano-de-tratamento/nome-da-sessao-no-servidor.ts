import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { nomeDaSessao } from '@/lib/plano-de-tratamento/nome'

/**
 * O nome de cada agendamento que é SESSÃO de plano, pelos procedimentos da
 * sessão (A36): o mapa agendamento → "Botox + Preenchimento". Quem não é sessão
 * de plano (ou tem um procedimento só) fica fora do mapa e segue o nome do
 * procedimento do agendamento.
 */
export async function nomesDasSessoesDoPlano(
  admin: ReturnType<typeof createAdminClient>, agendamentos: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(agendamentos.filter(Boolean))]
  if (!ids.length) return new Map()
  const linhas = await ler(admin.from('treatment_plan_sessions')
    .select('appointment_id, treatment_plan_session_procedures(sort_order, procedures(name))')
    .in('appointment_id', ids), 'ler os procedimentos das sessões do plano') as
    { appointment_id: string; treatment_plan_session_procedures: { sort_order: number | null; procedures: { name: string | null } | null }[] | null }[] | null
  const mapa = new Map<string, string>()
  for (const l of linhas ?? []) {
    if ((l.treatment_plan_session_procedures ?? []).length < 2) continue
    const nome = nomeDaSessao(l.treatment_plan_session_procedures)
    if (nome) mapa.set(l.appointment_id, nome)
  }
  return mapa
}
