'use server'

/**
 * A venda de PRODUTO (D4, decisão do Heitor, 2026-10-29): pelo "Vender" da
 * ficha da cliente, para quem recebe (`podeReceber`, como o pacote e o
 * pré-pago). Exige cliente cadastrada; só produto de revenda; o estoque baixa
 * pelo lote que vence primeiro; o dinheiro entra no caixa e no faturamento.
 *
 * Todo export é endpoint público: confere permissão, rede e alcance.
 */

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, alcancaUnidade, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { EntradaDoPagamento, lancamentosDoPagamento } from '@/lib/checkout/lancamentos'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto } from '@/lib/vendas/desconto'

const UUID = /^[0-9a-f-]{36}$/i

/**
 * Vende N embalagens de um produto à cliente: a venda (com o retrato do preço,
 * do desconto e do custo do que saiu), a baixa e o dinheiro, numa transação
 * (`produto_vender`). O app calcula o desconto e os lançamentos; o banco
 * confere que fecham com o preço e que há estoque.
 */
export async function venderProduto(
  clienteId: string, produtoId: string, branchId: string,
  quantidade: unknown, pagamento: unknown, desconto?: unknown,
): Promise<{ error?: string; vendaId?: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    if (typeof clienteId !== 'string' || !UUID.test(clienteId)) {
      return { error: 'Escolha a cliente: a venda de produto é para uma cliente cadastrada (o cadastro rápido serve).' }
    }
    if (![produtoId, branchId].every(v => typeof v === 'string' && UUID.test(v))) return { error: 'Dados inválidos.' }
    const qtd = Number(quantidade)
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100) return { error: 'Quantidade inválida (de 1 a 100).' }
    const lido = EntradaDoPagamento.safeParse(pagamento)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Pagamento inválido.' }
    const d = EntradaDoDesconto.safeParse(desconto)
    if (!d.success) return { error: 'Desconto inválido.' }

    const admin = createAdminClient()
    const [unidade, cliente, produto] = await Promise.all([
      ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a cliente'),
      ler(admin.from('products').select('id, name, sale_price, uso, is_active')
        .eq('id', produtoId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o produto'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    if (!cliente) return { error: 'Cliente não encontrada.' }
    if (!produto) return { error: 'Produto não encontrado.' }
    if (produto.is_active === false) return { error: 'Este produto está desativado.' }
    if ((produto.uso !== 'REVENDA' && produto.uso !== 'AMBOS') || produto.sale_price == null) {
      return { error: 'Este produto não é de revenda: marque o uso e o preço de venda no cadastro.' }
    }

    const tabela = Math.round(Number(produto.sale_price) * 100) * qtd / 100
    const recusa = recusaDoDesconto(tabela, d.data)
    if (recusa) return { error: recusa }
    const reais = descontoEmReais(tabela, d.data)
    const vendido = Math.round((tabela - reais) * 100) / 100

    const { data, error } = await admin.rpc('produto_vender', {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_produto: produtoId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_quantidade: qtd, p_desconto: reais,
      p_lancamentos: lancamentosDoPagamento(vendido, lido.data, `${qtd}× ${produto.name as string}`),
    })
    if (error) {
      // A recusa do banco (estoque insuficiente, desconto, revenda) é para a tela.
      if (error.code === 'P0001' || error.code === 'P0002') return { error: error.message }
      throw new Error(`Não consegui vender o produto: ${error.message}`)
    }

    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidatePath('/admin/financeiro')
    revalidatePath('/[slug]/financeiro', 'page')
    revalidatePath('/admin/estoque')
    revalidatePath('/[slug]/estoque', 'page')
    revalidateTag(`products:${ctx.tenantId!}`, { expire: 0 })
    return { vendaId: data as string }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

