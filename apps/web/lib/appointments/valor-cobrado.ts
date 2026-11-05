import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/** O que o atendimento PAGO custou à cliente: o preço menos o desconto comercial da recepção. */
export interface ValorCobrado {
  /** O preço com o desconto (`amount + loyalty_discount`): os pontos são forma de pagamento, não desconto. */
  cobrado:  number
  /** O desconto comercial (`sale_discount`), 0 sem desconto. */
  desconto: number
}

/**
 * D8 da 7ª simulação (2026-11-05; princípio 3): a Agenda do app mostrava a
 * Toxina da Ana a R$ 1.200 (o preço de tabela do agendamento) e Pagamentos,
 * R$ 1.100 — o desconto mora no LANÇAMENTO (`sale_discount`, fora de
 * `amount`; vendas-financeiro.md §9.6). Por agendamento, o lançamento VIVO
 * (sem o estornado nem o estorno) do pagamento dele. Quem chama já conferiu
 * que os agendamentos são da cliente; aqui só se lê pelo cliente de serviço.
 */
export async function valoresCobrados(admin: Admin, agendamentos: string[]): Promise<Map<string, ValorCobrado>> {
  const valores = new Map<string, ValorCobrado>()
  const ids = [...new Set(agendamentos.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 150) {
    const linhas = (await ler(admin.from('financial_transactions')
      .select('appointment_id, amount, loyalty_discount, sale_discount, notes, category')
      .in('appointment_id', ids.slice(i, i + 150)).eq('type', 'INCOME').eq('is_paid', true),
    'ler o valor cobrado dos atendimentos') ?? []) as {
      appointment_id: string; amount: number | string; loyalty_discount: number | string | null
      sale_discount: number | string | null; notes: string | null; category: string | null
    }[]
    for (const l of linhas) {
      if (l.notes === 'Estornada' || l.category === 'Estorno') continue
      const centavos = (v: unknown) => Math.round(Number(v ?? 0) * 100)
      valores.set(l.appointment_id, {
        cobrado:  (centavos(l.amount) + centavos(l.loyalty_discount)) / 100,
        desconto: centavos(l.sale_discount) / 100,
      })
    }
  }
  return valores
}
