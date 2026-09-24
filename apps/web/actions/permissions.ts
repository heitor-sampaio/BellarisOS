'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ALL_MODULES, MODULE_LEVELS, isScoped, ALL_REPORT_TABS } from '@/lib/permissions'
import { lerMatrizDoCargo, emitirCargoPermissoesAlteradas } from '@/lib/events/cadastro'
import type { PermissionLevel, PermissionScope } from '@estetica-os/types'
import { ler } from '@/lib/db'

const VALID_SCOPES: PermissionScope[] = ['OWN', 'ALL']

/**
 * Salva a matriz de um único cargo: por módulo, um nível (NONE/VIEW/MANAGE) e,
 * nos módulos escopáveis, o alcance (OWN/ALL).
 */
export async function saveRolePermissions(
  _prev: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'roles', 'MANAGE')

  const roleId = formData.get('roleId') as string
  if (!roleId) return { error: 'Cargo não informado.' }

  const supabase = await createClient()

  // Valida que o cargo pertence à rede
  const role = await ler(supabase
    .from('tenant_roles')
    .select('is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar o cargo')
  if (!role) return { error: 'Cargo não encontrado.' }
  if (role.is_system) return { error: 'Cargos do sistema têm acesso total e não são editáveis.' }

  // A matriz ANTES de ser sobrescrita. Sem ler aqui, o de→para do evento é
  // impossível de reconstruir depois: o upsert abaixo substitui as linhas.
  const antes = await lerMatrizDoCargo(ctx.tenantId!, roleId)

  const rows = ALL_MODULES.map(module => {
    // Cada módulo declara os níveis que distingue: gravar "Ver" num módulo só
    // de MANAGE deixaria o cargo com um acesso que nenhum gate reconhece.
    const raw = (formData.get(`level:${module}`) as string) ?? 'NONE'
    const allowed = MODULE_LEVELS[module]
    const level = (allowed.includes(raw as PermissionLevel) ? raw : 'NONE') as PermissionLevel

    // Módulo não escopável grava sempre ALL: guardar OWN ali seria um valor sem
    // leitor, esperando alguém interpretá-lo como restrição de verdade.
    const rawScope = (formData.get(`scope:${module}`) as string) ?? 'ALL'
    const scope: PermissionScope =
      isScoped(module) && VALID_SCOPES.includes(rawScope as PermissionScope)
        ? (rawScope as PermissionScope)
        : 'ALL'

    return { tenant_id: ctx.tenantId!, role_id: roleId, module, level, scope }
  })

  const { error } = await supabase
    .from('role_permissions')
    .upsert(rows, { onConflict: 'role_id,module' })

  if (error) return { error: 'Erro ao salvar permissões. Tente novamente.' }

  // -- Abas de Relatórios ------------------------------------------------
  // Vêm no mesmo formulário porque são o mesmo gesto: "o que este cargo
  // acessa". Sem nenhuma marcada, o cargo fica sem relatório — e é por isso
  // que o nível de `reports` sozinho não basta (ver `buildContext`).
  const abas = ALL_REPORT_TABS.filter(t => formData.get(`report:${t}`) === 'on')

  // Apaga e regrava: a lista é pequena e assim marcar e desmarcar na mesma
  // salvada não deixa linha órfã de uma aba que saiu.
  const { error: delErro } = await supabase
    .from('role_report_tabs')
    .delete()
    .eq('tenant_id', ctx.tenantId!)
    .eq('role_id', roleId)
  if (delErro) return { error: 'Erro ao salvar as abas de relatórios. Tente novamente.' }

  if (abas.length > 0) {
    const { error: insErro } = await supabase
      .from('role_report_tabs')
      .insert(abas.map(tab => ({ tenant_id: ctx.tenantId!, role_id: roleId, tab })))
    if (insErro) return { error: 'Erro ao salvar as abas de relatórios. Tente novamente.' }
  }

  await emitirCargoPermissoesAlteradas(
    roleId, ctx,
    antes,
    rows.map(r => ({ modulo: r.module, nivel: r.level, escopo: r.scope })),
    abas,
  )

  revalidatePath('/admin/settings')
  revalidateTag(`permissions:${ctx.tenantId!}`, 'max')
  return { success: true }
}
