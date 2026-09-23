'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { procedimentoCriado, procedimentoPrecoAlterado } from '@/lib/events/cadastro'

/**
 * Procedimento é dado da REDE.
 *
 * O catálogo, o preço e a disponibilidade valem para todas as unidades, então
 * incluir, editar e remover é de quem tem abrangência de rede — decisão de
 * produto de 2026-09-18. Existia um caminho paralelo (`createBranchProcedure`)
 * que deixava a unidade criar procedimento local pelo `/[slug]/procedures`,
 * com metade dos campos: saiu junto.
 *
 * A checagem é por abrangência (`branchId === null`), nunca por nome de cargo.
 * `procedures: MANAGE` continua valendo — é a permissão que decide o quê; a
 * abrangência decide onde.
 */
function assertRede(ctx: { branchId: string | null }) {
  if (ctx.branchId !== null) {
    throw new Error('Procedimentos são do catálogo da rede: só quem tem abrangência de rede pode alterá-los.')
  }
}

// --- Criar procedimento (rede) -------------------------------------
export async function addProcedure(
  _prev: { error?: string; success?: boolean; procedureId?: string } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'MANAGE')
  assertRede(ctx)

  const name        = (formData.get('name') as string)?.trim()
  const category    = (formData.get('category') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const durationMin = parseInt(formData.get('duration_min') as string, 10)
  const priceRaw    = (formData.get('price') as string)?.replace(/\./g, '').replace(',', '.')
  const price       = parseFloat(priceRaw)
  const laborCostRaw = (formData.get('labor_cost') as string)?.replace(/\./g, '').replace(',', '.')
  const laborCost    = parseFloat(laborCostRaw) || 0
  const otherCostsRaw = (formData.get('other_costs') as string)?.replace(/\./g, '').replace(',', '.')
  const otherCosts    = parseFloat(otherCostsRaw) || 0
  const visibleOnClientApp = formData.get('visible_on_client_app') === 'on'
  // Consulta de avaliação: abre o planejamento de tratamento no atendimento.
  const isEvaluation       = formData.get('is_evaluation') === 'on'
  const anamnesisFormId = (formData.get('anamnesis_form_id') as string)?.trim() || null
  const attendanceFormId = (formData.get('attendance_form_id') as string)?.trim() || null
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
      other_costs:           otherCosts,
      visible_on_client_app: visibleOnClientApp,
      anamnesis_form_id:     anamnesisFormId,
      attendance_form_id:    attendanceFormId,
      is_evaluation:         isEvaluation,
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

  // Emitido DEPOIS dos insumos e da disponibilidade: o retrato de um
  // procedimento recém-criado sem eles descreveria um estado que durou
  // milissegundos e nunca existiu para o usuário.
  await procedimentoCriado(procedure.id as string, ctx)

  revalidatePath('/admin/procedures')
  revalidateTag(`procedures:${ctx.tenantId!}`, 'max')
  return { success: true, procedureId: procedure.id }
}

// --- Atualizar procedimento (rede) ---------------------------------
export async function updateProcedure(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'MANAGE')
  assertRede(ctx)

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
  const otherCostsRaw = (formData.get('other_costs') as string)?.replace(/\./g, '').replace(',', '.')
  const otherCosts    = parseFloat(otherCostsRaw) || 0
  const visibleOnClientApp = formData.get('visible_on_client_app') === 'on'
  // Consulta de avaliação: abre o planejamento de tratamento no atendimento.
  const isEvaluation       = formData.get('is_evaluation') === 'on'
  const anamnesisFormId = (formData.get('anamnesis_form_id') as string)?.trim() || null
  const attendanceFormId = (formData.get('attendance_form_id') as string)?.trim() || null
  const branchIds     = JSON.parse((formData.get('branch_ids')     as string) || '[]') as string[]
  const products      = JSON.parse((formData.get('products')       as string) || '[]') as { product_id: string; quantity: number; unit_cost: number }[]
  const branchPricing = JSON.parse((formData.get('branch_pricing') as string) || '[]') as { branch_id: string; price: number | null; labor_cost: number | null }[]
  const changedBy     = ctx.internalUserId

  if (!name || !category)                    return { error: 'Nome e categoria são obrigatórios.' }
  if (isNaN(price) || price < 0)             return { error: 'Preço inválido.' }

  const admin = createAdminClient()

  // Histório de preço se alterado
  const precoAnterior = parseFloat(String(existing.price))
  const precoMudou    = price !== precoAnterior
  if (precoMudou) {
    await admin.from('procedure_price_history').insert({
      procedure_id: procedureId,
      price:        existing.price,
      changed_by:   changedBy,
    })
  }

  // Atualiza dados básicos
  const { error } = await admin
    .from('procedures')
    .update({ name, category, description, duration_min: durationMin, price, labor_cost: laborCost, other_costs: otherCosts, visible_on_client_app: visibleOnClientApp, is_evaluation: isEvaluation, anamnesis_form_id: anamnesisFormId, attendance_form_id: attendanceFormId })
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

  // Só quando o preço mudou de verdade. Editar a descrição e salvar é o uso
  // comum desta tela; emitir aí faria a automação de preço disparar à toa.
  if (precoMudou) await procedimentoPrecoAlterado(procedureId, ctx, precoAnterior)

  revalidatePath('/admin/procedures')
  revalidateTag(`procedures:${ctx.tenantId!}`, 'max')
  return { success: true }
}

// --- Ativar / desativar (rede) -------------------------------------
export async function toggleProcedureStatus(procedureId: string, isActive: boolean) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'MANAGE')
  assertRede(ctx)

  const admin = createAdminClient()
  await admin
    .from('procedures')
    .update({ is_active: isActive })
    .eq('id', procedureId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath('/admin/procedures')
  revalidateTag(`procedures:${ctx.tenantId!}`, 'max')
}
