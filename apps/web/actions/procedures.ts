'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// --- Criar procedimento (apenas NETWORK_ADMIN) ---------------------
export async function addProcedure(
  _prev: { error?: string; success?: boolean; procedureId?: string } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const name        = (formData.get('name') as string)?.trim()
  const category    = (formData.get('category') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const durationMin = parseInt(formData.get('duration_min') as string, 10)
  const priceRaw    = (formData.get('price') as string)?.replace(/\./g, '').replace(',', '.')
  const price       = parseFloat(priceRaw)
  const laborCostRaw = (formData.get('labor_cost') as string)?.replace(/\./g, '').replace(',', '.')
  const laborCost    = parseFloat(laborCostRaw) || 0
  const visibleOnClientApp = formData.get('visible_on_client_app') === 'on'
  const branchIds      = JSON.parse((formData.get('branch_ids')     as string) || '[]') as string[]
  const products       = JSON.parse((formData.get('products')       as string) || '[]') as { product_id: string; quantity: number; unit_cost: number }[]
  const branchPricing  = JSON.parse((formData.get('branch_pricing') as string) || '[]') as { branch_id: string; price: number | null; labor_cost: number | null }[]

  if (!name || !category)                        return { error: 'Nome e categoria são obrigatórios.' }
  if (isNaN(durationMin) || durationMin < 1)     return { error: 'Duração inválida.' }
  if (isNaN(price) || price < 0)                 return { error: 'Preço inválido.' }

  const admin = createAdminClient()

  // Insere o procedimento no catálogo da rede (branch_id = null)
  const { data: procedure, error } = await admin
    .from('procedures')
    .insert({
      tenant_id:             ctx.tenantId!,
      branch_id:             null,
      name,
      category,
      description,
      duration_min:          durationMin,
      price,
      labor_cost:            laborCost,
      visible_on_client_app: visibleOnClientApp,
      is_active:             true,
    })
    .select('id')
    .single()

  if (error || !procedure) return { error: 'Erro ao criar procedimento.' }

  // Disponibilidade por filial (vazio = todas)
  if (branchIds.length > 0) {
    await admin.from('procedure_branch_availability').insert(
      branchIds.map(bid => ({ procedure_id: procedure.id, branch_id: bid }))
    )
  }

  // Insumos
  if (products.length > 0) {
    await admin.from('procedure_products').insert(
      products.map(p => ({ procedure_id: procedure.id, product_id: p.product_id, quantity: p.quantity, unit_cost: p.unit_cost ?? 0 }))
    )
  }

  // Overrides de preço/custo por filial
  if (branchPricing.length > 0) {
    await admin.from('procedure_branch_pricing').insert(
      branchPricing.map(bp => ({ procedure_id: procedure.id, branch_id: bp.branch_id, price: bp.price, labor_cost: bp.labor_cost }))
    )
  }

  revalidatePath('/admin/procedures')
  revalidateTag(`procedures:${ctx.tenantId!}`, 'max')
  return { success: true, procedureId: procedure.id }
}

// --- Atualizar procedimento (apenas NETWORK_ADMIN) -----------------
export async function updateProcedure(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const procedureId = formData.get('_procedureId') as string

  const supabase = await createSupabase()
  const { data: existing } = await supabase
    .from('procedures')
    .select('id, price')
    .eq('id', procedureId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!existing) return { error: 'Procedimento não encontrado.' }

  const name        = (formData.get('name') as string)?.trim()
  const category    = (formData.get('category') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const durationMin = parseInt(formData.get('duration_min') as string, 10)
  const priceRaw    = (formData.get('price') as string)?.replace(/\./g, '').replace(',', '.')
  const price       = parseFloat(priceRaw)
  const laborCostRaw = (formData.get('labor_cost') as string)?.replace(/\./g, '').replace(',', '.')
  const laborCost    = parseFloat(laborCostRaw) || 0
  const visibleOnClientApp = formData.get('visible_on_client_app') === 'on'
  const branchIds     = JSON.parse((formData.get('branch_ids')     as string) || '[]') as string[]
  const products      = JSON.parse((formData.get('products')       as string) || '[]') as { product_id: string; quantity: number; unit_cost: number }[]
  const branchPricing = JSON.parse((formData.get('branch_pricing') as string) || '[]') as { branch_id: string; price: number | null; labor_cost: number | null }[]
  const changedBy     = ctx.internalUserId

  if (!name || !category)                    return { error: 'Nome e categoria são obrigatórios.' }
  if (isNaN(price) || price < 0)             return { error: 'Preço inválido.' }

  const admin = createAdminClient()

  // Histório de preço se alterado
  if (price !== parseFloat(String(existing.price))) {
    await admin.from('procedure_price_history').insert({
      procedure_id: procedureId,
      price:        existing.price,
      changed_by:   changedBy,
    })
  }

  // Atualiza dados básicos
  const { error } = await admin
    .from('procedures')
    .update({ name, category, description, duration_min: durationMin, price, labor_cost: laborCost, visible_on_client_app: visibleOnClientApp })
    .eq('id', procedureId)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { error: 'Erro ao atualizar procedimento.' }

  // Substitui disponibilidade por filial (delete + insert)
  await admin.from('procedure_branch_availability').delete().eq('procedure_id', procedureId)
  if (branchIds.length > 0) {
    await admin.from('procedure_branch_availability').insert(
      branchIds.map(bid => ({ procedure_id: procedureId, branch_id: bid }))
    )
  }

  // Substitui insumos (delete + insert)
  await admin.from('procedure_products').delete().eq('procedure_id', procedureId)
  if (products.length > 0) {
    await admin.from('procedure_products').insert(
      products.map(p => ({ procedure_id: procedureId, product_id: p.product_id, quantity: p.quantity, unit_cost: p.unit_cost ?? 0 }))
    )
  }

  // Substitui overrides de preço/custo por filial (delete + insert)
  await admin.from('procedure_branch_pricing').delete().eq('procedure_id', procedureId)
  if (branchPricing.length > 0) {
    await admin.from('procedure_branch_pricing').insert(
      branchPricing.map(bp => ({ procedure_id: procedureId, branch_id: bp.branch_id, price: bp.price, labor_cost: bp.labor_cost }))
    )
  }

  revalidatePath('/admin/procedures')
  revalidateTag(`procedures:${ctx.tenantId!}`, 'max')
  return { success: true }
}

// --- Criar procedimento local da filial (apenas NETWORK_ADMIN) ----------------
export async function createBranchProcedure(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const name        = (formData.get('name')        as string | null)?.trim()
  const category    = (formData.get('category')    as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const durationMin = parseInt(formData.get('duration_min') as string, 10)
  const price       = parseFloat(((formData.get('price') as string) ?? '').replace(',', '.'))
  const visibleApp  = formData.get('visible_on_client_app') === 'true'
  const branchId    = (formData.get('branch_id')   as string | null)?.trim() || null
  const slug        = (formData.get('slug')         as string | null)?.trim()

  if (!name)                                  return { error: 'Informe o nome do procedimento.' }
  if (!category)                              return { error: 'Selecione uma categoria.' }
  if (isNaN(durationMin) || durationMin <= 0) return { error: 'Informe a duração em minutos.' }
  if (isNaN(price) || price <= 0)             return { error: 'Informe um preço válido.' }
  if (!branchId)                              return { error: 'Filial não identificada.' }

  // Verifica que a filial pertence ao tenant
  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) return { error: 'Filial não encontrada.' }

  const { error } = await supabase.from('procedures').insert({
    tenant_id:             ctx.tenantId!,
    branch_id:             branchId,
    name,
    category,
    description,
    duration_min:          durationMin,
    price,
    visible_on_client_app: visibleApp,
    is_active:             true,
  })

  if (error) return { error: `Erro ao criar: ${error.message}` }

  revalidatePath(`/${slug}/procedures`)
  revalidateTag(`procedures:${ctx.tenantId!}`, 'max')
  return {}
}

// --- Ativar / desativar (apenas NETWORK_ADMIN) --------------------
export async function toggleProcedureStatus(procedureId: string, isActive: boolean) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  await admin
    .from('procedures')
    .update({ is_active: isActive })
    .eq('id', procedureId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath('/admin/procedures')
  revalidateTag(`procedures:${ctx.tenantId!}`, 'max')
}
