'use server'

import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getAtendimentosAReceber } from '@/lib/metrics/a-receber'

/**
 * Como está a cobrança de um atendimento CONCLUÍDO, para a janela da agenda
 * (D5 e D9 da simulação de 2026-10-27). A janela só sabia dizer "Este
 * agendamento já foi encerrado.", e o recebimento ficava sem porta.
 *
 * - `A_RECEBER`: concluído, com preço, avulso e sem pagamento — a conta de
 *   `atendimentos_a_receber`, a mesma do Fechamento e da ficha;
 * - `SEM_COBRANCA`: R$ 0 (a avaliação) — nada a receber;
 * - `RESOLVIDO`: pago, ou pago em outro lugar (plano, pacote, pré-pago).
 *
 * `podeReceber` é o módulo de recebimentos, o de `confirmPayment`.
 */
export async function situacaoDaCobranca(appointmentId: string): Promise<{
  situacao: 'A_RECEBER' | 'SEM_COBRANCA' | 'RESOLVIDO'
  podeReceber: boolean
} | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const appt = await ler(createAdminClient().from('appointments')
    .select('status, price, branch_id, treatment_plan_id, branches!inner(tenant_id)')
    .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento')
  const rede = (appt?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  if (!appt || rede !== ctx.tenantId || !alcancaUnidade(ctx, appt.branch_id as string)) return null
  if (appt.status !== 'COMPLETED') return null

  const podeReceber = ctx.permissions.cashier === 'MANAGE'
  if (!appt.treatment_plan_id && !(Number(appt.price) > 0)) return { situacao: 'SEM_COBRANCA', podeReceber }
  const { itens } = await getAtendimentosAReceber({ tenantId: ctx.tenantId!, agendamentoId: appointmentId })
  return { situacao: itens.length > 0 ? 'A_RECEBER' : 'RESOLVIDO', podeReceber }
}
