'use server'

import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { revalidatePath, revalidateTag } from 'next/cache'
import { conferirCredito } from '@/lib/creditos/credito'
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

/**
 * "Abater do pacote" (D9 da simulação de 2026-10-28): o avulso CONCLUÍDO e a
 * receber vira uma sessão do pacote da cliente — a Bianca fez a drenagem
 * avulsa e comprou o pacote na saída; o "Receber" cobrava R$ 150 de novo.
 *
 * Quem recebe (`cashier`, o mesmo de `confirmPayment`), no atendimento da rede
 * e de unidade ao alcance. A sessão é conferida como crédito (`conferirCredito`:
 * desta cliente, livre, na validade, o mesmo procedimento) e a função do banco
 * faz tudo numa transação, conferindo de novo sob trava.
 */
export async function abaterDoPacote(appointmentId: string, sessaoId: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'cashier', 'MANAGE')
  try {
    const admin = createAdminClient()
    const appt = await ler(admin.from('appointments')
      .select('id, client_id, procedure_id, branch_id, branches!inner(tenant_id, slug)')
      .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento')
    const unidade = appt?.branches as unknown as { tenant_id: string; slug: string } | null
    if (!appt || unidade?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, appt.branch_id as string)) {
      return { error: 'Agendamento não encontrado.' }
    }
    const credito = await conferirCredito(admin, ctx.tenantId!, appt.client_id as string, { tipo: 'PACOTE', id: sessaoId })
    if ('error' in credito) return { error: credito.error.replace('Crédito não encontrado', 'Sessão de pacote não encontrada') }
    if (credito.procedureId !== appt.procedure_id) return { error: 'A sessão do pacote é de outro procedimento.' }

    await gravar(admin.rpc('atendimento_abater_do_pacote', {
      p_agendamento: appointmentId, p_sessao: sessaoId, p_tenant: ctx.tenantId!,
      p_ator: ctx.internalUserId, p_ator_nome: ctx.userName || null,
    }), 'abater o atendimento do pacote')

    revalidatePath(`/${unidade.slug}/agenda`)
    revalidatePath(`/${unidade.slug}/agenda/${appointmentId}`)
    revalidatePath(`/${unidade.slug}/fechamento`)
    revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
    return {}
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
