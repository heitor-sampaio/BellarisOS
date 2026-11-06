'use server'

/**
 * O que o cliente já pagou e ainda tem para agendar (fase 3 de "Vender",
 * 2026-09-30): unidades de procedimento pré-pago e sessões de pacote. Lido
 * pelos dois lugares que agendam — a agenda e o inbox (CRM).
 *
 * Todo export é endpoint público: confere permissão e a rede do cliente.
 */

import { getTenantContext, can } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { creditosDoCliente, lerCredito, type CreditoParaAgendar } from '@/lib/creditos/credito'
import { agendamentoAoAlcance, deOutroProfissional, DE_OUTRO_PROFISSIONAL, revalidarAgendamento } from '@/lib/appointments/alteracoes'
import { revalidatePath } from 'next/cache'

export async function creditosParaAgendar(clientId: string): Promise<CreditoParaAgendar[]> {
  const ctx = await getTenantContext()
  if (!can(ctx, 'agenda', 'MANAGE') && !can(ctx, 'crm', 'MANAGE')) throw semAcesso()
  if (typeof clientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientId)) return []
  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
  if (!cliente) return []
  return creditosDoCliente(admin, ctx.tenantId!, clientId)
}

/**
 * O que o cliente já pagou e serve a um agendamento AVULSO já marcado (A20 da
 * 8ª simulação, 2026-11-06): a Bruna foi agendada avulsa com a sessão do pacote
 * livre, e nada ligava o agendamento ao pacote depois. Só o que é do MESMO
 * procedimento; o agendamento tem de estar em aberto, sem plano e sem crédito
 * ligado. A ligação é `usarCreditoNoAgendamento` (o banco confere de novo).
 */
export async function creditosDoAgendamento(appointmentId: string): Promise<CreditoParaAgendar[]> {
  const ctx = await getTenantContext()
  if (!can(ctx, 'agenda', 'MANAGE')) return []
  if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return []
  const admin = createAdminClient()
  const a = await agendamentoAoAlcance(admin, ctx, appointmentId)
  if (!a || deOutroProfissional(ctx, a.professional_id)) return []
  if (!['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(a.status)) return []
  const ag = await ler(admin.from('appointments').select('client_id, procedure_id, treatment_plan_id')
    .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento') as { client_id: string | null; procedure_id: string | null; treatment_plan_id: string | null } | null
  if (!ag?.client_id || !ag.procedure_id || ag.treatment_plan_id) return []
  const [sessao, unidade, lancamento] = await Promise.all([
    ler(admin.from('package_sessions').select('id').eq('appointment_id', appointmentId).limit(1), 'conferir a sessão do pacote'),
    ler(admin.from('procedure_sale_units').select('id').eq('appointment_id', appointmentId).limit(1), 'conferir a unidade pré-paga'),
    ler(admin.from('financial_transactions').select('id').eq('appointment_id', appointmentId).or('notes.is.null,notes.neq.Estornada').limit(1), 'conferir o lançamento do atendimento'),
  ])
  if ((sessao ?? []).length || (unidade ?? []).length || (lancamento ?? []).length) return []
  return (await creditosDoCliente(admin, ctx.tenantId!, ag.client_id)).filter(c => c.procedureId === ag.procedure_id)
}

/**
 * Liga ao agendamento avulso o que o cliente já pagou (A20 da 8ª): a sessão do
 * pacote (ou a unidade pré-paga) passa a ser dele, e o preço do agendamento,
 * a parte do crédito — numa transação, `agendamento_usar_credito`.
 */
export async function usarCreditoNoAgendamento(appointmentId: string, credito: string): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    if (!can(ctx, 'agenda', 'MANAGE')) throw semAcesso()
    const c = lerCredito(credito)
    if (!c || typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return { error: 'Crédito não encontrado.' }
    const admin = createAdminClient()
    const a = await agendamentoAoAlcance(admin, ctx, appointmentId)
    if (!a) return { error: 'Agendamento não encontrado.' }
    if (deOutroProfissional(ctx, a.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
    const { error } = await admin.rpc('agendamento_usar_credito', {
      p_agendamento: appointmentId, p_tenant: ctx.tenantId!, p_tipo: c.tipo, p_credito: c.id,
      p_ator: ctx.internalUserId, p_ator_nome: ctx.userName || 'Equipe',
    })
    if (error) return { error: error.message }
    revalidarAgendamento(ctx, appointmentId)
    revalidatePath('/[slug]/agenda', 'page')
    return { ok: true }
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    return { error: mensagemDoErro(e) }
  }
}
