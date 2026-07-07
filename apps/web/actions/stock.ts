'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const { data } = await admin
    .from('products')
    .select('sku')
    .eq('tenant_id', tenantId)
    .like('sku', `${prefix}-%`)

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

// Busca units_per_package do produto para cálculo de rendimento
async function getUpp(admin: ReturnType<typeof createAdminClient>, productId: string): Promise<number | null> {
  const { data } = await admin
    .from('products')
    .select('units_per_package, consumption_unit')
    .eq('id', productId)
    .maybeSingle()
  if (!data?.units_per_package || !data?.consumption_unit) return null
  return Number(data.units_per_package)
}

// --- Catálogo de produtos ------------------------------------------

export async function createProduct(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

    const name = str(formData, 'name')
    if (!name) return { error: 'Nome é obrigatório.' }
    const unit = str(formData, 'unit')
    if (!unit) return { error: 'Unidade é obrigatória.' }

    const categoryId = str(formData, 'category_id')
    const admin = createAdminClient()

    // Resolve o nome da categoria para geração do SKU e campo denormalizado
    let categoryName: string | null = null
    if (categoryId) {
      const { data: cat } = await admin.from('product_categories').select('name').eq('id', categoryId).single()
      categoryName = cat?.name ?? null
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

    // Estoque inicial — só cria movimento se for usuário de filial e informou quantidade
    const initialQty  = num(formData, 'initial_qty')
    const initialCost = num(formData, 'initial_cost')
    if (initialQty && initialQty > 0 && ctx.branchId && newProduct) {
      await admin.from('stock_movements').insert({
        branch_id:     ctx.branchId,
        product_id:    newProduct.id,
        type:          'PURCHASE',
        quantity:      initialQty,
        balance_after: initialQty,
        notes:         str(formData, 'initial_notes') ?? 'Estoque inicial',
        created_by:    ctx.internalUserId,
      })

      await admin.from('branch_product_stock').upsert({
        product_id:    newProduct.id,
        branch_id:     ctx.branchId,
        current_stock: initialQty,
        min_stock:     minStock,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'product_id,branch_id' })

      const initialBatch   = str(formData, 'initial_batch')
      const initialExpires = str(formData, 'initial_expires_at')
      if (initialBatch) {
        await admin.from('product_batches').insert({
          product_id:   newProduct.id,
          batch_number: initialBatch,
          expires_at:   initialExpires ?? null,
          quantity:     initialQty,
        })
      }

      // Atualiza custo do produto e registra despesa financeira
      if (initialCost && initialCost > 0) {
        await admin.from('products').update({ cost_price: initialCost }).eq('id', newProduct.id)

        await admin.from('financial_transactions').insert({
          branch_id:   ctx.branchId,
          type:        'EXPENSE',
          category:    'Estoque',
          description: `Compra: ${name}`,
          amount:      initialCost * initialQty,
          is_paid:     true,
          paid_at:     new Date().toISOString(),
          notes:       str(formData, 'initial_notes') ?? 'Estoque inicial',
          created_by:  ctx.internalUserId,
        })
      }
    }

    revalidatePath('/admin/produtos')
    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
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
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

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
      const { data: cat } = await admin.from('product_categories').select('name').eq('id', categoryId).single()
      categoryName = cat?.name ?? null
    }

    // Preserva SKU existente; gera novo somente se ainda não tem e uma categoria foi definida
    const { data: current } = await admin.from('products').select('sku').eq('id', productId).single()
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
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function findProductByBarcode(barcode: string) {
  try {
    const ctx = await getTenantContext()
    const admin = createAdminClient()

    const { data } = await admin
      .from('products')
      .select('id, name, unit, cost_price, consumption_unit, units_per_package, sku, category, barcode')
      .eq('tenant_id', ctx.tenantId!)
      .eq('barcode', barcode.trim())
      .eq('is_active', true)
      .maybeSingle()

    if (!data) return { error: 'Nenhum produto encontrado com este código.' }
    return { product: data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function toggleProductActive(productId: string, isActive: boolean) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN'])

    const admin = createAdminClient()
    await admin.from('products')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('tenant_id', ctx.tenantId!)

    revalidatePath('/admin/produtos')
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
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

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
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

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

export async function createStockMovement(
  _prev: { error?: string; success?: boolean; balanceAfter?: number } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

    const branchId  = str(formData, '_branchId')
    const slug      = str(formData, '_slug') ?? ''
    const productId = str(formData, '_productId')
    if (!branchId || !productId) return { error: 'Produto não identificado.' }

    const movType = str(formData, 'type') as 'PURCHASE' | 'MANUAL_ADJUSTMENT' | null
    if (!movType) return { error: 'Tipo de movimentação é obrigatório.' }

    const qtyRaw = str(formData, 'quantity')
    if (!qtyRaw) return { error: 'Quantidade é obrigatória.' }
    const qty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return { error: 'Quantidade deve ser maior que zero.' }

    const isExact = str(formData, 'is_exact') === 'true'

    const supabase = await createSupabase()

    // Busca estoque atual da filial para este produto
    const { data: bps } = await supabase
      .from('branch_product_stock')
      .select('current_stock')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .single()

    const currentStock = Number(bps?.current_stock ?? 0)
    let delta: number
    let balanceAfter: number

    if (isExact) {
      delta        = qty - currentStock
      balanceAfter = qty
    } else if (movType === 'PURCHASE') {
      delta        = qty
      balanceAfter = currentStock + qty
    } else {
      delta        = -qty
      balanceAfter = currentStock - qty
      if (balanceAfter < 0) return { error: `Estoque insuficiente. Disponível: ${currentStock}` }
    }

    const admin = createAdminClient()

    await admin.from('stock_movements').insert({
      branch_id:     branchId,
      product_id:    productId,
      type:          movType,
      quantity:      delta,
      balance_after: balanceAfter,
      notes:         str(formData, 'notes'),
      created_by:    ctx.internalUserId,
    })

    // Upsert do estoque da filial
    await admin.from('branch_product_stock').upsert({
      product_id:    productId,
      branch_id:     branchId,
      current_stock: balanceAfter,
      min_stock:     Number(bps?.current_stock !== undefined
        ? (await supabase.from('branch_product_stock').select('min_stock').eq('product_id', productId).eq('branch_id', branchId).single()).data?.min_stock ?? 0
        : 0),
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'product_id,branch_id' })

    // Se informou lote, cria ProductBatch
    const batchNumber = str(formData, 'batch_number')
    const expiresAt   = str(formData, 'expires_at')
    if (batchNumber && delta > 0) {
      await admin.from('product_batches').insert({
        product_id:   productId,
        batch_number: batchNumber,
        expires_at:   expiresAt ?? null,
        quantity:     delta,
      })
    }

    // Em entrada de compra: atualiza custo do produto e registra despesa financeira
    if (movType === 'PURCHASE' && delta > 0) {
      const costPerPkg = num(formData, 'cost_price')
      if (costPerPkg && costPerPkg > 0) {
        const productName = str(formData, '_productName') ?? 'Produto'

        await admin.from('products').update({ cost_price: costPerPkg }).eq('id', productId)

        await admin.from('financial_transactions').insert({
          branch_id:   branchId,
          type:        'EXPENSE',
          category:    'Estoque',
          description: `Compra: ${productName}`,
          amount:      costPerPkg * delta,
          is_paid:     true,
          paid_at:     new Date().toISOString(),
          notes:       str(formData, 'notes'),
          created_by:  ctx.internalUserId,
        })
      }
    }

    revalidatePath(`/${slug}/stock`)
    revalidatePath(`/${slug}/financial`)
    return { success: true, balanceAfter }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function adminUpdateMinStock(productId: string, branchId: string, minStock: number) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])
    if (ctx.role === 'BRANCH_ADMIN' && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua filial.' }

    const admin = createAdminClient()
    await admin.from('branch_product_stock').upsert({
      product_id: productId,
      branch_id:  branchId,
      min_stock:  minStock,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id,branch_id' })

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function updateBranchMinStock(productId: string, branchId: string, minStock: number, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

    const admin = createAdminClient()
    await admin.from('branch_product_stock').upsert({
      product_id: productId,
      branch_id:  branchId,
      min_stock:  minStock,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id,branch_id' })

    revalidatePath(`/${slug}/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Gestão de estoque (NETWORK_ADMIN) ---------------------------

export async function adminAddStock(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

    const productId = str(formData, 'productId')
    const branchId  = str(formData, 'branchId')
    if (!productId) return { error: 'Produto não identificado.' }
    if (!branchId)  return { error: 'Selecione uma filial.' }
    if (ctx.role === 'BRANCH_ADMIN' && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua filial.' }

    const qtyRaw = str(formData, 'quantity')
    if (!qtyRaw) return { error: 'Quantidade é obrigatória.' }
    const qty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return { error: 'Quantidade deve ser maior que zero.' }

    const unitCost    = num(formData, 'unit_cost')
    const notes       = str(formData, 'notes')
    const batchNumber = str(formData, 'batch_number')
    const expiresAt   = str(formData, 'expires_at')

    const admin = createAdminClient()

    const [{ data: bps }, upp] = await Promise.all([
      admin
        .from('branch_product_stock')
        .select('current_stock, min_stock, current_rendimento')
        .eq('product_id', productId)
        .eq('branch_id', branchId)
        .single(),
      getUpp(admin, productId),
    ])

    const currentStock      = Number(bps?.current_stock ?? 0)
    const balanceAfter      = currentStock + qty
    const currentRendimento = bps?.current_rendimento != null ? Number(bps.current_rendimento) : (upp ? currentStock * upp : null)
    const newRendimento     = upp && currentRendimento != null ? currentRendimento + qty * upp : null

    await admin.from('stock_movements').insert({
      branch_id:     branchId,
      product_id:    productId,
      type:          'PURCHASE',
      quantity:      qty,
      balance_after: balanceAfter,
      unit_cost:     unitCost,
      notes,
      created_by:    ctx.internalUserId,
    })

    await admin.from('branch_product_stock').upsert({
      product_id:         productId,
      branch_id:          branchId,
      current_stock:      balanceAfter,
      current_rendimento: newRendimento,
      min_stock:          Number(bps?.min_stock ?? 0),
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'product_id,branch_id' })

    if (batchNumber) {
      await admin.from('product_batches').insert({
        product_id:   productId,
        branch_id:    branchId,
        batch_number: batchNumber,
        expires_at:   expiresAt ?? null,
        quantity:     qty,
      })
    }

    // Atualiza o cost_price do produto com o custo desta compra (preço da última entrada)
    if (unitCost && unitCost > 0) {
      await admin
        .from('products')
        .update({ cost_price: unitCost, updated_at: new Date().toISOString() })
        .eq('id', productId)
    }

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function adminTransferStock(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN'])

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
    const admin = createAdminClient()

    const [{ data: fromBps }, { data: toBps }, upp] = await Promise.all([
      admin.from('branch_product_stock').select('current_stock, min_stock, current_rendimento').eq('product_id', productId).eq('branch_id', fromBranchId).single(),
      admin.from('branch_product_stock').select('current_stock, min_stock, current_rendimento').eq('product_id', productId).eq('branch_id', toBranchId).single(),
      getUpp(admin, productId),
    ])

    const fromCurrent = Number(fromBps?.current_stock ?? 0)
    if (qty > fromCurrent) return { error: `Estoque insuficiente na filial de origem. Disponível: ${fromCurrent}` }

    const fromAfter  = fromCurrent - qty
    const toCurrent  = Number(toBps?.current_stock ?? 0)
    const toAfter    = toCurrent + qty
    const now        = new Date().toISOString()
    const ref        = `TRANSFER-${Date.now()}`

    // Rendimento: transfere qty embalagens inteiras (sempre cheias)
    const fromRendimento      = fromBps?.current_rendimento != null ? Number(fromBps.current_rendimento) : (upp ? fromCurrent * upp : null)
    const toRendimento        = toBps?.current_rendimento   != null ? Number(toBps.current_rendimento)   : (upp ? toCurrent  * upp : null)
    const fromRendimentoAfter = upp && fromRendimento != null ? Math.max(0, fromRendimento - qty * upp) : null
    const toRendimentoAfter   = upp && toRendimento   != null ? toRendimento + qty * upp                : null

    await admin.from('stock_movements').insert([
      {
        branch_id:     fromBranchId,
        product_id:    productId,
        type:          'TRANSFER_OUT',
        quantity:      -qty,
        balance_after: fromAfter,
        notes:         notes ? `Transferência → destino. ${notes}` : 'Transferência para filial destino.',
        reference:     ref,
        created_by:    ctx.internalUserId,
        created_at:    now,
      },
      {
        branch_id:     toBranchId,
        product_id:    productId,
        type:          'TRANSFER_IN',
        quantity:      qty,
        balance_after: toAfter,
        notes:         notes ? `Transferência ← origem. ${notes}` : 'Transferência da filial de origem.',
        reference:     ref,
        created_by:    ctx.internalUserId,
        created_at:    now,
      },
    ])

    await admin.from('branch_product_stock').upsert([
      {
        product_id:         productId,
        branch_id:          fromBranchId,
        current_stock:      fromAfter,
        current_rendimento: fromRendimentoAfter,
        min_stock:          Number(fromBps?.min_stock ?? 0),
        updated_at:         now,
      },
      {
        product_id:         productId,
        branch_id:          toBranchId,
        current_stock:      toAfter,
        current_rendimento: toRendimentoAfter,
        min_stock:          Number(toBps?.min_stock ?? 0),
        updated_at:         now,
      },
    ], { onConflict: 'product_id,branch_id' })

    revalidatePath('/admin/estoque')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function adminAdjustStock(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

    const productId = str(formData, 'productId')
    const branchId  = str(formData, 'branchId')
    if (!productId) return { error: 'Produto não identificado.' }
    if (!branchId)  return { error: 'Selecione uma filial.' }
    if (ctx.role === 'BRANCH_ADMIN' && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua filial.' }

    const reason = str(formData, 'reason')
    if (!reason) return { error: 'Motivo do ajuste é obrigatório.' }

    const qtyRaw = (formData.get('new_quantity') as string | null)?.trim()
    if (!qtyRaw) return { error: 'Novo estoque é obrigatório.' }
    const newQty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(newQty) || newQty < 0) return { error: 'Novo estoque não pode ser negativo.' }

    const admin = createAdminClient()

    const [{ data: bps }, upp] = await Promise.all([
      admin.from('branch_product_stock').select('current_stock, min_stock, current_rendimento').eq('product_id', productId).eq('branch_id', branchId).single(),
      getUpp(admin, productId),
    ])

    const currentStock = Number(bps?.current_stock ?? 0)
    const delta        = newQty - currentStock

    // Preserva o consumo acumulado ao ajustar a quantidade de embalagens.
    // Ex.: 100 frascos × 100ml/frasco = 10.000ml totais; disponível = 9.999ml → consumido = 1ml.
    // Ajuste para 20 frascos → 2.000ml totais − 1ml consumido = 1.999ml disponíveis.
    let newRendimento: number | null = null
    if (upp !== null && upp > 0) {
      const currentTotal    = currentStock * upp
      const currentAvail    = bps?.current_rendimento != null ? Number(bps.current_rendimento) : currentTotal
      const consumed        = Math.max(0, currentTotal - currentAvail)
      const newTotal        = newQty * upp
      newRendimento         = Math.max(0, newTotal - consumed)
    }

    await admin.from('stock_movements').insert({
      branch_id:     branchId,
      product_id:    productId,
      type:          'MANUAL_ADJUSTMENT',
      quantity:      delta,
      balance_after: newQty,
      notes:         reason,
      created_by:    ctx.internalUserId,
    })

    await admin.from('branch_product_stock').upsert({
      product_id:         productId,
      branch_id:          branchId,
      current_stock:      newQty,
      current_rendimento: newRendimento,
      min_stock:          Number(bps?.min_stock ?? 0),
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'product_id,branch_id' })

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function getProductMovements(productId: string, branchId: string) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL'])

  const supabase = await createSupabase()
  const { data } = await supabase
    .from('stock_movements')
    .select('id, type, quantity, balance_after, notes, created_at')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data ?? []
}

export async function saveBarcodeToProduct(productId: string, barcode: string) {
  try {
    const ctx   = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])
    const admin = createAdminClient()

    const { data: prod } = await admin
      .from('products')
      .select('tenant_id')
      .eq('id', productId)
      .maybeSingle()
    if (!prod || prod.tenant_id !== ctx.tenantId)
      return { error: 'Produto não encontrado.' }

    const code = barcode.trim()
    const { data: conflict } = await admin
      .from('products')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .eq('barcode', code)
      .neq('id', productId)
      .maybeSingle()
    if (conflict)
      return { error: `Código já vinculado ao produto "${conflict.name}".` }

    await admin
      .from('products')
      .update({ barcode: code, updated_at: new Date().toISOString() })
      .eq('id', productId)

    revalidatePath('/admin/estoque')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function searchProducts(query: string) {
  try {
    const ctx   = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])
    const admin = createAdminClient()

    const { data } = await admin
      .from('products')
      .select('id, name, sku, unit, barcode')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .ilike('name', `%${query.trim()}%`)
      .order('name')
      .limit(20)

    return { products: (data ?? []) as { id: string; name: string; sku: string | null; unit: string; barcode: string | null }[] }
  } catch (e) {
    return { products: [] as { id: string; name: string; sku: string | null; unit: string; barcode: string | null }[] }
  }
}
