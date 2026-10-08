'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { ajusteDeEstoqueCore, entradaDeEstoqueCore, produtoEUnidadesDaRede } from '@/lib/estoque/movimentos'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
}

function skuPrefix(category: string | null): string {
  return (category ?? 'OUT')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^A-Za-z0-9]/g, '')      // só alfanumérico
    .toUpperCase()
    .slice(0, 3) || 'OUT'
}

async function nextSku(tenantId: string, category: string | null): Promise<string> {
  const admin  = createAdminClient()
  const prefix = skuPrefix(category)

  const data = await ler(admin
    .from('products')
    .select('sku')
    .eq('tenant_id', tenantId)
    .like('sku', `${prefix}-%`), 'carregar os produtos')

  const maxNum = (data ?? []).reduce((max, p) => {
    const seq = parseInt((p.sku ?? '').split('-').pop() ?? '0', 10)
    return isNaN(seq) ? max : Math.max(max, seq)
  }, 0)

  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

// --- Catálogo de produtos ------------------------------------------

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function createProduct(
  ...args: Parameters<typeof createProductInterno>
): ReturnType<typeof createProductInterno> {
  try {
    return await createProductInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function createProductInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const name = str(formData, 'name')
    if (!name) return { error: 'Nome é obrigatório.' }
    const unit = str(formData, 'unit')
    if (!unit) return { error: 'Unidade é obrigatória.' }

    const categoryId = str(formData, 'category_id')
    const admin = createAdminClient()

    // Resolve o nome da categoria para geração do SKU e campo denormalizado
    let categoryName: string | null = null
    if (categoryId) {
      const cat = await ler(admin.from('product_categories').select('name').eq('id', categoryId).single(), 'buscar a categoria')
      categoryName = cat?.name ?? null
    }

    // A unidade do estoque inicial vem do formulário: da rede e ao alcance de
    // quem cria (§11). Até 2026-09-28 ia direto para o saldo, o movimento e a
    // DESPESA — inclusive numa unidade de outra clínica. Conferida antes de o
    // produto nascer, para a recusa não deixar um produto sem estoque para trás.
    const filialPedida = str(formData, '_branchId')
    if (filialPedida) {
      const daRede = await ler(admin.from('branches').select('id')
        .eq('id', filialPedida).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
      if (!daRede || !alcancaUnidade(ctx, filialPedida)) return { error: 'Unidade não encontrada.' }
    }

    const sku = await nextSku(ctx.tenantId!, categoryName)

    const minStock = num(formData, 'min_stock') ?? 0

    const { data: newProduct, error } = await admin.from('products').insert({
      tenant_id:   ctx.tenantId!,
      name,
      sku,
      category:    categoryName,
      category_id: categoryId,
      unit,
      supplier:    str(formData, 'supplier'),
      barcode:           str(formData, 'barcode'),
      cost_price:        num(formData, 'cost_price'),
      sale_price:        num(formData, 'sale_price'),
      min_stock:         minStock,
      consumption_unit:  str(formData, 'consumption_unit'),
      units_per_package: num(formData, 'units_per_package'),
    }).select('id').single()

    if (error) return { error: error.message }

    // Estoque inicial.
    //
    // A unidade vem do formulário, não do contexto: quem é da REDE não tem
    // `ctx.branchId`, e a condição antiga (`&& ctx.branchId`) descartava tudo em
    // silêncio — o produto nascia sem movimento, sem saldo na filial, sem lote e
    // sem a despesa, com a tela dizendo que deu certo. O modal pede a unidade
    // quando quem cria é da rede; na unidade ela já vem do contexto.
    const initialQty    = num(formData, 'initial_qty')
    const initialCost   = num(formData, 'initial_cost')
    const filialEstoque = str(formData, '_branchId') || ctx.branchId

    if (initialQty && initialQty > 0 && newProduct && !filialEstoque) {
      return { error: 'Escolha a unidade que vai receber o estoque inicial.' }
    }

    if (initialQty && initialQty > 0 && filialEstoque && newProduct) {
      await gravar(admin.from('stock_movements').insert({
        branch_id:     filialEstoque,
        product_id:    newProduct.id,
        type:          'PURCHASE',
        quantity:      initialQty,
        balance_after: initialQty,
        notes:         str(formData, 'initial_notes') ?? 'Estoque inicial',
        created_by:    ctx.internalUserId,
      }), 'registrar a movimentação de estoque')

      await gravar(admin.from('branch_product_stock').upsert({
        product_id:    newProduct.id,
        branch_id:     filialEstoque,
        current_stock: initialQty,
        min_stock:     minStock,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'product_id,branch_id' }), 'atualizar o saldo da unidade')

      const initialBatch   = str(formData, 'initial_batch')
      const initialExpires = str(formData, 'initial_expires_at')
      if (initialBatch) {
        await gravar(admin.from('product_batches').insert({
          product_id:   newProduct.id,
          // O lote é da unidade que recebeu (o saldo também é).
          branch_id:    filialEstoque,
          batch_number: initialBatch,
          expires_at:   initialExpires ?? null,
          quantity:     initialQty,
        }), 'registrar o lote do produto')
      }

      // Atualiza custo do produto e registra despesa financeira
      if (initialCost && initialCost > 0) {
        await gravar(admin.from('products').update({ cost_price: initialCost }).eq('id', newProduct.id), 'atualizar o custo do produto')

        await gravar(admin.from('financial_transactions').insert({
          branch_id:   filialEstoque,
          type:        'EXPENSE',
          category:    'Estoque',
          description: `Compra: ${name}`,
          amount:      initialCost * initialQty,
          is_paid:     true,
          paid_at:     new Date().toISOString(),
          notes:       str(formData, 'initial_notes') ?? 'Estoque inicial',
          created_by:  ctx.internalUserId,
        }), 'lançar a despesa da compra')
      }
    }

    revalidatePath('/admin/produtos')
    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    revalidateTag(`products:${ctx.tenantId!}`, 'max')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function updateProduct(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId = str(formData, '_productId')
    if (!productId) return { error: 'Produto não identificado.' }

    const name = str(formData, 'name')
    if (!name) return { error: 'Nome é obrigatório.' }
    const unit = str(formData, 'unit')
    if (!unit) return { error: 'Unidade é obrigatória.' }

    const categoryId = str(formData, 'category_id')
    const admin = createAdminClient()

    let categoryName: string | null = null
    if (categoryId) {
      const cat = await ler(admin.from('product_categories').select('name').eq('id', categoryId).single(), 'buscar a categoria')
      categoryName = cat?.name ?? null
    }

    // Preserva SKU existente; gera novo somente se ainda não tem e uma categoria foi definida
    const current = await ler(admin.from('products').select('sku').eq('id', productId).single(), 'buscar o produto')
    let sku = current?.sku ?? null
    if (!sku && categoryName) {
      sku = await nextSku(ctx.tenantId!, categoryName)
    }

    const { error } = await admin.from('products')
      .update({
        name,
        sku,
        category:    categoryName,
        category_id: categoryId,
        unit,
        supplier:    str(formData, 'supplier'),
        barcode:           str(formData, 'barcode'),
        cost_price:        num(formData, 'cost_price'),
        sale_price:        num(formData, 'sale_price'),
        min_stock:         num(formData, 'min_stock') ?? 0,
        consumption_unit:  str(formData, 'consumption_unit'),
        units_per_package: num(formData, 'units_per_package'),
        updated_at:        new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) return { error: error.message }

    revalidatePath('/admin/produtos')
    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    revalidateTag(`products:${ctx.tenantId!}`, 'max')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function findProductByBarcode(barcode: string) {
  try {
    const ctx = await getTenantContext()
    const admin = createAdminClient()

    const data = await ler(admin
      .from('products')
      .select('id, name, unit, cost_price, consumption_unit, units_per_package, sku, category, barcode')
      .eq('tenant_id', ctx.tenantId!)
      .eq('barcode', barcode.trim())
      .eq('is_active', true)
      .maybeSingle(), 'buscar o produto')

    if (!data) return { error: 'Nenhum produto encontrado com este código.' }
    return { product: data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function toggleProductActive(
  ...args: Parameters<typeof toggleProductActiveInterno>
): ReturnType<typeof toggleProductActiveInterno> {
  try {
    return await toggleProductActiveInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function toggleProductActiveInterno(productId: string, isActive: boolean) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const admin = createAdminClient()
    await gravar(admin.from('products')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('tenant_id', ctx.tenantId!), 'mudar a situação do produto')

    revalidatePath('/admin/produtos')
    revalidateTag(`products:${ctx.tenantId!}`, 'max')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Categorias de produto ---------------------------------------

export async function createCategory(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const name = (formData.get('name') as string | null)?.trim()
    if (!name) return { error: 'Nome é obrigatório.' }

    const admin = createAdminClient()
    const { error } = await admin.from('product_categories').insert({
      tenant_id: ctx.tenantId!,
      name,
    })

    if (error) {
      if (error.code === '23505') return { error: 'Já existe uma categoria com esse nome.' }
      return { error: error.message }
    }

    revalidatePath('/admin/estoque')
    revalidatePath('/*/stock')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function deleteCategory(categoryId: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const admin = createAdminClient()
    const { error } = await admin.from('product_categories')
      .delete()
      .eq('id', categoryId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) return { error: error.message }

    revalidatePath('/admin/estoque')
    revalidatePath('/*/stock')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Estoque por filial -------------------------------------------

// `createStockMovement` e `updateBranchMinStock` foram removidas: as operações
// de estoque passaram todas pelo modal de gerenciar (adminAddStock,
// adminTransferStock, adminAdjustStock, adminUpdateMinStock), que os dois
// portais usam. Ficaram sem chamador quando a filial adotou esse modal, e
// todo export de um arquivo `use server` é um endpoint público.

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminUpdateMinStock(
  ...args: Parameters<typeof adminUpdateMinStockInterno>
): ReturnType<typeof adminUpdateMinStockInterno> {
  try {
    return await adminUpdateMinStockInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminUpdateMinStockInterno(productId: string, branchId: string, minStock: number) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')
    if (ctx.branchId !== null && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua filial.' }

    const admin = createAdminClient()
    if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, productId, [branchId])))
      return { error: 'Produto ou filial não encontrado.' }
    await gravar(admin.from('branch_product_stock').upsert({
      product_id: productId,
      branch_id:  branchId,
      min_stock:  minStock,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id,branch_id' }), 'salvar o estoque mínimo')

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Gestão de estoque (NETWORK_ADMIN) ---------------------------

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminAddStock(
  ...args: Parameters<typeof adminAddStockInterno>
): ReturnType<typeof adminAddStockInterno> {
  try {
    return await adminAddStockInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminAddStockInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId = str(formData, 'productId')
    const branchId  = str(formData, 'branchId')
    if (!productId) return { error: 'Produto não identificado.' }
    if (!branchId)  return { error: 'Selecione uma filial.' }
    if (ctx.branchId !== null && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua filial.' }

    const qtyRaw = str(formData, 'quantity')
    if (!qtyRaw) return { error: 'Quantidade é obrigatória.' }
    const qty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return { error: 'Quantidade deve ser maior que zero.' }

    // O núcleo (lib/estoque/movimentos.ts) é o mesmo do Copilot.
    const r = await entradaDeEstoqueCore(createAdminClient(), ctx, {
      productId, branchId, quantidade: qty,
      custoUnitario: num(formData, 'unit_cost'),
      observacao:    str(formData, 'notes'),
      lote:          str(formData, 'batch_number'),
      validade:      str(formData, 'expires_at'),
    })
    if ('error' in r) return { error: r.error }

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminTransferStock(
  ...args: Parameters<typeof adminTransferStockInterno>
): ReturnType<typeof adminTransferStockInterno> {
  try {
    return await adminTransferStockInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminTransferStockInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId    = str(formData, 'productId')
    const fromBranchId = str(formData, 'fromBranchId')
    const toBranchId   = str(formData, 'toBranchId')
    if (!productId)    return { error: 'Produto não identificado.' }
    if (!fromBranchId) return { error: 'Selecione a filial de origem.' }
    if (!toBranchId)   return { error: 'Selecione a filial de destino.' }
    if (fromBranchId === toBranchId) return { error: 'Origem e destino devem ser filiais diferentes.' }

    const qtyRaw = str(formData, 'quantity')
    if (!qtyRaw) return { error: 'Quantidade é obrigatória.' }
    const qty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return { error: 'Quantidade deve ser maior que zero.' }

    const notes = str(formData, 'notes')
    if (ctx.branchId !== null && fromBranchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua filial.' }
    const admin = createAdminClient()
    if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, productId, [fromBranchId, toBranchId])))
      return { error: 'Produto ou filial não encontrado.' }

    // As duas pernas, os dois saldos e o rendimento numa transação, com as
    // linhas travadas (estoque_transferir, 2026-10-08). Era ler os dois saldos
    // aqui e gravar os valores absolutos: duas transferências ao mesmo tempo
    // (ou uma transferência e uma conclusão) perdiam uma. O "estoque
    // insuficiente" também é conferido lá dentro, com a linha travada.
    const { error } = await admin.rpc('estoque_transferir', {
      p_produto: productId, p_origem: fromBranchId, p_destino: toBranchId,
      p_quantidade: qty, p_observacao: notes ?? null, p_autor: ctx.internalUserId,
    })
    if (error) {
      if (error.code === 'P0001') return { error: error.message }
      throw new Error(`Não consegui transferir: ${error.message}`)
    }

    revalidatePath('/admin/estoque')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminAdjustStock(
  ...args: Parameters<typeof adminAdjustStockInterno>
): ReturnType<typeof adminAdjustStockInterno> {
  try {
    return await adminAdjustStockInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminAdjustStockInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId = str(formData, 'productId')
    const branchId  = str(formData, 'branchId')
    if (!productId) return { error: 'Produto não identificado.' }
    if (!branchId)  return { error: 'Selecione uma filial.' }
    if (ctx.branchId !== null && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua filial.' }

    const reason = str(formData, 'reason')
    if (!reason) return { error: 'Motivo do ajuste é obrigatório.' }

    const qtyRaw = (formData.get('new_quantity') as string | null)?.trim()
    if (!qtyRaw) return { error: 'Novo estoque é obrigatório.' }
    const newQty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(newQty) || newQty < 0) return { error: 'Novo estoque não pode ser negativo.' }

    // O núcleo (lib/estoque/movimentos.ts) é o mesmo do Copilot.
    const r = await ajusteDeEstoqueCore(createAdminClient(), ctx, { productId, branchId, novoSaldo: newQty, motivo: reason })
    if ('error' in r) return { error: r.error }

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export interface MovimentoDeEstoque {
  id:           string
  type:         string
  quantity:     number
  balanceAfter: number
  notes:        string | null
  createdAt:    string
  branchName:   string
}

/**
 * Histórico de movimentações de um produto.
 *
 * `branchId` vazio = todas as unidades, que é o que o portal da rede pede: de
 * onde saiu e para onde entrou, numa lista só. Não havia caminho nenhum para
 * isto na interface — dava para movimentar sem nunca ver o que já tinha sido
 * movimentado.
 */
export async function getProductMovements(
  productId: string,
  branchId: string,
): Promise<MovimentoDeEstoque[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'stock', 'VIEW')

  const admin = createAdminClient()
  let query = admin
    .from('stock_movements')
    .select('id, type, quantity, balance_after, notes, created_at, branches!inner(name, tenant_id)')
    .eq('product_id', productId)
    .eq('branches.tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })
    .limit(80)

  // Quem tem unidade fixa só vê a dela — qualquer que seja o pedido; a rede vê
  // todas. Antes o `branchId` do chamador vencia o do contexto.
  const recorte = ctx.branchId ?? branchId
  if (recorte) query = query.eq('branch_id', recorte)

  const { data, error } = await query
  // Histórico vazio é um fato; histórico que falhou é outra coisa.
  if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`)

  type Row = {
    id: string; type: string; quantity: number; balance_after: number
    notes: string | null; created_at: string; branches: { name: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map(m => ({
    id:           m.id,
    type:         m.type,
    quantity:     Number(m.quantity),
    balanceAfter: Number(m.balance_after),
    notes:        m.notes,
    createdAt:    m.created_at,
    branchName:   m.branches?.name ?? '—',
  }))
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function saveBarcodeToProduct(
  ...args: Parameters<typeof saveBarcodeToProductInterno>
): ReturnType<typeof saveBarcodeToProductInterno> {
  try {
    return await saveBarcodeToProductInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function saveBarcodeToProductInterno(productId: string, barcode: string) {
  try {
    const ctx   = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')
    const admin = createAdminClient()

    const prod = await ler(admin
      .from('products')
      .select('tenant_id')
      .eq('id', productId)
      .maybeSingle(), 'buscar o produto')
    if (!prod || prod.tenant_id !== ctx.tenantId)
      return { error: 'Produto não encontrado.' }

    const code = barcode.trim()
    const conflict = await ler(admin
      .from('products')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .eq('barcode', code)
      .neq('id', productId)
      .maybeSingle(), 'conferir o código de barras')
    if (conflict)
      return { error: `Código já vinculado ao produto "${conflict.name}".` }

    await gravar(admin
      .from('products')
      .update({ barcode: code, updated_at: new Date().toISOString() })
      .eq('id', productId), 'salvar o código de barras')

    revalidatePath('/admin/estoque')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function searchProducts(query: string) {
  try {
    const ctx   = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')
    const admin = createAdminClient()

    const data = await ler(admin
      .from('products')
      .select('id, name, sku, unit, barcode')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .ilike('name', `%${query.trim()}%`)
      .order('name')
      .limit(20), 'buscar o produto')

    return { products: (data ?? []) as { id: string; name: string; sku: string | null; unit: string; barcode: string | null }[] }
  } catch {
    return { products: [] as { id: string; name: string; sku: string | null; unit: string; barcode: string | null }[] }
  }
}
