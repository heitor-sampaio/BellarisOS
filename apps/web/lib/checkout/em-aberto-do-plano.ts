import { createAdminClient } from '@/lib/supabase/admin'
import { endOfDayTZ } from '@/lib/datetime'

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
  /**
   * O que cobrar NO CHECK-IN: em aberto e já vencido (ou sem data). Parcela que
   * vence depois já está combinada — cobrá-la de novo aqui era a cobrança em
   * dobro que a simulação de 2026-10-20 achou. Zero quando não há nada.
   */
  emAberto:    number
  /** Parcelas combinadas que ainda vão vencer: só informação, não se cobra aqui. */
  aVencer:     number
  /** O vencimento mais próximo entre as que vão vencer (ISO), ou nulo. */
  proximoVencimento: string | null
  /** Soma do que já foi recebido. Serve para dizer "R$ X de R$ Y". */
  recebido:    number
  /** Ids dos lançamentos a cobrar agora (os de `emAberto`), na ordem em que devem ser quitados. */
  pendentes:   string[]
}

interface LinhaDoPlano { id: string; amount: number; is_paid: boolean; due_date: string | null }

/** A conta, pura: o que já venceu (ou não tem data) × o que vai vencer depois de hoje. */
export function separarOEmAberto(linhas: LinhaDoPlano[], agora: Date): Omit<EmAbertoDoPlano, 'planId' | 'nome'> {
  // Lançamento zerado é histórico, não dinheiro: é o que sobra quando um saldo
  // em aberto foi substituído por entrada + parcelas no check-in. Quitá-lo
  // junto carimbaria um R$ 0,00 no fechamento do caixa.
  const reais = linhas.filter(t => Number(t.amount) > 0)
  const fimDeHoje = endOfDayTZ(agora).getTime()
  const abertas = reais.filter(t => !t.is_paid)
  const vencidas = abertas.filter(t => !t.due_date || new Date(t.due_date).getTime() <= fimDeHoje)
  const futuras = abertas.filter(t => !vencidas.includes(t))
  const soma = (xs: LinhaDoPlano[]) => Math.round(xs.reduce((s, t) => s + Number(t.amount), 0) * 100) / 100
  return {
    emAberto:  soma(vencidas),
    aVencer:   soma(futuras),
    proximoVencimento: futuras.map(t => t.due_date!).sort()[0] ?? null,
    recebido:  soma(reais.filter(t => t.is_paid)),
    pendentes: vencidas.map(t => t.id),
  }
}

export async function emAbertoDoPlano(planId: string): Promise<EmAbertoDoPlano | null> {
  const admin = createAdminClient()

  const [{ data: plan }, { data: txs, error }] = await Promise.all([
    admin.from('treatment_plans').select('id, name, status').eq('id', planId).maybeSingle(),
    admin
      .from('financial_transactions')
      .select('id, amount, is_paid, due_date, created_at')
      .eq('treatment_plan_id', planId)
      .eq('type', 'INCOME')
      .order('created_at'),
  ])

  if (!plan) return null
  // Erro descartado aqui viraria "R$ 0,00 em aberto" — ou seja, a recepção
  // deixaria de cobrar sem saber. Melhor não afirmar nada.
  if (error) throw new Error(`Erro ao ler o financeiro do plano: ${error.message}`)

  return {
    planId: plan.id as string,
    nome:   (plan.name as string | null) ?? null,
    ...separarOEmAberto((txs ?? []) as LinhaDoPlano[], new Date()),
  }
}
