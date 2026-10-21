import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { creditosDoCliente, type CreditoDeAgendamento } from '@/lib/creditos/credito'

type Admin = ReturnType<typeof createAdminClient>

export type PagoParaAgendar =
  | { tipo: 'PLANO'; planId: string; sessionId: string; preco: number }
  | { tipo: 'CREDITO'; credito: CreditoDeAgendamento; preco: number }

/**
 * O que a cliente JÁ PAGOU deste procedimento, para o agendamento que ela faz
 * pelo app (2026-10-21, decisão do Heitor). Nascia solto, com o preço de
 * tabela, e o checkout cobraria de novo.
 *
 * Primeiro a sessão livre de um plano VENDIDO (ACCEPTED), a mais antiga, cujo
 * procedimento principal (o primeiro da sessão) é este — o preço é a soma da
 * sessão, já com o desconto rateado. Sem ela, o crédito de pacote ou de
 * pré-pago (`creditosDoCliente`), como a equipe usa. Nada: null (avulso).
 */
export async function pagoParaAgendar(
  admin: Admin, tenantId: string, clientId: string, procedureId: string,
): Promise<PagoParaAgendar | null> {
  type Sessao = {
    id: string; sort_order: number; appointment_id: string | null
    treatment_plan_session_procedures: { procedure_id: string; price: number | null; sort_order: number }[]
  }
  const planos = await ler(admin.from('treatment_plans')
    .select('id, created_at, branches!inner(tenant_id), treatment_plan_sessions(id, sort_order, appointment_id, treatment_plan_session_procedures(procedure_id, price, sort_order))')
    .eq('client_id', clientId).eq('status', 'ACCEPTED').eq('branches.tenant_id', tenantId)
    .order('created_at'), 'buscar os planos da cliente') as { id: string; treatment_plan_sessions: Sessao[] }[] | null

  for (const plano of planos ?? []) {
    const sessoes = [...(plano.treatment_plan_sessions ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    for (const s of sessoes) {
      if (s.appointment_id) continue
      const procs = [...(s.treatment_plan_session_procedures ?? [])].sort((a, b) => a.sort_order - b.sort_order)
      if (procs[0]?.procedure_id !== procedureId) continue
      const preco = Math.round(procs.reduce((t, p) => t + Number(p.price ?? 0), 0) * 100) / 100
      return { tipo: 'PLANO', planId: plano.id, sessionId: s.id, preco }
    }
  }

  const credito = (await creditosDoCliente(admin, tenantId, clientId)).find(c => c.procedureId === procedureId)
  return credito ? { tipo: 'CREDITO', credito: { tipo: credito.tipo, id: credito.id }, preco: credito.preco } : null
}
