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
import { CLIENTE_ARQUIVADA } from '@/lib/clients/arquivada'
import { recusaDaVendaNaUnidade } from '@/lib/vendas/unidade-da-venda'
import { getTenantContext, alcancaUnidade, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { quemVendeu, type QuemVendeuDaTela } from '@/lib/vendas/equipe-da-venda'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { EntradaDoPagamento, lancamentosDoPagamento, recusaDaEntradaDoPagamento, comMotivoDoDesconto, comFidelidadeNaPrimeira } from '@/lib/checkout/lancamentos'
import { fidelidadeDaVenda } from '@/lib/fidelidade/na-venda'
import type { EscolhaDaFidelidade } from '@/lib/fidelidade/conta-na-venda'
import { recusaDasParcelasDaRede } from '@/lib/financeiro/crediario-da-rede'
import { recusaDasVezesDoPagamento } from '@/lib/financeiro/vezes-da-rede'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto, motivoDoDesconto } from '@/lib/vendas/desconto'
import { recusaDaQuantidadeDoProduto, recusaDosItensDaVenda, recusaDoValorDaVenda } from '@/lib/vendas/quantidades'

const UUID = /^[0-9a-f-]{36}$/i

/** Um produto da venda: qual e quantas embalagens inteiras. */
export interface ItemDaVenda { produtoId: string; quantidade: number }

/**
 * Vende UM OU VÁRIOS produtos à cliente, com um pagamento só (ven-04 da
 * revisão, 2026-11-02: "a Carla leva 2 séruns e 1 protetor; a Bruna faz duas
 * vendas e recebe duas vezes"): a venda (com o retrato do preço, do desconto e
 * do custo do que saiu), os itens, a baixa de cada produto e o dinheiro, numa
 * transação (`produto_vender_itens`). O app calcula o desconto e os
 * lançamentos; o banco confere que fecham com o preço e que há estoque de cada.
 *
 * `produtos` é a lista de itens; um id sozinho (com `quantidade`) é a venda
 * de um produto só, como antes.
 */
