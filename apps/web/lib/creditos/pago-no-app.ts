import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { creditosDoCliente, type CreditoDeAgendamento, type CreditoParaAgendar } from '@/lib/creditos/credito'

type Admin = ReturnType<typeof createAdminClient>

export type PagoParaAgendar =
  | { tipo: 'PLANO'; planId: string; sessionId: string; preco: number; texto: string }
  | { tipo: 'CREDITO'; credito: CreditoDeAgendamento; preco: number; texto: string }

type Sessao = {
  id: string; sort_order: number; appointment_id: string | null
  treatment_plan_session_procedures: { procedure_id: string; price: number | null; sort_order: number }[]
}
interface OJaPago { planos: { id: string; treatment_plan_sessions: Sessao[] }[]; creditos: CreditoParaAgendar[] }

async function lerOJaPago(admin: Admin, tenantId: string, clientId: string): Promise<OJaPago> {
  const [planos, creditos] = await Promise.all([
    ler(admin.from('treatment_plans')
      .select('id, created_at, branches!inner(tenant_id), treatment_plan_sessions(id, sort_order, appointment_id, treatment_plan_session_procedures(procedure_id, price, sort_order))')
      .eq('client_id', clientId).eq('status', 'ACCEPTED').eq('branches.tenant_id', tenantId)
      .order('created_at'), 'buscar os planos da cliente') as Promise<{ id: string; treatment_plan_sessions: Sessao[] }[] | null>,
    creditosDoCliente(admin, tenantId, clientId),
  ])
  // As sessões dos planos já vêm acima (`planos`): o crédito é o do pacote e o do pré-pago.
  return { planos: planos ?? [], creditos: creditos.filter(c => c.tipo !== 'PLANO') }
}

/** "(sessão 2 de 3)" — sem o número, nada. */
const deQual = (rotulo: string, numero?: number, total?: number) =>
  numero && total ? ` (${rotulo} ${numero} de ${total})` : ''

function escolher(dados: OJaPago, procedureId: string): PagoParaAgendar | null {
  for (const plano of dados.planos) {
    const sessoes = [...(plano.treatment_plan_sessions ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    for (const [i, s] of sessoes.entries()) {
      if (s.appointment_id) continue
      const procs = [...(s.treatment_plan_session_procedures ?? [])].sort((a, b) => a.sort_order - b.sort_order)
      if (procs[0]?.procedure_id !== procedureId) continue
      const preco = Math.round(procs.reduce((t, p) => t + Number(p.price ?? 0), 0) * 100) / 100
      return {
        tipo: 'PLANO', planId: plano.id, sessionId: s.id, preco,
        texto: `Já pago pelo plano de tratamento${deQual('sessão', i + 1, sessoes.length)}`,
      }
    }
  }
  const credito = dados.creditos.find(c => c.procedureId === procedureId)
  if (!credito) return null
  const texto = credito.tipo === 'PACOTE'
    ? `Já pago pelo pacote ${credito.origem}${deQual('sessão', credito.numero, credito.total)}`
    : `Já pago: ${credito.procedimento} pré-pago${deQual('unidade', credito.numero, credito.total)}`
  return { tipo: 'CREDITO', credito: { tipo: credito.tipo, id: credito.id }, preco: credito.preco, texto }
}

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
  return escolher(await lerOJaPago(admin, tenantId, clientId), procedureId)
}

/**
 * O que o passo "Confirmar" do agendar do app diz no lugar do preço (D10 da
 * 8ª simulação, 2026-11-06): "Já pago pelo pacote X (sessão 2 de 3)". É a
 * MESMA escolha que o agendamento vai usar (`pagoParaAgendar`), por
 * procedimento; o que não tem nada pago fica de fora (vale o preço).
 */
export async function jaPagoNoApp(
  admin: Admin, tenantId: string, clientId: string, procedureIds: string[],
): Promise<Record<string, string>> {
  if (!procedureIds.length) return {}
  const dados = await lerOJaPago(admin, tenantId, clientId)
  const saida: Record<string, string> = {}
  for (const id of procedureIds) {
    const pago = escolher(dados, id)
    if (pago) saida[id] = pago.texto
  }
  return saida
}
