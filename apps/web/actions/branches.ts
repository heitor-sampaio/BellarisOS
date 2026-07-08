'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export async function createBranch(
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const name     = (formData.get('name') as string)?.trim()
  const slugRaw  = (formData.get('slug') as string)?.trim()
  const document = (formData.get('document') as string)?.trim() || null
  const email    = (formData.get('email') as string)?.trim().toLowerCase() || null
  const phone    = (formData.get('phone') as string)?.trim() || null
  const address  = (formData.get('address') as string)?.trim() || null
  const city     = (formData.get('city') as string)?.trim() || null
  const state    = (formData.get('state') as string)?.trim().toUpperCase() || null
  const zipCode  = (formData.get('zip_code') as string)?.trim() || null

  if (!name) return { error: 'Nome é obrigatório.' }

  const slug = slugRaw ? toSlug(slugRaw) : toSlug(name)
  if (!slug) return { error: 'Slug inválido.' }

  const supabase = createAdminClient()

  // Verifica unicidade do slug no tenant
  const { data: existing } = await supabase
    .from('branches')
    .select('id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('slug', slug)
    .maybeSingle()

  if (existing) return { error: `O slug "${slug}" já está em uso. Escolha outro nome.` }

  const { error: insertError } = await supabase.from('branches').insert({
    tenant_id: ctx.tenantId!,
    name,
    slug,
    document,
    email,
    phone,
    address,
    city,
    state,
    zip_code: zipCode,
  })

  if (insertError) return { error: 'Erro ao criar unidade. Tente novamente.' }

  revalidatePath('/admin/branches')
  revalidateTag(`branches:${ctx.tenantId!}`, 'max')
  return { success: true }
}

export async function updateBranch(
  branchId: string,
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const name              = (formData.get('name') as string)?.trim()
  const document          = (formData.get('document') as string)?.trim() || null
  const stateRegistration = (formData.get('state_registration') as string)?.trim() || null
  const email             = (formData.get('email') as string)?.trim().toLowerCase() || null
  const phone             = (formData.get('phone') as string)?.trim() || null
  const address           = (formData.get('address') as string)?.trim() || null
  const city              = (formData.get('city') as string)?.trim() || null
  const state             = (formData.get('state') as string)?.trim().toUpperCase() || null
  const zipCode           = (formData.get('zip_code') as string)?.trim() || null

  if (!name) return { error: 'Nome é obrigatório.' }

  const supabase = createAdminClient()

  const { error: updateError } = await supabase
    .from('branches')
    .update({
      name,
      document,
      state_registration: stateRegistration,
      email,
      phone,
      address,
      city,
      state,
      zip_code: zipCode,
    })
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)

  if (updateError) return { error: 'Erro ao salvar. Tente novamente.' }

  revalidatePath('/admin/branches')
  revalidatePath(`/admin/branches/${branchId}`)
  revalidateTag(`branches:${ctx.tenantId!}`, 'max')
  return { success: true }
}

export async function toggleBranchStatus(branchId: string, isActive: boolean) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const supabase = createAdminClient()
  await supabase
    .from('branches')
    .update({ is_active: isActive })
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath('/admin/branches')
  revalidatePath(`/admin/branches/${branchId}`)
  revalidateTag(`branches:${ctx.tenantId!}`, 'max')
}
