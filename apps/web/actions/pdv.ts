'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, podeReceber, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/db'
import { lancamentoAoAlcance, marcarPagoCore, FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'

/**
 * A cliente da "Nova venda" do PDV (PDV2, a revisão do Heitor de 2026-11-13):
 * a busca pelo nome ou telefone, de quem recebe. A cliente é da rede (H5): a
 * busca é na rede inteira, e a venda é na unidade do PDV.
 */
export async function buscarClientesParaVender(termo: string): Promise<{
  clientes: { id: string; name: string; phone: string }[]
}> {
  const ctx = await getTenantContext()
  if (!podeReceber(ctx)) return { clientes: [] }
  const busca = typeof termo === 'string' ? termo.trim() : ''
  if (busca.length < 2) return { clientes: [] }
  const { data, error } = await createAdminClient().rpc('buscar_clientes', {
    p_tenant: ctx.tenantId!, p_termo: busca, p_limite: 10,
  })
  if (error) return { clientes: [] }
  return {
    clientes: ((data ?? []) as { id: string; name: string; phone: string | null }[])
      .map(c => ({ id: c.id, name: c.name, phone: c.phone ?? '' })),
  }
}

/**
 * Recebe no PDV a parcela do crediário (ou o a receber) que a cliente veio
 * pagar (CX1, o plano de adaptação — o Heitor, 13/11: "abrir a cliente no PDV
 * mostra as parcelas em aberto dela, e recebe-se ali"). A forma é pedida
 * SEMPRE (PDV8), e é de quem paga agora: Pix, Dinheiro, Débito ou Crédito —
 * o crediário não paga uma parcela do crediário.
 *
 * É a MESMA baixa do Financeiro (`marcarPagoCore`): confere a rede e a unidade
 * ao alcance do lançamento pelo id, e grava num UPDATE só, com a guarda do
 * já pago. Quem recebe: `podeReceber` (o Caixa ou o Financeiro em Gerenciar).
 */
export async function receberParcelaNoPdv(
  transactionId: string, slug: string,
  pagamento: { forma: string; bandeira?: string | null; vezes?: number | null; maquininha?: string | null },
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) return { error: 'Sem permissão para receber.' }
    const forma = typeof pagamento?.forma === 'string' ? pagamento.forma : ''
    if (!forma) return { error: 'Escolha a forma de pagamento.' }
    if (!(FORMAS_DE_PAGAMENTO as readonly string[]).includes(forma)) return { error: 'Forma de pagamento inválida para receber a parcela.' }
    const { bandeira = null, vezes = null, maquininha = null } = pagamento
    if (bandeira != null && typeof bandeira !== 'string') return { error: 'Bandeira inválida.' }
    if (vezes != null && typeof vezes !== 'number') return { error: 'Vezes inválidas.' }
    if (maquininha != null && (typeof maquininha !== 'string' || !/^[0-9a-f-]{36}$/i.test(maquininha))) return { error: 'Maquininha inválida.' }
    if (typeof transactionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(transactionId)) return { error: 'Lançamento não encontrado.' }

    const admin = createAdminClient()
    // A rede e a unidade ao alcance (§11): a recepção da A não recebe na B.
    const tx = await lancamentoAoAlcance(admin, ctx, transactionId)
    if (!tx || tx.type !== 'INCOME') return { error: 'Lançamento não encontrado.' }
    const r = await marcarPagoCore(admin, ctx, transactionId, forma, bandeira, vezes, maquininha)
    if ('error' in r) return { error: r.error }

    if (typeof slug === 'string' && slug) {
      revalidatePath(`/${slug}/pdv`)
      revalidatePath(`/${slug}/financeiro`)
    }
    revalidatePath('/admin/pdv')
    revalidatePath('/admin/financeiro')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A comanda da rede, com a unidade dela ao alcance de quem pede (§11). Nula quando não é. */
async function comandaAoAlcance(
  admin: ReturnType<typeof createAdminClient>, ctx: Awaited<ReturnType<typeof getTenantContext>>, comandaId: string,
): Promise<{ id: string; branch_id: string } | null> {
  const { data, error } = await admin.from('comandas').select('id, branch_id')
    .eq('id', comandaId).eq('tenant_id', ctx.tenantId!).maybeSingle()
  if (error) throw new Error(`Não consegui buscar a comanda: ${error.message}`)
  if (!data || !alcancaUnidade(ctx, data.branch_id as string)) return null
  return { id: data.id as string, branch_id: data.branch_id as string }
}

function revalidarOPdv(slug: string) {
  if (typeof slug === 'string' && slug) revalidatePath(`/${slug}/pdv`)
  revalidatePath('/admin/pdv')
}

/**
 * Acrescenta um produto de Venda direta na comanda do atendimento (PDV, fase
 * 5b — o desenho aprovado: "na saída ela levou um sérum, que se acrescenta na
 * mesma comanda"). Nada sai do estoque agora: o produto é vendido quando a
 * comanda é paga, junto do atendimento e com a mesma forma
 * (`confirmar_pagamento_do_atendimento`). O banco confere a comanda (do
 * atendimento, aberta, não paga), o produto (de Venda direta, ativo) e o
 * estoque da unidade da comanda. Quem acrescenta: quem pode receber.
 */
export async function acrescentarProdutoNaComanda(
  comandaId: string, produtoId: string, quantidade: number, slug: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) return { error: 'Sem permissão para receber.' }
    if (typeof comandaId !== 'string' || !ID.test(comandaId)) return { error: 'Comanda não encontrada.' }
    if (typeof produtoId !== 'string' || !ID.test(produtoId)) return { error: 'Escolha o produto.' }
    const qtd = Number(quantidade)
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100) return { error: 'Quantidade inválida (de 1 a 100).' }

    const admin = createAdminClient()
    const comanda = await comandaAoAlcance(admin, ctx, comandaId)
    if (!comanda) return { error: 'Comanda não encontrada.' }
    const { error } = await admin.rpc('comanda_acrescentar_item', {
      p_tenant: ctx.tenantId!, p_comanda: comanda.id, p_produto: produtoId, p_quantidade: qtd, p_ator: ctx.internalUserId ?? null,
    })
    if (error) {
      if (error.code === 'P0001' || error.code === 'P0002') return { error: error.message }
      throw new Error(`Não consegui acrescentar o produto: ${error.message}`)
    }
    revalidarOPdv(slug)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/** Tira da comanda o produto acrescentado, antes de receber (o vendido volta pelo estorno da venda). */
export async function tirarProdutoDaComanda(itemId: string, slug: string): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) return { error: 'Sem permissão para receber.' }
    if (typeof itemId !== 'string' || !ID.test(itemId)) return { error: 'Item não encontrado.' }
    const admin = createAdminClient()
    const { data: item, error: e1 } = await admin.from('comanda_itens').select('id, comanda_id')
      .eq('id', itemId).eq('tenant_id', ctx.tenantId!).maybeSingle()
    if (e1) throw new Error(`Não consegui buscar o item: ${e1.message}`)
    if (!item || !await comandaAoAlcance(admin, ctx, item.comanda_id as string)) return { error: 'Item não encontrado.' }
    const { error } = await admin.rpc('comanda_tirar_item', { p_tenant: ctx.tenantId!, p_item: itemId })
    if (error) {
      if (error.code === 'P0001' || error.code === 'P0002') return { error: error.message }
      throw new Error(`Não consegui tirar o produto: ${error.message}`)
    }
    revalidarOPdv(slug)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}
