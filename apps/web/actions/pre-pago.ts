'use server'

/**
 * Procedimento pré-pago (decisão do Heitor, 2026-09-30): o cliente compra N
 * unidades de UM procedimento, paga (ou fica a receber) e agenda depois.
 * Separado do pacote. Quem recebe dinheiro vende e cancela (caixa ou
 * financeiro), como no pacote.
 *
 * Todo export é endpoint público: cada um confere permissão, rede e alcance.
 */

import { revalidatePath } from 'next/cache'
import { getTenantContext, alcancaUnidade, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { EntradaDoPagamento, lancamentosDoPagamento } from '@/lib/checkout/lancamentos'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto, ratear } from '@/lib/vendas/desconto'

const UUID = /^[0-9a-f-]{36}$/i

function revalidarFicha() {
  revalidatePath('/admin/clients/[id]', 'page')
  revalidatePath('/[slug]/clients/[id]', 'page')
  revalidatePath('/admin/financeiro')
  revalidatePath('/[slug]/financeiro', 'page')
}

/**
 * Vende N unidades de um procedimento: a venda (com o retrato do preço e do
 * desconto), as unidades (cada uma com a sua parte do preço vendido, rateio
 * igual em centavos) e o dinheiro, numa transação (`procedimento_vender`).
 */
export async function venderProcedimento(
  clienteId: string, procedimentoId: string, branchId: string,
  quantidade: unknown, validadeDias: unknown, pagamento: unknown, desconto?: unknown,
): Promise<{ error?: string; saleId?: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    if (![clienteId, procedimentoId, branchId].every(v => typeof v === 'string' && UUID.test(v))) return { error: 'Dados inválidos.' }
    const qtd = Number(quantidade)
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100) return { error: 'Quantidade inválida (de 1 a 100).' }
    const validade = validadeDias == null || validadeDias === '' ? null : Number(validadeDias)
    if (validade != null && (!Number.isInteger(validade) || validade < 1 || validade > 3650)) return { error: 'Validade inválida.' }
    const lido = EntradaDoPagamento.safeParse(pagamento)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Pagamento inválido.' }
    const d = EntradaDoDesconto.safeParse(desconto)
    if (!d.success) return { error: 'Desconto inválido.' }

    const admin = createAdminClient()
    const [unidade, cliente, proc] = await Promise.all([
      ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente'),
      ler(admin.from('procedures').select('id, name, price, is_active, branch_id')
        .eq('id', procedimentoId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    if (!cliente) return { error: 'Cliente não encontrado.' }
    if (!proc) return { error: 'Procedimento não encontrado.' }
    if (proc.is_active === false) return { error: 'Este procedimento está desativado.' }
    if (proc.branch_id && proc.branch_id !== branchId) return { error: 'Este procedimento é de outra unidade.' }

    const tabela = Math.round(Number(proc.price ?? 0) * 100) * qtd / 100
    const recusa = recusaDoDesconto(tabela, d.data)
    if (recusa) return { error: recusa }
    const reais = descontoEmReais(tabela, d.data)
    const vendido = Math.round((tabela - reais) * 100) / 100

    const rotulo = `${qtd}× ${proc.name as string}`
    const saleId = await gravar(admin.rpc('procedimento_vender', {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_procedimento: procedimentoId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_quantidade: qtd, p_desconto: reais, p_validade_dias: validade,
      p_lancamentos: lancamentosDoPagamento(vendido, lido.data, rotulo),
      // Cada unidade com a sua parte do vendido: a base da comissão dela.
      p_unidades: ratear(Array.from({ length: qtd }, () => 1), vendido).map(preco => ({ preco })),
    }), 'vender o procedimento') as string

    revalidarFicha()
    return { saleId }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Cancela uma unidade ainda disponível, com motivo. O que o cliente pagou além
 * do que a venda passou a valer fica registrado como DEVOLUÇÃO a pagar no
 * financeiro (e, se ele ainda devia, o a receber diminui antes) —
 * `procedimento_cancelar_unidade`, numa transação.
 */
export async function cancelarUnidadePrePaga(
  unidadeId: string, motivo: unknown,
): Promise<{ error?: string; devolver?: number; reduzido?: number }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    if (typeof unidadeId !== 'string' || !UUID.test(unidadeId)) return { error: 'Dados inválidos.' }
    const texto = typeof motivo === 'string' ? motivo.trim() : ''
    if (!texto) return { error: 'Informe o motivo do cancelamento.' }
    if (texto.length > 500) return { error: 'Motivo longo demais.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('procedure_sale_units')
      .select('id, procedure_sales!inner(tenant_id, branch_id)')
      .eq('id', unidadeId).maybeSingle(), 'buscar a unidade')
    const venda = unidade?.procedure_sales as unknown as { tenant_id: string; branch_id: string } | undefined
    if (!unidade || venda?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, venda.branch_id)) {
      return { error: 'Unidade não encontrada.' }
    }

    const r = await gravar(admin.rpc('procedimento_cancelar_unidade', {
      p_tenant: ctx.tenantId!, p_unidade: unidadeId, p_ator: ctx.internalUserId ?? null, p_motivo: texto,
    }), 'cancelar a unidade') as { devolver: number; reduzido: number }

    revalidarFicha()
    return { devolver: Number(r.devolver), reduzido: Number(r.reduzido) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
