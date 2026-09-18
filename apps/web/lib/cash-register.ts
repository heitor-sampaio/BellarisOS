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

/**
 * Caixa aberto de cada filial, em duas consultas em vez de duas por unidade.
 *
 * É o que o portal da rede precisa: ver de relance quais caixas estão abertos e
 * quanto passou por cada um. Chamar `getOpenCashRegister` + `getCashRegisterTotals`
 * numa rede de cinco filiais seriam dez idas ao banco para montar uma lista.
 */
export type CaixaDaUnidade = {
  branchId: string
  register: OpenCashRegister | null
  income:   number
  expense:  number
}

export async function getOpenCashRegistersByBranch(branchIds: string[]): Promise<CaixaDaUnidade[]> {
  const vazio = (id: string): CaixaDaUnidade => ({ branchId: id, register: null, income: 0, expense: 0 })
  if (branchIds.length === 0) return []

  const admin = createAdminClient()
  const { data: abertos, error } = await admin
    .from('cash_registers')
    .select('id, branch_id, opening_balance, opened_at, notes')
    .in('branch_id', branchIds)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })

  // Erro aqui não pode virar "todos os caixas fechados": alguém abriria um
  // segundo caixa por cima do que já está aberto.
  if (error) throw new Error(`Erro ao ler os caixas das unidades: ${error.message}`)

  type Row = { id: string; branch_id: string; opening_balance: unknown; opened_at: string; notes: string | null }
  const porFilial = new Map<string, Row>()
  for (const r of (abertos ?? []) as Row[]) {
    // `order` desc + primeiro a entrar vence: um caixa por filial é garantido na
    // action, mas a leitura não depende disso.
    if (!porFilial.has(r.branch_id)) porFilial.set(r.branch_id, r)
  }

  const ids = [...porFilial.values()].map(r => r.id)
  const totais = new Map<string, { income: number; expense: number }>()

  if (ids.length > 0) {
    const { data: txs, error: txErr } = await admin
      .from('financial_transactions')
      .select('cash_register_id, type, amount')
      .in('cash_register_id', ids)
      .eq('is_paid', true)
    if (txErr) throw new Error(`Erro ao somar o movimento dos caixas: ${txErr.message}`)

    for (const t of (txs ?? []) as { cash_register_id: string; type: string; amount: unknown }[]) {
      const atual = totais.get(t.cash_register_id) ?? { income: 0, expense: 0 }
      const valor = Number(t.amount ?? 0)
      if (t.type === 'INCOME') atual.income += valor
      else                     atual.expense += valor
      totais.set(t.cash_register_id, atual)
    }
  }

  return branchIds.map(id => {
    const row = porFilial.get(id)
    if (!row) return vazio(id)
    const t = totais.get(row.id) ?? { income: 0, expense: 0 }
    return {
      branchId: id,
      register: {
        id:              row.id,
        opening_balance: Number(row.opening_balance ?? 0),
        opened_at:       row.opened_at,
        notes:           row.notes ?? null,
      },
      income:  t.income,
      expense: t.expense,
    }
  })
}
