import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Caixa aberto de uma filial, ou `null` se não houver nenhum.
 *
 * "Aberto" é `closed_at is null` — a tabela `cash_registers` não tem coluna
 * `status`. As actions de abrir/fechar gravavam `status: 'open' | 'closed'`, o
 * PostgREST devolvia 42703 e o insert falhava inteiro; como a tela nunca foi
 * montada, o erro nunca apareceu (a tabela estava com zero linhas).
 */
export type OpenCashRegister = {
  id:              string
  opening_balance: number
  opened_at:       string
  notes:           string | null
}

export async function getOpenCashRegister(branchId: string): Promise<OpenCashRegister | null> {
  const { data, error } = await createAdminClient()
    .from('cash_registers')
    .select('id, opening_balance, opened_at, notes')
    .eq('branch_id', branchId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getOpenCashRegister]', error.message)
    return null
  }
  if (!data) return null

  return {
    id:              data.id as string,
    opening_balance: Number(data.opening_balance ?? 0),
    opened_at:       data.opened_at as string,
    notes:           (data.notes as string | null) ?? null,
  }
}

/**
 * Id do caixa aberto, para carimbar em `financial_transactions.cash_register_id`
 * no momento em que o dinheiro entra. Sem caixa aberto devolve `null`: o
 * pagamento acontece do mesmo jeito, só não é atribuído a nenhum fechamento.
 */
export async function getOpenCashRegisterId(branchId: string | null): Promise<string | null> {
  if (!branchId) return null
  return (await getOpenCashRegister(branchId))?.id ?? null
}

/** Movimento que passou por este caixa desde a abertura. */
export async function getCashRegisterTotals(registerId: string): Promise<{ income: number; expense: number }> {
  const { data, error } = await createAdminClient()
    .from('financial_transactions')
    .select('type, amount')
    .eq('cash_register_id', registerId)
    .eq('is_paid', true)

  if (error) {
    console.error('[getCashRegisterTotals]', error.message)
    return { income: 0, expense: 0 }
  }

  let income = 0
  let expense = 0
  for (const t of (data ?? []) as { type: string; amount: unknown }[]) {
    const amount = Number(t.amount ?? 0)
    if (t.type === 'INCOME') income += amount
    else expense += amount
  }
  return { income, expense }
}
