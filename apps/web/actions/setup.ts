'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function updateTenantProfile(data: {
  name: string
  document?: string
  phone?: string
  website?: string
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const name     = data.name?.trim()
  const document = data.document?.trim() || null
  const phone    = data.phone?.trim() || null
  const website  = data.website?.trim() || null

  if (!name) return { error: 'Nome é obrigatório.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('tenants')
    .update({ name, document, phone, website })
    .eq('id', ctx.tenantId!)

  if (error) return { error: 'Erro ao salvar. Tente novamente.' }

  return { success: true }
}

export async function completeOnboarding() {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const { error } = await admin
    .from('tenants')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', ctx.tenantId!)

  if (error) return { error: 'Erro ao concluir configuração.' }

  revalidatePath('/admin/dashboard')
  return { success: true }
}
