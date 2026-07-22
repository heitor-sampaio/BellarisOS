'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeFormSchema, validateFormSchema } from '@/lib/anamnesis'

type Result = { error?: string; id?: string; ok?: true }

function revalidate() {
  revalidatePath('/admin/settings')
  revalidatePath('/admin/procedures')
}

export async function createAnamnesisForm(input: { name: string; schema: unknown }): Promise<Result> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'settings', 'MANAGE')

    const name = (input.name ?? '').trim()
    if (!name) return { error: 'Informe um nome para a ficha.' }

    const schema = normalizeFormSchema(input.schema)
    const invalid = validateFormSchema(schema)
    if (invalid) return { error: invalid }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('anamnesis_forms')
      .insert({ tenant_id: ctx.tenantId!, name, schema })
      .select('id')
      .single()

    if (error || !data) return { error: `Erro ao criar ficha: ${error?.message}` }
    revalidate()
    return { id: data.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function updateAnamnesisForm(input: {
  id: string; name: string; schema: unknown; isActive?: boolean
}): Promise<Result> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'settings', 'MANAGE')

    const name = (input.name ?? '').trim()
    if (!name) return { error: 'Informe um nome para a ficha.' }

    const schema = normalizeFormSchema(input.schema)
    const invalid = validateFormSchema(schema)
    if (invalid) return { error: invalid }

    const admin = createAdminClient()
    const patch: Record<string, unknown> = { name, schema, updated_at: new Date().toISOString() }
    if (typeof input.isActive === 'boolean') patch.is_active = input.isActive

    const { error } = await admin
      .from('anamnesis_forms')
      .update(patch)
      .eq('id', input.id)
      .eq('tenant_id', ctx.tenantId!)

    if (error) return { error: `Erro ao salvar ficha: ${error.message}` }
    revalidate()
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function setAnamnesisFormActive(id: string, isActive: boolean): Promise<Result> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'settings', 'MANAGE')
    const admin = createAdminClient()
    const { error } = await admin
      .from('anamnesis_forms')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId!)
    if (error) return { error: error.message }
    revalidate()
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function deleteAnamnesisForm(id: string): Promise<Result> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'settings', 'MANAGE')
    const admin = createAdminClient()
    // FK procedures.anamnesis_form_id é ON DELETE SET NULL — remoção é segura.
    const { error } = await admin
      .from('anamnesis_forms')
      .delete()
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId!)
    if (error) return { error: error.message }
    revalidate()
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}
