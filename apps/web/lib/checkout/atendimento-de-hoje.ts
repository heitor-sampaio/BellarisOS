import type { SupabaseClient } from '@supabase/supabase-js'
import { ler } from '@/lib/db'

/**
 * O atendimento que GEROU o plano, quando ele mesmo tem preço e ainda não foi
 * recebido — "o atendimento de hoje" do checkout.
 *
 * O plano nasce num atendimento (`evaluation_appointment_id`), que nem sempre é
 * uma avaliação grátis: na simulação de 2026-10-20, a limpeza de R$ 180 da
 * Joana gerou um plano, e o checkout ("Novo paciente") cobrou SÓ o plano — o
 * caixa achou que tinha cobrado a limpeza, e ela ficou sem receber. Decisão do
 * Heitor: cobrar os dois. O checkout mostra o atendimento como item e, quando
 * recebe agora, recebe também ele, pelo caminho do avulso
 * (`confirmar_pagamento_do_atendimento`, com o `appointment_id`): a comissão e
 * as métricas o leem como sempre.
 *
 * Só vale para o concluído (o banco só recebe atendimento concluído) e avulso:
 * sessão de plano, de pacote ou pré-paga já foi paga por outro caminho.
 *
 * ⚠️ Não é `'use server'`: quem chama já conferiu a rede do plano.
 */
export interface AtendimentoDeHoje {
  appointmentId: string
  procedimento:  string
  preco:         number
}

export async function atendimentoDeHojeDoPlano(admin: SupabaseClient, planId: string): Promise<AtendimentoDeHoje | null> {
  const plano = await ler(admin.from('treatment_plans').select('evaluation_appointment_id').eq('id', planId).maybeSingle(),
    'buscar a origem do plano') as { evaluation_appointment_id: string | null } | null
  const apId = plano?.evaluation_appointment_id
  if (!apId) return null

  const [ap, pago, pacote, prePago] = await Promise.all([
    ler(admin.from('appointments').select('status, price, treatment_plan_id, procedures(name)').eq('id', apId).maybeSingle(),
      'buscar o atendimento de origem'),
    ler(admin.from('financial_transactions').select('id').eq('appointment_id', apId).eq('type', 'INCOME').eq('is_paid', true)
      // O estornado não está recebido: a cobrança reabriu (D6, 2026-10-28).
      .or('notes.is.null,notes.neq.Estornada').limit(1),
      'conferir se o atendimento já foi recebido'),
    ler(admin.from('package_sessions').select('id').eq('appointment_id', apId).limit(1), 'conferir a sessão de pacote'),
    ler(admin.from('procedure_sale_units').select('id').eq('appointment_id', apId).neq('status', 'CANCELADA').limit(1),
      'conferir o pré-pago'),
  ])
  const a = ap as { status: string; price: number | null; treatment_plan_id: string | null; procedures: { name: string } | null } | null
  if (!a || a.status !== 'COMPLETED' || a.treatment_plan_id || !(Number(a.price) > 0)) return null
  if ((pago ?? []).length || (pacote ?? []).length || (prePago ?? []).length) return null
  return { appointmentId: apId, procedimento: a.procedures?.name ?? 'Atendimento', preco: Math.round(Number(a.price) * 100) / 100 }
}
