'use server'

import { getTenantContext, assertPermission } from '@/lib/auth'
import { recusaDaConfigDaRede } from '@/lib/configuracao-da-rede'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, contar } from '@/lib/db'
import { revalidatePath, revalidateTag } from 'next/cache'
import { nomeDaCopia } from '@/lib/cargos/duplicar'
import { cargosAcimaDoMeu, recusaDoCargoAcima } from '@/lib/equipe/cargo-acima'
import { souAdminDaRede } from '@/lib/equipe/admin-da-rede'
import { lerMatrizDoCargo, emitirCargoPermissoesAlteradas } from '@/lib/events/cadastro'
import { lerCaixas } from '@/lib/inbox/visibilidade'

// Os cargos gravam pelo cliente de serviço, depois da trava (F63): a sessão
// só lê a matriz — pela chave pública, quem é da rede se dava Gerenciar.
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
  assertPermission(ctx, 'roles', 'MANAGE')
  // O cargo é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const travado = bloqueioDoSuporte(ctx, 'criar cargo')
  if (travado) return { error: travado }

  const label = (formData.get('label') as string)?.trim()
  if (!label || label.length < 2) return { error: 'Nome do cargo deve ter pelo menos 2 caracteres.' }

  const key = toKey(label)
  if (!key) return { error: 'Nome inválido.' }
  if (key === 'NETWORK_ADMIN' || key === 'CLIENT') return { error: 'Esse nome é reservado.' }

  const supabase = createAdminClient()

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
  assertPermission(ctx, 'roles', 'MANAGE')
  // O cargo é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const travado = bloqueioDoSuporte(ctx, 'mudar as permissões de um cargo')
  if (travado) return { error: travado }

  const roleId = formData.get('roleId') as string
  const label  = (formData.get('label') as string)?.trim()
  if (!roleId || !label || label.length < 2) return { error: 'Nome inválido.' }

  const supabase = createAdminClient()

  // Não permite renomear cargo de sistema
  const role = await ler(supabase
    .from('tenant_roles')
    .select('is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar o cargo')
  if (!role) return { error: 'Cargo não encontrado.' }
  if (role.is_system) return { error: 'Cargos do sistema não podem ser renomeados.' }

  // `.select().single()`: sem policy de UPDATE a gravação atingia zero linhas
  // sem erro, e a tela dizia "renomeado" com o nome antigo lá. Conferir a
  // linha devolvida é o que faz esse silêncio virar erro.
  const { error } = await supabase
    .from('tenant_roles')
    .update({ label })
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um cargo com esse nome.' }
    return { error: 'Erro ao renomear cargo.' }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}

export async function deleteRole(roleId: string): Promise<{ error: string } | { success: true }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'roles', 'MANAGE')
  // O cargo é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const travado = bloqueioDoSuporte(ctx, 'excluir cargo')
  if (travado) return { error: travado }

  const supabase = createAdminClient()

  const role = await ler(supabase
    .from('tenant_roles')
    .select('is_system')
    .eq('id', roleId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar o cargo')

  if (!role) return { error: 'Cargo não encontrado.' }
  if (role.is_system) return { error: 'Cargos do sistema não podem ser excluídos.' }

  // Impede excluir cargo em uso (evita órfão em users.role_id). Contagem que
  // falha não pode virar "ninguém usa" — é ela que protege os membros.
  const emUso = await contar(supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId!)
    .eq('role_id', roleId), 'contar os membros com o cargo')

  if (emUso > 0) {
    return { error: 'Há membros com esse cargo. Reatribua-os antes de excluir.' }
  }

  // Remove as permissões associadas e o cargo (role_permissions cascateia por FK)
  await gravar(supabase.from('role_permissions').delete().eq('tenant_id', ctx.tenantId!).eq('role_id', roleId), 'apagar as permissões do cargo')
  await gravar(supabase.from('tenant_roles').delete().eq('id', roleId).eq('tenant_id', ctx.tenantId!), 'apagar o cargo')

  revalidatePath('/admin/settings')
  return { success: true }
}

