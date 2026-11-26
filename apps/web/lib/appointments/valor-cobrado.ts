import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/** O que o atendimento COBRADO custou à cliente (pago ou no crediário): o preço menos o desconto comercial da recepção. */
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
      .select('appointment_id, amount, loyalty_discount, sale_discount, notes, category, is_paid')
      .in('appointment_id', ids.slice(i, i + 150)).eq('type', 'INCOME').is('estorno_de', null),
    'ler o valor cobrado dos atendimentos') ?? []) as {
      appointment_id: string; amount: number | string; loyalty_discount: number | string | null
      sale_discount: number | string | null; notes: string | null; category: string | null; is_paid: boolean
    }[]
    for (const l of linhas) {
      if (l.notes === 'Estornada' || l.category === 'Estorno') continue
      // D4 da 34ª (princípio 3): no crediário, o cobrado é a entrada MAIS as
      // parcelas em aberto (R$ 90 + R$ 100 = R$ 190; o cartão mostrava R$ 90).
      // A régua do "já cobrado" de confirmar_pagamento_do_atendimento: o vivo,
      // pago ou com nota; a reserva sem nota do concluído sem pagar não é cobrança.
      if (!l.is_paid && l.notes == null) continue
      const centavos = (v: unknown) => Math.round(Number(v ?? 0) * 100)
      // D1 da 18ª ("+ Outra forma", 2026-11-16): o pagamento em várias formas é
      // um lançamento por forma — soma-se à anterior, em vez de ficar com a última.
      const anterior = valores.get(l.appointment_id)
      valores.set(l.appointment_id, {
        cobrado:  (Math.round((anterior?.cobrado ?? 0) * 100) + centavos(l.amount) + centavos(l.loyalty_discount)) / 100,
        desconto: (Math.round((anterior?.desconto ?? 0) * 100) + centavos(l.sale_discount)) / 100,
      })
    }
  }
  return valores
}
