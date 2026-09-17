import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Quanto de um plano de tratamento ainda não foi recebido.
 *
 * Aceitar o plano e pagar por ele viraram dois gestos: quem monta o plano
 * aceita, e o dinheiro é recebido no check-in do primeiro atendimento — quando
 * a pessoa está no balcão. O vínculo entre os dois é
 * `financial_transactions.treatment_plan_id`.
 *
 * Não é Server Action de propósito: é leitura, usada por componentes de
 * servidor dos dois portais. Em `'use server'` viraria endpoint público.
 */
export interface EmAbertoDoPlano {
  planId:      string
  nome:        string | null
  /** Soma do que está `is_paid = false`. Zero quando não há nada em aberto. */
  emAberto:    number
  /** Soma do que já foi recebido. Serve para dizer "R$ X de R$ Y". */
  recebido:    number
  /** Ids dos lançamentos em aberto, na ordem em que devem ser quitados. */
  pendentes:   string[]
}

export async function emAbertoDoPlano(planId: string): Promise<EmAbertoDoPlano | null> {
  const admin = createAdminClient()

  const [{ data: plan }, { data: txs, error }] = await Promise.all([
    admin.from('treatment_plans').select('id, name, status').eq('id', planId).maybeSingle(),
    admin
      .from('financial_transactions')
      .select('id, amount, is_paid, created_at')
      .eq('treatment_plan_id', planId)
      .eq('type', 'INCOME')
      .order('created_at'),
  ])

  if (!plan) return null
  // Erro descartado aqui viraria "R$ 0,00 em aberto" — ou seja, a recepção
  // deixaria de cobrar sem saber. Melhor não afirmar nada.
  if (error) throw new Error(`Erro ao ler o financeiro do plano: ${error.message}`)

  // Lançamento zerado é histórico, não dinheiro: é o que sobra quando um saldo
  // em aberto foi substituído por entrada + parcelas no check-in. Quitá-lo
  // junto carimbaria um R$ 0,00 no fechamento do caixa.
  const linhas = ((txs ?? []) as { id: string; amount: number; is_paid: boolean }[])
    .filter(t => Number(t.amount) > 0)

  return {
    planId:    plan.id as string,
    nome:      (plan.name as string | null) ?? null,
    emAberto:  linhas.filter(t => !t.is_paid).reduce((s, t) => s + Number(t.amount), 0),
    recebido:  linhas.filter(t =>  t.is_paid).reduce((s, t) => s + Number(t.amount), 0),
    pendentes: linhas.filter(t => !t.is_paid).map(t => t.id),
  }
}