/**
 * "Duplicar" o cargo (A15 da 15ª simulação, 2026-11-17): "Cópia de X" com a
 * matriz, as abas de Relatórios e as caixas do inbox do original. É criar um
 * cargo: valem as travas do `createRole` (Cargos em Gerenciar, a rede toda —
 * H7 —, o suporte) e a do cargo acima (H7, F70): quem não é a Admin da rede não
 * copia um cargo com módulo que ela não tem. O cargo de sistema não se
 * duplica (o "Admin da rede" é um só).
 */
export async function duplicarCargo(roleId: string): Promise<{ error: string } | { success: true; role: { id: string; key: string; label: string } }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'roles', 'MANAGE')
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const travado = bloqueioDoSuporte(ctx, 'criar cargo')
  if (travado) return { error: travado }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleId)) return { error: 'Cargo não encontrado.' }

  const supabase = createAdminClient()
  const [original, todos] = await Promise.all([
    ler(supabase.from('tenant_roles').select('id, label, is_system, inbox_caixas')
      .eq('id', roleId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cargo') as Promise<
        { id: string; label: string; is_system: boolean; inbox_caixas: string | null } | null>,
    ler(supabase.from('tenant_roles').select('label').eq('tenant_id', ctx.tenantId!), 'ler os cargos da rede') as Promise<{ label: string }[] | null>,
  ])
  if (!original) return { error: 'Cargo não encontrado.' }
  if (original.is_system) return { error: 'Cargos do sistema não se duplicam.' }

  const acima = await cargosAcimaDoMeu(supabase, ctx, [roleId], await souAdminDaRede(supabase, ctx))
  const aMais = acima.get(roleId)
  if (aMais) return { error: recusaDoCargoAcima(original.label, aMais) }

  const [matriz, abas] = await Promise.all([
    lerMatrizDoCargo(ctx.tenantId!, roleId),
    ler(supabase.from('role_report_tabs').select('tab').eq('tenant_id', ctx.tenantId!).eq('role_id', roleId),
      'ler as abas de relatórios do cargo') as Promise<{ tab: string }[] | null>,
  ])

  const label = nomeDaCopia(original.label, (todos ?? []).map(r => r.label))
  const { data: novo, error } = await supabase
    .from('tenant_roles')
    .insert({ tenant_id: ctx.tenantId!, key: toKey(label), label, is_system: false })
    .select('id, key, label')
    .single()
  if (error || !novo) {
    if (error?.code === '23505') return { error: 'Já existe um cargo com esse nome.' }
    return { error: 'Erro ao duplicar o cargo. Tente novamente.' }
  }

  // A matriz, as caixas e as abas numa transação (a mesma do salvar, C60/F70).
  const linhas = matriz.map(l => ({ module: l.modulo, level: l.nivel, scope: l.escopo }))
  const relatorios = (abas ?? []).map(a => a.tab)
  const { error: erroDaMatriz } = await supabase.rpc('salvar_matriz_do_cargo', {
    p_tenant: ctx.tenantId!, p_role: novo.id,
    p_linhas: linhas, p_caixas: lerCaixas(original.inbox_caixas), p_abas: relatorios,
  })
  if (erroDaMatriz) {
    console.error('[duplicarCargo]', erroDaMatriz.message)
    // O cargo sem a matriz não fica: seria um "Cópia de X" que não abre nada.
    await gravar(supabase.from('tenant_roles').delete().eq('id', novo.id).eq('tenant_id', ctx.tenantId!), 'desfazer o cargo duplicado')
    return { error: 'Erro ao copiar as permissões do cargo. Tente novamente.' }
  }
  await emitirCargoPermissoesAlteradas(novo.id, ctx, [], matriz, relatorios)

  revalidatePath('/admin/settings')
  revalidateTag(`permissions:${ctx.tenantId!}`, { expire: 0 })
  return { success: true, role: novo }
}
