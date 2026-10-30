'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { maskPhone } from '@estetica-os/utils'

export async function updateTenantProfile(data: {
  name: string
  document?: string
  phone?: string
  website?: string
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const name     = data.name?.trim()
  // Só os dígitos: com máscara, o mesmo CNPJ viraria dois documentos para qualquer busca.
  const document = data.document?.replace(/\D/g, '') || null
  // No formato da tela, o mesmo da aba Geral (J-2).
  const phone    = data.phone?.trim() ? maskPhone(data.phone.trim()) : null
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
