'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ALL_MODULES } from '@/lib/permissions'
import type { PermissionLevel } from '@estetica-os/types'

const VALID_LEVELS: PermissionLevel[] = ['NONE', 'VIEW', 'MANAGE']

/**
 * Salva a matriz de um único cargo: um nível (NONE/VIEW/MANAGE) por módulo.
 */
export async function saveRolePermissions(
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const roleId = formData.get('roleId') as string
  if (!roleId) return { error: 'Cargo não informado.' }

  const supabase = await createClient()

  // Valida que o cargo pertence à rede
  const { data: role } = await supabase
    .from('tenant_roles')
    .select('is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!role) return { error: 'Cargo não encontrado.' }
  if (role.is_system) return { error: 'Cargos do sistema têm acesso total e não são editáveis.' }

  const rows = ALL_MODULES.map(module => {
    const raw = (formData.get(`level:${module}`) as string) ?? 'NONE'
    const level = (VALID_LEVELS.includes(raw as PermissionLevel) ? raw : 'NONE') as PermissionLevel
    return { tenant_id: ctx.tenantId!, role_id: roleId, module, level }
  })

  const { error } = await supabase
    .from('role_permissions')
    .upsert(rows, { onConflict: 'role_id,module' })

  if (error) return { error: 'Erro ao salvar permissões. Tente novamente.' }

  revalidatePath('/admin/settings')
  revalidateTag(`permissions:${ctx.tenantId!}`, 'max')
  return { success: true }
}
