'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
}
function num(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

export async function createTransaction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const branchId      = str(formData, '_branchId')
    const slug          = str(formData, '_slug') ?? ''
    if (!branchId) return { error: 'Filial não identificada.' }

    const type          = str(formData, 'type') as 'INCOME' | 'EXPENSE' | null
    const category      = str(formData, 'category')
    const description   = str(formData, 'description')
    const amount        = num(formData, 'amount')
    const paymentMethod = str(formData, 'payment_method') || null
    const dueDate       = str(formData, 'due_date') || null
    const notes         = str(formData, 'notes')
    const isPaid        = str(formData, 'is_paid') === 'true'

    if (!type)              return { error: 'Tipo é obrigatório.' }
    if (!category)          return { error: 'Categoria é obrigatória.' }
    if (!description)       return { error: 'Descrição é obrigatória.' }
    if (!amount || amount <= 0) return { error: 'Valor deve ser maior que zero.' }

    const admin = createAdminClient()
    const { error } = await admin.from('financial_transactions').insert({
      branch_id:      branchId,
      type,
      category,
      description,
      amount,
      payment_method: paymentMethod,
      due_date:       dueDate,
      is_paid:        isPaid,
      paid_at:        isPaid ? new Date().toISOString() : null,
      notes,
      created_by:     ctx.internalUserId,
    })

    if (error) return { error: error.message }

    revalidatePath(`/${slug}/financial`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Nova movimentação com suporte a parcelas e recorrência -------

type RecurringFreq = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'yearly'

function addFrequency(date: Date, freq: RecurringFreq, n: number): Date {
  const d = new Date(date)
  switch (freq) {
    case 'weekly':     d.setDate(d.getDate() + 7 * n);   break
    case 'biweekly':   d.setDate(d.getDate() + 14 * n);  break
    case 'monthly':    d.setMonth(d.getMonth() + n);      break
    case 'bimonthly':  d.setMonth(d.getMonth() + 2 * n); break
    case 'quarterly':  d.setMonth(d.getMonth() + 3 * n); break
    case 'yearly':     d.setFullYear(d.getFullYear() + n); break
  }
  return d
}

export async function createTransactionAdvanced(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const branchId      = str(formData, '_branchId')
    const slug          = str(formData, '_slug') ?? ''
    if (!branchId) return { error: 'Filial não identificada.' }

    const type          = str(formData, 'type') as 'INCOME' | 'EXPENSE' | null
    const category      = str(formData, 'category')
    const description   = str(formData, 'description')
    const amount        = num(formData, 'amount')
    const paymentMethod = str(formData, 'payment_method') || null
    const dueDate       = str(formData, 'due_date') || null
    const notes         = str(formData, 'notes')
    const isPaid        = str(formData, 'is_paid') === 'true'
    const scheduleMode  = str(formData, 'schedule_mode') ?? 'single'

    if (!type)                return { error: 'Tipo é obrigatório.' }
    if (!category)            return { error: 'Categoria é obrigatória.' }
    if (!description)         return { error: 'Descrição é obrigatória.' }
    if (!amount || amount <= 0) return { error: 'Valor deve ser maior que zero.' }

    const admin = createAdminClient()

    // -- Parcelado -------------------------------------------------
    if (scheduleMode === 'installments' && type === 'EXPENSE') {
      const count      = parseInt(str(formData, 'installment_count') ?? '2', 10)
      const firstDue   = str(formData, 'first_due_date')
      if (!count || count < 2 || count > 48) return { error: 'Número de parcelas inválido (2–48).' }
      if (!firstDue) return { error: 'Informe o vencimento da 1ª parcela.' }

      const { data: tx, error: txErr } = await admin
        .from('financial_transactions')
        .insert({
          branch_id:   branchId,
          type,
          category,
          description,
          amount,
          is_paid:     false,
          notes:       notes ?? null,
          created_by:  ctx.internalUserId,
        })
        .select('id')
        .single()

      if (txErr || !tx) return { error: txErr?.message ?? 'Erro ao criar transação.' }

      const installmentAmount = Math.round((amount / count) * 100) / 100
      const baseDate = new Date(firstDue)
      const rows = Array.from({ length: count }, (_, i) => {
        const due = new Date(baseDate)
        due.setMonth(due.getMonth() + i)
        return {
          transaction_id: tx.id,
          number:         i + 1,
          total:          count,
          amount:         installmentAmount,
          due_date:       due.toISOString(),
          is_paid:        false,
        }
      })

      const { error: instErr } = await admin.from('installments').insert(rows)
      if (instErr) return { error: instErr.message }

    // -- Recorrente ------------------------------------------------
    } else if (scheduleMode === 'recurring' && type === 'EXPENSE') {
      const freq       = (str(formData, 'recurring_freq') ?? 'monthly') as RecurringFreq
      const count      = parseInt(str(formData, 'recurring_count') ?? '2', 10)
      const firstDue   = str(formData, 'first_due_date')
      if (!count || count < 2 || count > 60) return { error: 'Número de repetições inválido (2–60).' }
      if (!firstDue) return { error: 'Informe o primeiro vencimento.' }

      const validFreqs: RecurringFreq[] = ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly']
      if (!validFreqs.includes(freq)) return { error: 'Frequência inválida.' }

      const baseDate = new Date(firstDue)
      const rows = Array.from({ length: count }, (_, i) => ({
        branch_id:   branchId,
        type,
        category,
        description: `${description} (${i + 1}/${count})`,
        amount,
        due_date:    addFrequency(baseDate, freq, i).toISOString(),
        is_paid:     false,
        notes:       notes ?? null,
        created_by:  ctx.internalUserId,
      }))

      const { error: txErr } = await admin.from('financial_transactions').insert(rows)
      if (txErr) return { error: txErr.message }

    // -- Único (comportamento padrão) ------------------------------
    } else {
      const { error } = await admin.from('financial_transactions').insert({
        branch_id:      branchId,
        type,
        category,
        description,
        amount,
        payment_method: paymentMethod,
        due_date:       dueDate,
        is_paid:        isPaid,
        paid_at:        isPaid ? new Date().toISOString() : null,
        notes,
        created_by:     ctx.internalUserId,
      })
      if (error) return { error: error.message }
    }

    revalidatePath(`/${slug}/financial`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function markTransactionPaid(transactionId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const admin = createAdminClient()
    await admin.from('financial_transactions').update({
      is_paid:    true,
      paid_at:    new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', transactionId)

    revalidatePath(`/${slug}/financial`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function reverseTransaction(transactionId: string, branchId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const supabase = await createSupabase()
    const { data: tx } = await supabase
      .from('financial_transactions')
      .select('amount, description, type')
      .eq('id', transactionId)
      .single()

    if (!tx) return { error: 'Transação não encontrada.' }

    const admin = createAdminClient()

    await admin.from('financial_transactions').insert({
      branch_id:   branchId,
      type:        tx.type === 'INCOME' ? 'EXPENSE' : 'INCOME',
      category:    'Estorno',
      description: `Estorno: ${tx.description}`,
      amount:      tx.amount,
      is_paid:     true,
      paid_at:     new Date().toISOString(),
      created_by:  ctx.internalUserId,
    })

    await admin.from('financial_transactions').update({
      notes:      'Estornada',
      updated_at: new Date().toISOString(),
    }).eq('id', transactionId)

    revalidatePath(`/${slug}/financial`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function openCashRegister(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const branchId       = str(formData, '_branchId')
    const slug           = str(formData, '_slug') ?? ''
    const openingBalance = num(formData, 'opening_balance') ?? 0
    const notes          = str(formData, 'notes')

    if (!branchId) return { error: 'Filial não identificada.' }

    const admin = createAdminClient()
    const { error } = await admin.from('cash_registers').insert({
      branch_id:       branchId,
      opening_balance: openingBalance,
      notes,
      opened_by:       ctx.internalUserId,
      opened_at:       new Date().toISOString(),
      status:          'open',
    })

    if (error) return { error: error.message }

    revalidatePath(`/${slug}/financial`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function closeCashRegister(
  _prev: { success?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const registerId     = str(formData, '_registerId')
    const slug           = str(formData, '_slug') ?? ''
    const closingBalance = num(formData, 'closing_balance') ?? 0
    const notes          = str(formData, 'notes')

    if (!registerId) return { error: 'Caixa não identificado.' }

    const admin = createAdminClient()
    const { error } = await admin.from('cash_registers').update({
      closing_balance: closingBalance,
      notes,
      closed_by:  ctx.internalUserId,
      closed_at:  new Date().toISOString(),
      status:     'closed',
    }).eq('id', registerId)

    if (error) return { error: error.message }

    revalidatePath(`/${slug}/financial`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}
