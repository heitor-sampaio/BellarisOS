import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Os procedimentos de cada plano, na ordem dele (a sessão, depois o
 * procedimento dentro dela): um nome por procedimento de cada sessão. É o que
 * `nomeDaLinhaDoPlano` (lib/financeiro/nome-da-parcela.ts) põe na linha do
 * lançamento do plano (A5 da 31ª). Quem chama já conferiu a rede dos
 * lançamentos; aqui só se leem os planos deles.
 */
export async function procedimentosDosPlanos(planos: (string | null | undefined)[]): Promise<Map<string, string[]>> {
  const unicos = [...new Set(planos.filter((p): p is string => !!p && UUID.test(p)))]
  const mapa = new Map<string, string[]>()
  for (let i = 0; i < unicos.length; i += 150) {
    const sessoes = await ler(createAdminClient().from('treatment_plan_sessions')
      .select('plan_id, sort_order, treatment_plan_session_procedures(sort_order, procedures(name))')
      .in('plan_id', unicos.slice(i, i + 150)), 'ler os procedimentos dos planos') as {
        plan_id: string; sort_order: number | null
        treatment_plan_session_procedures: { sort_order: number | null; procedures: { name: string } | null }[] | null
      }[] | null
    const ordenadas = [...(sessoes ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    for (const s of ordenadas) {
      const nomes = [...(s.treatment_plan_session_procedures ?? [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(p => p.procedures?.name ?? '').filter(Boolean)
      mapa.set(s.plan_id, [...(mapa.get(s.plan_id) ?? []), ...nomes])
    }
  }
  return mapa
}
