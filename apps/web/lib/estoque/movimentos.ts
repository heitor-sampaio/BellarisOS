import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'

/**
 * ENTRADA e AJUSTE de estoque — os núcleos que a tela de estoque (actions/
 * stock.ts) e o Copilot dividem (2026-10-08). Não conferem o MÓDULO (quem
 * chama confere); conferem a rede do produto e da unidade, e a unidade ao
 * alcance de quem tem unidade fixa.
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * O produto e as unidades vieram do formulário: são desta rede?
 *
 * Sem isto, quem é da rede (`ctx.branchId` nulo — a trava de "fora da sua
 * filial" não vale para ele) gravava no produto ou na unidade de OUTRA rede.
 */
export async function produtoEUnidadesDaRede(
  admin: Admin, tenantId: string, productId: string, branchIds: string[],
): Promise<boolean> {
  const [produto, unidades] = await Promise.all([
    ler(admin.from('products').select('id').eq('id', productId).eq('tenant_id', tenantId).maybeSingle(),
      'conferir o produto'),
    ler(admin.from('branches').select('id').in('id', branchIds).eq('tenant_id', tenantId),
      'conferir as unidades'),
  ])
  return !!produto && (unidades ?? []).length === new Set(branchIds).size
}

/** As unidades por embalagem do produto (para o rendimento); null quando não usa. */
export async function getUpp(admin: Admin, productId: string): Promise<number | null> {
  const data = await ler(admin
    .from('products')
    .select('units_per_package, consumption_unit')
    .eq('id', productId)
    .maybeSingle(), 'carregar os produtos')
  if (!data?.units_per_package || !data?.consumption_unit) return null
  return Number(data.units_per_package)
}

export interface EntradaDeEstoque {
  productId: string
  branchId: string
  quantidade: number
  custoUnitario?: number | null
  observacao?: string | null
  lote?: string | null
  validade?: string | null
}

export async function entradaDeEstoqueCore(admin: Admin, ctx: TenantContext, e: EntradaDeEstoque): Promise<{ ok: true; saldo: number } | { error: string }> {
  if (ctx.branchId !== null && e.branchId !== ctx.branchId) return { error: 'Operação não permitida fora da sua filial.' }
  if (!(e.quantidade > 0)) return { error: 'Quantidade deve ser maior que zero.' }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, e.productId, [e.branchId]))) {
    return { error: 'Produto ou filial não encontrado.' }
  }

  // `maybeSingle`: unidade sem linha de saldo é saldo 0 (a primeira entrada).
  // Falha de leitura é outra coisa — não pode virar 0 e gravar um saldo falso.
  const [bps, upp] = await Promise.all([
    ler(admin.from('branch_product_stock').select('current_stock, min_stock, current_rendimento')
      .eq('product_id', e.productId).eq('branch_id', e.branchId).maybeSingle(), 'buscar o saldo do produto'),
    getUpp(admin, e.productId),
  ])

  const currentStock      = Number(bps?.current_stock ?? 0)
  const balanceAfter      = currentStock + e.quantidade
  const currentRendimento = bps?.current_rendimento != null ? Number(bps.current_rendimento) : (upp ? currentStock * upp : null)
  const newRendimento     = upp && currentRendimento != null ? currentRendimento + e.quantidade * upp : null

  await gravar(admin.from('stock_movements').insert({
    branch_id:     e.branchId,
    product_id:    e.productId,
    type:          'PURCHASE',
    quantity:      e.quantidade,
    balance_after: balanceAfter,
    unit_cost:     e.custoUnitario ?? null,
    notes:         e.observacao ?? null,
    created_by:    ctx.internalUserId,
  }), 'registrar a entrada de estoque')

  await gravar(admin.from('branch_product_stock').upsert({
    product_id:         e.productId,
    branch_id:          e.branchId,
    current_stock:      balanceAfter,
    current_rendimento: newRendimento,
    min_stock:          Number(bps?.min_stock ?? 0),
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'product_id,branch_id' }), 'atualizar o saldo da unidade')

  if (e.lote) {
    await gravar(admin.from('product_batches').insert({
      product_id:   e.productId,
      branch_id:    e.branchId,
      batch_number: e.lote,
      expires_at:   e.validade ?? null,
      quantity:     e.quantidade,
    }), 'registrar o lote do produto')
  }

  // O custo do produto passa a ser o desta compra (preço da última entrada).
  if (e.custoUnitario && e.custoUnitario > 0) {
    await gravar(admin.from('products')
      .update({ cost_price: e.custoUnitario, updated_at: new Date().toISOString() })
      .eq('id', e.productId), 'atualizar o custo do produto')
  }
  return { ok: true, saldo: balanceAfter }
}

export async function ajusteDeEstoqueCore(admin: Admin, ctx: TenantContext, a: {
  productId: string; branchId: string; novoSaldo: number; motivo: string
}): Promise<{ ok: true; de: number } | { error: string }> {
  if (ctx.branchId !== null && a.branchId !== ctx.branchId) return { error: 'Operação não permitida fora da sua filial.' }
  if (!a.motivo.trim()) return { error: 'Motivo do ajuste é obrigatório.' }
  if (Number.isNaN(a.novoSaldo) || a.novoSaldo < 0) return { error: 'Novo estoque não pode ser negativo.' }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, a.productId, [a.branchId]))) {
    return { error: 'Produto ou filial não encontrado.' }
  }

  // Sem linha de saldo = saldo 0; falha de leitura não pode virar 0 (o ajuste
  // gravaria um delta sobre um número inventado).
  const [bps, upp] = await Promise.all([
    ler(admin.from('branch_product_stock').select('current_stock, min_stock, current_rendimento')
      .eq('product_id', a.productId).eq('branch_id', a.branchId).maybeSingle(), 'buscar o saldo do produto'),
    getUpp(admin, a.productId),
  ])

  const currentStock = Number(bps?.current_stock ?? 0)
  const delta        = a.novoSaldo - currentStock

  // Preserva o consumo acumulado ao ajustar a quantidade de embalagens.
  // Ex.: 100 frascos × 100ml/frasco = 10.000ml totais; disponível = 9.999ml → consumido = 1ml.
  // Ajuste para 20 frascos → 2.000ml totais − 1ml consumido = 1.999ml disponíveis.
  let newRendimento: number | null = null
  if (upp !== null && upp > 0) {
    const currentTotal = currentStock * upp
    const currentAvail = bps?.current_rendimento != null ? Number(bps.current_rendimento) : currentTotal
    const consumed     = Math.max(0, currentTotal - currentAvail)
    newRendimento      = Math.max(0, a.novoSaldo * upp - consumed)
  }

  await gravar(admin.from('stock_movements').insert({
    branch_id:     a.branchId,
    product_id:    a.productId,
    type:          'MANUAL_ADJUSTMENT',
    quantity:      delta,
    balance_after: a.novoSaldo,
    notes:         a.motivo.trim(),
    created_by:    ctx.internalUserId,
  }), 'registrar o ajuste de estoque')

  await gravar(admin.from('branch_product_stock').upsert({
    product_id:         a.productId,
    branch_id:          a.branchId,
    current_stock:      a.novoSaldo,
    current_rendimento: newRendimento,
    min_stock:          Number(bps?.min_stock ?? 0),
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'product_id,branch_id' }), 'atualizar o saldo da unidade')
  return { ok: true, de: currentStock }
}
