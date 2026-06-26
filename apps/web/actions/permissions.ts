'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ALL_MODULES } from '@/lib/permissions'

export async function saveRolePermissions(
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  // A lista de role keys é enviada como campo oculto pelo form
  const rolesJson = formData.get('_roles') as string
  const roleKeys: string[] = JSON.parse(rolesJson ?? '[]')

  if (!roleKeys.length) return { error: 'Nenhum cargo encontrado.' }

  const rows = roleKeys.flatMap(role =>
    ALL_MODULES.map(module => {
      const can_write = formData.get(`${role}:${module}:write`) === 'on'
      const can_view  = can_write || formData.get(`${role}:${module}:view`) === 'on'
      return { tenant_id: ctx.tenantId!, role, module, can_view, can_write }
    })
  )

  const supabase = await createClient()
  const { error } = await supabase
    .from('role_permissions')
    .upsert(rows, { onConflict: 'tenant_id,role,module' })

  if (error) return { error: 'Erro ao salvar permissões. Tente novamente.' }

  revalidatePath('/admin/settings')
  return { success: true }
}
