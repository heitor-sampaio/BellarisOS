'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { dividirEmParcelas, rotuloDaParcela } from '@/lib/checkout/parcelas'
import { lancarCore, marcarPagoCore, FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { vencimentoDoDia, vencimentosRecorrentes, type FrequenciaRecorrente } from '@/lib/financeiro/vencimentos'
import { logHistory } from '@/lib/appointments/avisos'

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
): Promise<{ error?: string; success?: boolean }> {
  try {
    // O mesmo envio (a chave da tela) lança UMA vez (D10, lib/envio-unico.ts):
    // o lançamento repetido somava em dobro no caixa.
    const ctx = await getTenantContext()
    return await umaVez(ctx.tenantId!, 'createTransactionAdvanced', chaveDoEnvio(formData),
      () => lancarPeloFormulario(formData), { gravou: r => !!r.success })
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

async function lancarPeloFormulario(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')

    const branchId      = str(formData, '_branchId')
    const slug          = str(formData, '_slug') ?? ''
    if (!branchId) return { error: 'Unidade não identificada.' }

    // A unidade vem do formulário. Sem conferir, o lançamento caía na unidade
    // de QUALQUER rede — e quem é de unidade lançava na unidade vizinha.
    if (ctx.branchId !== null && branchId !== ctx.branchId) return { error: 'Unidade não identificada.' }
    const unidade = await ler(createAdminClient()
      .from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'conferir a unidade do lançamento')
    if (!unidade) return { error: 'Unidade não identificada.' }

    const type          = str(formData, 'type') as 'INCOME' | 'EXPENSE' | null
    const category      = str(formData, 'category')
    const description   = str(formData, 'description')
    const amount        = num(formData, 'amount')
    const paymentMethod = str(formData, 'payment_method') || null
    const dueDate       = str(formData, 'due_date') || null
    const notes         = str(formData, 'notes')
    const isPaid        = str(formData, 'is_paid') === 'true'
    const paidOn        = str(formData, 'paid_on')
    const scheduleMode  = str(formData, 'schedule_mode') ?? 'single'
    // r4-f15-02: a bandeira do cartão da receita paga, opcional (lancarCore confere).
    const bandeira      = str(formData, 'cartao_bandeira')
    // F16-5: as vezes no crédito da receita paga (lancarCore confere o limite da clínica).
    const vezesNoCartao = str(formData, 'cartao_vezes')

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
      if (txErr) { console.error('[createTransactionAdvanced]', txErr.message); return { error: 'Não consegui gravar os lançamentos. Tente de novo.' } }

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
      if (txErr) { console.error('[createTransactionAdvanced]', txErr.message); return { error: 'Não consegui gravar os lançamentos. Tente de novo.' } }

    // -- Único (comportamento padrão) ------------------------------
    } else {
      // O núcleo (lib/financeiro/lancamento.ts) é o mesmo do Copilot.
      const r = await lancarCore(admin, ctx, {
        branchId, tipo: type, categoria: category, descricao: description, valor: amount,
        formaDePagamento: paymentMethod, vencimento: dueDate, pago: isPaid, pagoEm: paidOn, observacoes: notes,
        bandeira, vezes: vezesNoCartao ? Number(vezesNoCartao) : null,
      })
      if ('error' in r) return { error: r.error }
    }

    if (slug) revalidatePath(`/${slug}/financeiro`)
    revalidatePath('/admin/financeiro')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

export async function markTransactionPaid(
  transactionId: string, slug: string, bandeira?: string | null, vezes?: number | null,
  /**
   * D6 da 6ª simulação: a forma, para o lançamento que não tem meio (a parcela
   * do crediário da clínica nasce sem), escolhida na baixa.
   */
  forma?: string | null,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'cashier', 'MANAGE')
    if (forma != null && !(FORMAS_DE_PAGAMENTO as readonly string[]).includes(forma)) return { error: 'Forma de pagamento inválida.' }

    // O núcleo (lib/financeiro/lancamento.ts) é o mesmo do Copilot: confere a
    // rede e a unidade ao alcance antes de escrever. A bandeira (r3-f13-01)
    // só vale no cartão; as vezes (F17-5), só no crédito.
    const r = await marcarPagoCore(createAdminClient(), ctx, transactionId, forma ?? null, bandeira ?? null, vezes ?? null)
    if ('error' in r) return { error: r.error }

    // Os dois portais operam o mesmo caixa: quem abre pela rede precisa ver o
    // estado mudar lá, não só na tela da unidade.
    if (slug) revalidatePath(`/${slug}/financeiro`)
    revalidatePath('/admin/financeiro')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
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
 *
 * O lançamento de uma VENDA DE PRODUTO estorna a venda inteira (H2, decisão
 * do Heitor, 2026-11-01: "estorno de produto precisa ter um campo para indicar
 * se houve devolução de produto ou não; se sim, produto volta ao estoque"):
 * `voltou` é obrigatório, e `produto_estornar_venda` estorna o pago, cancela
 * o a receber e a comissão, devolve o produto aos lotes (ou o deixa como
 * perda) e tira a venda das Vendas e do custo — numa transação.
 */
export async function reverseTransaction(transactionId: string, slug: string, motivo?: string, voltou?: boolean) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    // O motivo é obrigatório e fica gravado nas duas pontas (A36 da simulação
    // de 2026-10-27): o estorno não perguntava por quê.
    const porque = (motivo ?? '').trim().slice(0, 500)
    if (!porque) return { error: 'Diga o motivo do estorno.' }

    const admin = createAdminClient()
    // A rede a função do banco confere; a UNIDADE é daqui (§11) — até
    // 2026-09-28 a unidade A estornava o lançamento da B.
    const tx = await ler(admin
      .from('financial_transactions')
      .select('branch_id, product_sale_id, appointment_id, branches!inner(tenant_id)')
      .eq('id', transactionId)
      .maybeSingle(), 'buscar o lançamento')
    const txTenant = (tx?.branches as unknown as { tenant_id: string } | null)?.tenant_id
    if (!tx || txTenant !== ctx.tenantId || !alcancaUnidade(ctx, tx.branch_id as string)) {
      return { error: 'Lançamento não encontrado.' }
    }
    if (tx.product_sale_id) {
      if (typeof voltou !== 'boolean') return { error: 'Diga se o produto voltou ao estoque.' }
      await gravar(
        admin.rpc('produto_estornar_venda', {
          p_tenant: ctx.tenantId!,
          p_venda:  tx.product_sale_id as string,
          p_ator:   ctx.internalUserId,
          p_motivo: porque,
          p_voltou: voltou,
        }),
        'estornar a venda de produto',
      )
      if (slug) { revalidatePath(`/${slug}/financeiro`); revalidatePath(`/${slug}/estoque`) }
      revalidatePath('/admin/financeiro')
      revalidatePath('/admin/estoque')
      return { success: true }
    }
    await gravar(
      admin.rpc('estornar_transacao', {
        p_transacao: transactionId,
        p_tenant:    ctx.tenantId!,
        p_ator:      ctx.internalUserId,
        p_motivo:    porque,
      }),
      'estornar o lançamento',
    )
    // O estorno do recebimento entra no histórico do atendimento (A51 da 5ª
    // simulação: o histórico dizia "Pagamento recebido" duas vezes e nenhum
    // estorno). Acessório: falhar aqui não desfaz o estorno (fica no log).
    if (tx.appointment_id) {
      await logHistory(admin, tx.appointment_id as string, ctx.internalUserId, ctx.userName || ctx.roleLabel || 'Equipe',
        'PAYMENT_REVERSED', `Pagamento estornado — ${porque}`)
      if (slug) revalidatePath(`/${slug}/agenda/${tx.appointment_id}`)
      revalidatePath(`/admin/agenda/${tx.appointment_id}`)
    }

    if (slug) revalidatePath(`/${slug}/financeiro`)
    revalidatePath('/admin/financeiro')
    return { success: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Marca como RECEBIDA, antes da data, uma parcela do cartão em N vezes que a
 * operadora deposita (F2c da 5ª simulação: a operadora antecipou). Na data ela
 * vira recebida sozinha — isto é só a antecipação.
 *
 * Não é receita: a venda já entrou inteira no dia dela ("conta no mês do dia
 * da venda", o Heitor, 2026-11-01). Muda só o "A receber da operadora".
 * Quem lança no financeiro (`financial: MANAGE`, sem "só os meus") e alcança
 * a unidade da parcela.
 */
export async function anteciparParcelaDaOperadora(parcelaId: string, slug?: string) {
  return mudarParcelaDaOperadora(parcelaId, slug, 'recebivel_do_cartao_receber', 'marcar a parcela como recebida')
}

/**
 * Desfaz o "Marcar recebida" (r2-fin-02; o Heitor, 2026-11-03: "mudar
 * solicitando confirmação antes de desfazer"): a parcela ANTECIPADA volta a
 * receber. A que venceu (recebida sozinha na data), a cancelada e a
 * estornada, o banco recusa. A confirmação é da tela. Mesma permissão e
 * alcance do marcar.
 */
export async function desfazerRecebimentoDaParcelaDaOperadora(parcelaId: string, slug?: string) {
  return mudarParcelaDaOperadora(parcelaId, slug, 'recebivel_do_cartao_desfazer', 'desfazer o recebimento da parcela')
}

async function mudarParcelaDaOperadora(
  parcelaId: string, slug: string | undefined,
  funcao: 'recebivel_do_cartao_receber' | 'recebivel_do_cartao_desfazer', oQue: string,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    if (isOwnScope(ctx, 'financial')) return { error: 'Seu cargo não libera esta ação.' }
    if (!/^[0-9a-f-]{36}$/i.test(parcelaId)) return { error: 'Parcela não encontrada.' }

    const admin = createAdminClient()
    const parcela = await ler(admin
      .from('recebiveis_do_cartao')
      .select('branch_id, tenant_id')
      .eq('id', parcelaId)
      .maybeSingle(), 'buscar a parcela da operadora')
    if (!parcela || parcela.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, parcela.branch_id as string)) {
      return { error: 'Parcela não encontrada.' }
    }
    await gravar(
      admin.rpc(funcao, {
        p_tenant: ctx.tenantId!, p_recebivel: parcelaId, p_ator: ctx.internalUserId ?? ctx.userId,
      }),
      oQue,
    )
    if (slug) revalidatePath(`/${slug}/financeiro`)
    revalidatePath('/admin/financeiro')
    return { success: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
