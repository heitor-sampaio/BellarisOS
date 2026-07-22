'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CRMStage {
  id:       string
  name:     string
  color:    string
  position: number
}

const DEFAULT_STAGES = [
  { name: 'Novo',        color: '#c34d6b', position: 0 },
  { name: 'Em contato',  color: '#7c4ddb', position: 1 },
  { name: 'Avaliação',   color: '#c98a1e', position: 2 },
  { name: 'Agendado',    color: '#2563b0', position: 3 },
  { name: 'Fechado',     color: '#3f9b6f', position: 4 },
  { name: 'Perdido',     color: '#9e9e9e', position: 5 },
]

// Seed etapas padrão se a rede ainda não tiver nenhuma
export async function seedDefaultStages(tenantId: string): Promise<CRMStage[]> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('crm_stages')
    .select('id, name, color, position')
    .eq('tenant_id', tenantId)
    .order('position')

  if (existing && existing.length > 0) return existing as CRMStage[]

  const { data: seeded } = await admin
    .from('crm_stages')
    .insert(DEFAULT_STAGES.map(s => ({ ...s, tenant_id: tenantId })))
    .select('id, name, color, position')
    .order('position')

  return (seeded ?? []) as CRMStage[]
}

// --- Criar etapa (NETWORK_ADMIN only) ----------------------------
export async function createStage(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const name  = (formData.get('name')  as string)?.trim()
    const color = (formData.get('color') as string)?.trim() || '#c34d6b'
    const slug  = (formData.get('_slug') as string)?.trim() ?? ''

    if (!name) return { error: 'Nome da etapa é obrigatório.' }

    const admin = createAdminClient()

    const { data: last } = await admin
      .from('crm_stages')
      .select('position')
      .eq('tenant_id', ctx.tenantId!)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const position = last ? (last.position as number) + 1 : 0

    const { error } = await admin.from('crm_stages').insert({
      tenant_id: ctx.tenantId!,
      name, color, position,
    })

    if (error) return { error: `Erro ao criar etapa: ${error.message}` }

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Renomear (NETWORK_ADMIN only) -------------------------------
export async function renameStage(stageId: string, name: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')
    if (!name.trim()) return

    const admin = createAdminClient()
    await admin
      .from('crm_stages')
      .update({ name: name.trim() })
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
  } catch (e) {
    console.error('[renameStage]', e)
  }
}

// --- Mudar cor (NETWORK_ADMIN only) ------------------------------
export async function updateStageColor(stageId: string, color: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    await admin
      .from('crm_stages')
      .update({ color })
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
  } catch (e) {
    console.error('[updateStageColor]', e)
  }
}

// --- Excluir (NETWORK_ADMIN only) --------------------------------
export async function deleteStage(stageId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()

    const { count } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('crm_stage_id', stageId)
      .eq('tenant_id', ctx.tenantId!)

    if ((count ?? 0) > 0) {
      return { error: `Esta etapa possui ${count} lead(s). Mova-os antes de excluir.` }
    }

    await admin
      .from('crm_stages')
      .delete()
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Reordenar (NETWORK_ADMIN only) ------------------------------
export async function reorderStages(orderedIds: string[], slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    await Promise.all(
      orderedIds.map((id, idx) =>
        admin
          .from('crm_stages')
          .update({ position: idx })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId!),
      ),
    )

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
  } catch (e) {
    console.error('[reorderStages]', e)
  }
}
