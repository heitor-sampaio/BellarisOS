'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { dividirEmParcelas, rotuloDaParcela } from '@/lib/checkout/parcelas'
import { lancarCore, marcarPagoCore } from '@/lib/financeiro/lancamento'
import { vencimentoDoDia, vencimentosRecorrentes, type FrequenciaRecorrente } from '@/lib/financeiro/vencimentos'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
}
function num(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

// --- Nova movimentação com suporte a parcelas e recorrência -------
//
// (Aqui havia um `createTransaction` sem conferência de unidade e sem nenhum
// chamador: endpoint aberto que lançava em qualquer rede. Saiu em 2026-09-27.)

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

    // A unidade vem do formulário. Sem conferir, o lançamento caía na unidade
    // de QUALQUER rede — e quem é de unidade lançava na unidade vizinha.
    if (ctx.branchId !== null && branchId !== ctx.branchId) return { error: 'Filial não identificada.' }
    const unidade = await ler(createAdminClient()
      .from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'conferir a unidade do lançamento')
    if (!unidade) return { error: 'Filial não identificada.' }

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

      // Cada parcela, um lançamento com o seu vencimento (2026-09-30): a despesa
      // inteira num lançamento só aparecia no mês da compra e se pagava de uma vez.
      const grupo = crypto.randomUUID()
      const primeiro = vencimentoDoDia(firstDue)!
      const { error: txErr } = await admin.from('financial_transactions').insert(
        dividirEmParcelas(amount, count, primeiro).map(parcela => ({
          branch_id:      branchId,
          type,
          category,
          description:    `${description} — ${rotuloDaParcela(parcela)}`,
          amount:         parcela.amount,
          payment_method: paymentMethod,
          due_date:       parcela.due_date,
          is_paid:        false,
          notes:          notes ?? null,
          created_by:     ctx.internalUserId,
          parcela_numero: parcela.numero,
          parcela_total:  parcela.total,
          parcela_grupo:  grupo,
        })),
      )
      if (txErr) return { error: txErr.message }

    // -- Recorrente ------------------------------------------------
    } else if (scheduleMode === 'recurring' && type === 'EXPENSE') {
      const freq       = (str(formData, 'recurring_freq') ?? 'monthly') as FrequenciaRecorrente
      const count      = parseInt(str(formData, 'recurring_count') ?? '2', 10)
      const firstDue   = str(formData, 'first_due_date')
      if (!count || count < 2 || count > 60) return { error: 'Número de repetições inválido (2–60).' }
      if (!firstDue) return { error: 'Informe o primeiro vencimento.' }

      const validFreqs: FrequenciaRecorrente[] = ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly']
      if (!validFreqs.includes(freq)) return { error: 'Frequência inválida.' }

      // Ao meio-dia de Brasília, contando em UTC: era meia-noite UTC, e na tela
      // cada vencimento caía um dia antes (revisão de 2026-10-08).
      const vencimentos = vencimentosRecorrentes(firstDue, freq, count)
      const rows = Array.from({ length: count }, (_, i) => ({
        branch_id:   branchId,
        type,
        category,
        description: `${description} (${i + 1}/${count})`,
        amount,
        due_date:    vencimentos[i],
        is_paid:     false,
        notes:       notes ?? null,
        created_by:  ctx.internalUserId,
      }))

      const { error: txErr } = await admin.from('financial_transactions').insert(rows)
      if (txErr) return { error: txErr.message }

    // -- Único (comportamento padrão) ------------------------------
    } else {
      // O núcleo (lib/financeiro/lancamento.ts) é o mesmo do Copilot.
      const r = await lancarCore(admin, ctx, {
        branchId, tipo: type, categoria: category, descricao: description, valor: amount,
        formaDePagamento: paymentMethod, vencimento: dueDate, pago: isPaid, observacoes: notes,
      })
      if ('error' in r) return { error: r.error }
    }

    if (slug) revalidatePath(`/${slug}/financeiro`)
    revalidatePath('/admin/financeiro')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function markTransactionPaid(transactionId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'cashier', 'MANAGE')

    // O núcleo (lib/financeiro/lancamento.ts) é o mesmo do Copilot: confere a
    // rede e a unidade ao alcance antes de escrever.
    const r = await marcarPagoCore(createAdminClient(), ctx, transactionId)
    if ('error' in r) return { error: r.error }

    // Os dois portais operam o mesmo caixa: quem abre pela rede precisa ver o
    // estado mudar lá, não só na tela da unidade.
    if (slug) revalidatePath(`/${slug}/financeiro`)
    revalidatePath('/admin/financeiro')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

/**
 * Estorna um lançamento.
 *
 * As duas gravações — a contra-transação e a marca na original — moram na
 * função `estornar_transacao` do banco, onde são UMA transação. Soltas, como
 * estavam aqui, falhar no meio deixava o estorno pela metade; e como os
 * indicadores leem os dois lados (CLAUDE.md §13.1), a metade que sobra faz o
 * estorno bater duas vezes no resultado.
 *
 * A filial saiu da assinatura: ela vem do registro estornado. Recebê-la do
 * cliente permitia estornar o lançamento de uma unidade e jogar a despesa em
 * outra.
 */
export async function reverseTransaction(transactionId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const admin = createAdminClient()
    // A rede a função do banco confere; a UNIDADE é daqui (§11) — até
    // 2026-09-28 a unidade A estornava o lançamento da B.
    const tx = await ler(admin
      .from('financial_transactions')
      .select('branch_id, branches!inner(tenant_id)')
      .eq('id', transactionId)
      .maybeSingle(), 'buscar o lançamento')
    const txTenant = (tx?.branches as unknown as { tenant_id: string } | null)?.tenant_id
    if (!tx || txTenant !== ctx.tenantId || !alcancaUnidade(ctx, tx.branch_id as string)) {
      return { error: 'Lançamento não encontrado.' }
    }
    await gravar(
      admin.rpc('estornar_transacao', {
        p_transacao: transactionId,
        p_tenant:    ctx.tenantId!,
        p_ator:      ctx.internalUserId,
      }),
      'estornar o lançamento',
    )

    if (slug) revalidatePath(`/${slug}/financeiro`)
    revalidatePath('/admin/financeiro')
    return { success: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
