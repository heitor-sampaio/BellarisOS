import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { contarSessoesDosPlanos, type AgendamentoDaSessaoFeita, type SessoesDoPlano } from '@/lib/plano-de-tratamento/sessoes-feitas'
import { juntarAsFormasDaParcela, type FormaDaParcela, type LinhaParaJuntar } from '@/lib/financeiro/formas-da-parcela'

/**
 * O dinheiro e as sessões de UM plano de tratamento (J-42, 2026-10-30): o
 * valor, o recebido e o a receber vêm de `metrics_financeiro_do_plano` (a
 * regra única de receita) — a tela não soma. Os lançamentos (entrada e
 * parcelas) são uma lista curta, mostrada linha a linha.
 */
export interface LancamentoDoPlano {
  id:            string
  descricao:     string | null
  valor:         number
  pago:          boolean
  pagoEm:        string | null
  vencimento:    string | null
  parcelaNumero: number | null
  parcelaTotal:  number | null
  forma:         string | null
  cartaoVezes:   number | null
  /** Limite da 21ª: a parcela recebida em várias formas, numa linha (o valor é o total). */
  formas?:       FormaDaParcela[] | null
}

export interface FinanceiroDoPlano {
  valor:      number
  recebido:   number
  aReceber:   number
  sessoes:    { total: number; feitas: number; agendadas: number }
  lancamentos: LancamentoDoPlano[]
}

const n = (v: unknown): number => (v == null ? 0 : Number(v))

export async function getFinanceiroDoPlano(tenantId: string, planId: string): Promise<FinanceiroDoPlano> {
  const admin = createAdminClient()
  const [resumo, linhas] = await Promise.all([
    ler(admin.rpc('metrics_financeiro_do_plano', { p_tenant: tenantId, p_plan: planId }).maybeSingle(),
      'contar o dinheiro e as sessões do plano'),
    // Lista curta (a entrada e até 12 parcelas): sem os dois lados do estorno
    // e sem o zerado, que é histórico de um saldo substituído.
    ler(admin.from('financial_transactions')
      .select('id, description, amount, is_paid, paid_at, due_date, parcela_numero, parcela_total, payment_method, cartao_vezes, created_at')
      .eq('treatment_plan_id', planId).eq('type', 'INCOME').gt('amount', 0)
      .or('notes.is.null,notes.neq.Estornada').or('category.is.null,category.neq.Estorno')
      .order('created_at').order('parcela_numero', { nullsFirst: true }).order('id')
      .limit(100), 'listar os lançamentos do plano'),
  ])
  const r = (resumo ?? {}) as Record<string, unknown>
  return {
    valor:    n(r.valor),
    recebido: n(r.recebido),
    aReceber: n(r.a_receber),
    sessoes:  { total: n(r.sessoes_total), feitas: n(r.sessoes_feitas), agendadas: n(r.sessoes_agendadas) },
    // Limite da 21ª: as formas da mesma parcela numa linha só.
    lancamentos: juntarAsFormasDaParcela((linhas ?? []) as unknown as (LinhaParaJuntar & Record<string, unknown>)[]).map(l => ({
      id:            String(l.id),
      descricao:     (l.description as string | null) ?? null,
      valor:         n(l.amount),
      pago:          !!l.is_paid,
      pagoEm:        (l.paid_at as string | null) ?? null,
      vencimento:    (l.due_date as string | null) ?? null,
      parcelaNumero: (l.parcela_numero as number | null) ?? null,
      parcelaTotal:  (l.parcela_total as number | null) ?? null,
      forma:         (l.payment_method as string | null) ?? null,
      cartaoVezes:   (l.cartao_vezes as number | null) ?? null,
      formas:        l.formasDaParcela,
    })),
  }
}

/**
 * As sessões de VÁRIOS planos (D4 da 42ª): o total e as feitas de cada um, pela
 * régua de `metrics_financeiro_do_plano` (`sessaoFeitaDoPlano`), para a lista de
 * Tratamentos dizer "Concluído" (PL-20). Em lotes de ids e em páginas
 * (`lerTodas`). Quem chama já conferiu a rede e o alcance dos planos.
 */
export async function getSessoesDosPlanos(planIds: string[]): Promise<Map<string, SessoesDoPlano>> {
  if (!planIds.length) return new Map()
  const admin = createAdminClient()
  type Lida = { plan_id: string; appointments: AgendamentoDaSessaoFeita | AgendamentoDaSessaoFeita[] | null }
  const linhas: { plan_id: string; appointments: AgendamentoDaSessaoFeita | null }[] = []
  for (let i = 0; i < planIds.length; i += 150) {
    const lote = planIds.slice(i, i + 150)
    const lidas = await lerTodas<Lida>((de, ate) => admin.from('treatment_plan_sessions')
      .select('plan_id, appointments:appointment_id(status, started_at)')
      .in('plan_id', lote).order('id').range(de, ate),
      'contar as sessões dos planos')
    // O embed por chave estrangeira vem como objeto (o tipo do cliente o diz lista).
    for (const l of lidas) {
      const a = Array.isArray(l.appointments) ? (l.appointments[0] ?? null) : l.appointments
      linhas.push({ plan_id: l.plan_id, appointments: a })
    }
  }
  return contarSessoesDosPlanos(planIds, linhas)
}
