'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
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
  _prev: { error: string } | { success: boolean; role?: { id: string; key: string; label: string } } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const label = (formData.get('label') as string)?.trim()
  if (!label || label.length < 2) return { error: 'Nome do cargo deve ter pelo menos 2 caracteres.' }

  const key = toKey(label)
  if (!key) return { error: 'Nome inválido.' }
  if (key === 'NETWORK_ADMIN' || key === 'CLIENT') return { error: 'Esse nome é reservado.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tenant_roles')
    .insert({ tenant_id: ctx.tenantId!, key, label, is_system: false })
    .select('id, key, label')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um cargo com esse nome.' }
    return { error: 'Erro ao criar cargo. Tente novamente.' }
  }

  revalidatePath('/admin/settings')
  return { success: true, role: data }
}

export async function updateRole(
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const roleId = formData.get('roleId') as string
  const label  = (formData.get('label') as string)?.trim()
  if (!roleId || !label || label.length < 2) return { error: 'Nome inválido.' }

  const supabase = await createClient()

  // Não permite renomear cargo de sistema
  const { data: role } = await supabase
    .from('tenant_roles')
    .select('is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!role) return { error: 'Cargo não encontrado.' }
  if (role.is_system) return { error: 'Cargos do sistema não podem ser renomeados.' }

  const { error } = await supabase
    .from('tenant_roles')
    .update({ label })
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { error: 'Erro ao renomear cargo.' }

  revalidatePath('/admin/settings')
  return { success: true }
}

export async function deleteRole(roleId: string): Promise<{ error: string } | { success: true }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const supabase = await createClient()

  const { data: role } = await supabase
    .from('tenant_roles')
    .select('key, is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  if (!role) return { error: 'Cargo não encontrado.' }
  if (role.is_system) return { error: 'Cargos do sistema não podem ser excluídos.' }

  // Impede excluir cargo em uso (evita órfão em users.role_id)
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId!)
    .eq('role_id', roleId)

  if ((count ?? 0) > 0) {
    return { error: 'Há membros com esse cargo. Reatribua-os antes de excluir.' }
  }

  // Remove as permissões associadas e o cargo
  await supabase.from('role_permissions').delete().eq('tenant_id', ctx.tenantId!).eq('role', role.key)
  await supabase.from('tenant_roles').delete().eq('id', roleId).eq('tenant_id', ctx.tenantId!)

  revalidatePath('/admin/settings')
  return { success: true }
}