export async function venderProduto(
  clienteId: string, produtos: string | ItemDaVenda[], branchId: string,
  quantidade: unknown, pagamento: unknown, desconto?: unknown,
  /** A chave do envio (D10, lib/envio-unico.ts): o mesmo envio vende UMA vez. */
  envio?: string | null,
  /** "Quem vendeu" (com-06); sem o objeto, quem registra. */
  equipe?: QuemVendeuDaTela | null,
  /** FD2a: os pontos e o voucher de desconto, no pagamento à vista. */
  fidelidade?: EscolhaDaFidelidade | null,
): Promise<ResultadoDaVendaDeProduto> {
  try {
    const ctx = await getTenantContext()
    // A pergunta (sem quem vendeu) não grava: solta a chave, e a resposta vende.
    return await umaVez(ctx.tenantId!, 'venderProduto', chaveDoEnvio(envio),
      () => venderProdutoUmaVez(clienteId, produtos, branchId, quantidade, pagamento, desconto, equipe, fidelidade),
      { gravou: r => !!r.vendaId })
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

type ResultadoDaVendaDeProduto = { error?: string; vendaId?: string; confirmarSemVendedor?: string }

async function venderProdutoUmaVez(
  clienteId: string, produtos: string | ItemDaVenda[], branchId: string,
  quantidade: unknown, pagamento: unknown, desconto: unknown, equipe: QuemVendeuDaTela | null | undefined,
  fidelidade?: EscolhaDaFidelidade | null,
): Promise<ResultadoDaVendaDeProduto> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    if (typeof clienteId !== 'string' || !UUID.test(clienteId)) {
      return { error: 'Escolha a cliente: a venda de produto é para uma cliente cadastrada (o cadastro rápido serve).' }
    }
    if (typeof branchId !== 'string' || !UUID.test(branchId)) return { error: 'Dados inválidos.' }
    // O mesmo produto em duas linhas vira uma, somada.
    const pedidos = typeof produtos === 'string' ? [{ produtoId: produtos, quantidade: Number(quantidade) }] : produtos
    if (!Array.isArray(pedidos) || !pedidos.length) return { error: 'Escolha ao menos um produto.' }
    // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
    // feito." — acima de 100 de cada, de 100 unidades e de 20 produtos a tela
    // avisa; só o impossível recusa (lib/vendas/quantidades.ts).
    const itens = new Map<string, number>()
    for (const p of pedidos) {
      const qtd = Number(p?.quantidade)
      if (typeof p?.produtoId !== 'string' || !UUID.test(p.produtoId)) return { error: 'Dados inválidos.' }
      const recusaDaLinha = recusaDaQuantidadeDoProduto(qtd)
      if (recusaDaLinha) return { error: recusaDaLinha }
      itens.set(p.produtoId, (itens.get(p.produtoId) ?? 0) + qtd)
    }
    const recusaDosItens = recusaDosItensDaVenda([...itens.values()])
    if (recusaDosItens) return { error: recusaDosItens }
    const lido = EntradaDoPagamento.safeParse(pagamento)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Pagamento inválido.' }
    // Até quantas vezes a clínica parcela no crédito (D-15): o servidor recusa acima.
    // D1 da 18ª: cada forma paga agora (o à vista dividido confere todas).
    const recusaDasVezes = await recusaDasVezesDoPagamento(ctx.tenantId!, lido.data)
    if (recusaDasVezes) return { error: recusaDasVezes }
    const d = EntradaDoDesconto.safeParse(desconto)
    if (!d.success) return { error: 'Desconto inválido.' }

    const admin = createAdminClient()
    // Os produtos em lotes de 100 ids: a lista vai na URL do `.in()`, e sem o
    // teto de 20 ela pode passar do limite da URL (convencoes.md).
    const ids = [...itens.keys()]
    const lotes = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100))
    const [unidade, cliente, ...lidosPorLote] = await Promise.all([
      ler(admin.from('branches').select('id, is_active').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id, is_active').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a cliente'),
      ...lotes.map(lote => ler(admin.from('products').select('id, name, sale_price, uso, is_active')
        .in('id', lote).eq('tenant_id', ctx.tenantId!), 'buscar os produtos')),
    ])
    const lidos = lidosPorLote.flatMap(l => l ?? [])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    // D4 da 30ª (UN-14): a unidade desativada não vende.
    const naDesativada = recusaDaVendaNaUnidade(unidade)
    if (naDesativada) return { error: naDesativada }
    if (!cliente) return { error: 'Cliente não encontrada.' }
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA }
    const porId = new Map((lidos ?? []).map(p => [p.id as string, p]))
    let tabelaCentavos = 0
    for (const [id, qtd] of itens) {
      const produto = porId.get(id)
      if (!produto) return { error: 'Produto não encontrado.' }
      if (produto.is_active === false) return { error: `${produto.name as string} está desativado.` }
      if ((produto.uso !== 'REVENDA' && produto.uso !== 'AMBOS') || produto.sale_price == null) {
        return { error: `${produto.name as string} não é de Venda direta: marque o uso e o preço de venda no cadastro.` }
      }
      tabelaCentavos += Math.round(Number(produto.sale_price) * 100) * qtd
    }

    const tabela = tabelaCentavos / 100
    const recusa = recusaDoDesconto(tabela, d.data)
    if (recusa) return { error: recusa }
    const reais = descontoEmReais(tabela, d.data)
    const vendido = Math.round((tabela - reais) * 100) / 100
    // FD2a: os pontos e o voucher (à vista), conferidos aqui e de novo no banco.
    const fid = await fidelidadeDaVenda({ tenantId: ctx.tenantId!, clienteId, vendido, escolha: fidelidade, aVista: lido.data.forma === 'AVISTA', admin })
    if ('error' in fid) return { error: fid.error }
    // D1 da 18ª: dividida, a primeira forma leva de volta o que a fidelidade desconta.
    const pagamentoDaVenda = comFidelidadeNaPrimeira(lido.data, fid.dados)
    const recusaDaEntrada = recusaDaEntradaDoPagamento(pagamentoDaVenda, vendido)
    // C38: o crediário até o limite da rede.
    const recusaDasParcelas = await recusaDasParcelasDaRede(ctx.tenantId!, lido.data)
    if (recusaDasParcelas) return { error: recusaDasParcelas }
    if (recusaDaEntrada) return { error: recusaDaEntrada }
    const rotulo = [...itens].map(([id, qtd]) => `${qtd}× ${porId.get(id)!.name as string}`).join(' + ')
    // Quem vendeu (com-06): leva a comissão da venda; vazio, só com a confirmação.
    const vendeu = await quemVendeu(ctx.tenantId!, ctx.internalUserId ?? null, equipe, branchId)
    if ('error' in vendeu) return { error: vendeu.error }
    if ('pergunta' in vendeu) return { confirmarSemVendedor: vendeu.pergunta }

    const lancamentos = comMotivoDoDesconto(lancamentosDoPagamento(vendido, pagamentoDaVenda, rotulo), motivoDoDesconto(d.data, reais))
    // Sem o teto da quantidade, o valor pode passar do que o registro guarda: recusa em português.
    const recusaDoValor = recusaDoValorDaVenda(tabela, lancamentos.map(l => l.amount))
    if (recusaDoValor) return { error: recusaDoValor }
    const args = {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_vendedor: vendeu.vendedor,
      p_itens: [...itens].map(([id, qtd]) => ({ product_id: id, quantity: qtd })),
      p_desconto: reais,
      p_lancamentos: lancamentos,
    }
    const { data, error } = fid.dados
      ? await admin.rpc('venda_com_fidelidade', { p_tenant: ctx.tenantId!, p_tipo: 'PRODUTO', p_args: args, p_fidelidade: fid.dados })
      : await admin.rpc('produto_vender_itens', args)
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
