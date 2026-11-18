import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { unidadesDosInsumos } from '@/lib/checkout/procedimentos-do-plano'
import type { PlanSessionForCheckout } from '@/actions/treatment-plans'

/**
 * As sessões do plano para o checkout e para o receber dele.
 *
 * D3 da 25ª simulação: o checkout lia por `getTreatmentPlanSessions`, que pede
 * o Atendimento em Ver (a tela do atendimento, 2026-11-18) — e quem tem só o
 * PDV, que é quem recebe (`podeReceber`, PDV1), ganhava "sem acesso". Aqui não
 * se confere permissão: ⚠️ quem chama já conferiu quem é e o plano (a rede, a
 * unidade ao alcance). Não é `'use server'`.
 *
 * D2 da 25ª: `precoDeTabela` devolve o preço de ANTES do desconto
 * (`preco_tabela`, gravado no aceite com o combinado): o checkout parte do
 * subtotal de tabela e mostra o desconto à parte — as sessões fecham com ele.
 * Sem a opção, o preço gravado (o vendido, o do rateio).
 */
export async function sessoesDoPlanoParaCheckout(
  tenantId: string, planId: string, opcoes: { precoDeTabela?: boolean } = {},
): Promise<PlanSessionForCheckout[]> {
  const admin = createAdminClient()
  const rawSessions = await ler(admin
    .from('treatment_plan_sessions')
    .select(`
      id, sort_order, appointment_id,
      treatment_plan_session_procedures(procedure_id, price, preco_tabela, sort_order, products, procedures(name, duration_min))
    `)
    .eq('plan_id', planId)
    .order('sort_order'), 'carregar as sessões do plano')
  const sessoes = (rawSessions ?? []) as unknown as SessaoLida[]

  // D3 da 15ª: o agendamento vivo de cada sessão (cancelado e falta não contam).
  const idsDosAgendamentos = sessoes.map(s => s.appointment_id).filter((x): x is string => !!x)
  const agendados = idsDosAgendamentos.length
    ? await ler(admin.from('appointments').select('id, scheduled_at')
        .in('id', idsDosAgendamentos).not('status', 'in', '(CANCELLED,NO_SHOW)'), 'ler os agendamentos das sessões')
    : []
  const inicio = new Map(((agendados ?? []) as { id: string; scheduled_at: string }[]).map(a => [a.id, a.scheduled_at]))

  // A unidade do insumo é a de consumo do produto, lida agora (D9).
  const unidades = await unidadesDosInsumos(tenantId, sessoes
    .flatMap(s => (s.treatment_plan_session_procedures ?? []).flatMap(p => (p.products ?? []).map(pr => pr.product_id))))

  return montarSessoesDoPlano(sessoes, inicio, unidades, opcoes)
}

type ProdutoLido = { product_id: string; name: string; unit: string; quantity: number }
type ProcedimentoLido = {
  procedure_id: string; price: number | string; preco_tabela?: number | string | null; sort_order: number
  products: ProdutoLido[] | null; procedures: { name: string; duration_min: number } | null
}
export type SessaoLida = { id: string; sort_order: number; appointment_id: string | null; treatment_plan_session_procedures: ProcedimentoLido[] }

/** Puro: as linhas lidas → as sessões do checkout. */
export function montarSessoesDoPlano(
  sessoes: SessaoLida[], inicioDoAgendamento: Map<string, string>, unidades: Map<string, string>,
  opcoes: { precoDeTabela?: boolean } = {},
): PlanSessionForCheckout[] {
  return sessoes.map(s => {
    const procs = [...(s.treatment_plan_session_procedures ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(p => ({
        procedureId: p.procedure_id,
        name:        p.procedures?.name ?? '—',
        price:       Number(opcoes.precoDeTabela ? (p.preco_tabela ?? p.price) : p.price),
        durationMin: p.procedures?.duration_min ?? 60,
        products:    (p.products ?? []).map(pr => ({
          productId: pr.product_id, name: pr.name, unit: unidades.get(pr.product_id) ?? pr.unit, quantity: Number(pr.quantity),
        })),
      }))
    const totalPrice = Math.round(procs.reduce((sum, p) => sum + p.price, 0) * 100) / 100
    return {
      id:              s.id,
      sortOrder:       s.sort_order,
      totalPrice,
      mainProcedureId: procs[0]?.procedureId ?? '',
      mainDurationMin: procs.reduce((sum, p) => sum + p.durationMin, 0),
      procedures:      procs,
      appointmentId:   s.appointment_id ?? null,
      agendada:        s.appointment_id ? inicioDoAgendamento.get(s.appointment_id) ?? null : null,
    }
  })
}
