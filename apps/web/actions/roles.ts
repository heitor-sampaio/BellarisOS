'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function toKey(label: string): string {
  return label
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export async function createRole(
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const label = (formData.get('label') as string)?.trim()
  if (!label || label.length < 2) return { error: 'Nome do cargo deve ter pelo menos 2 caracteres.' }

  const key = toKey(label)
  if (!key) return { error: 'Nome inválido.' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('tenant_roles')
    .insert({ tenant_id: ctx.tenantId!, key, label, is_system: false })

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um cargo com esse nome.' }
    return { error: 'Erro ao criar cargo. Tente novamente.' }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}

export async function deleteRole(roleId: string) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const supabase = await createClient()

  // Busca o key do cargo antes de deletar para limpar role_permissions
  const { data: role } = await supabase
    .from('tenant_roles')
    .select('key, is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  if (!role) return
  if (role.is_system) return // proteção extra além da RLS

  // Remove as permissões associadas ao cargo
  await supabase
    .from('role_permissions')
    .delete()
    .eq('tenant_id', ctx.tenantId!)
    .eq('role', role.key)

  // Remove o cargo
  await supabase
    .from('tenant_roles')
    .delete()
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath('/admin/settings')
}
