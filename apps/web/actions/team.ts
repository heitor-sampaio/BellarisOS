'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// Resolve a abrangência (branch_id) de um membro a partir do form.
// Apenas NETWORK_ADMIN pode criar membros de rede (branch_id null); gerentes de
// filial ficam restritos à própria filial.
function resolveScope(
  ctx: { isNetworkAdmin: boolean; branchId: string | null },
  scope: string | null,
  branchId: string | null,
): { branchId: string | null } | { error: string } {
  if (scope === 'network') {
    if (!ctx.isNetworkAdmin) return { error: 'Apenas o admin da rede pode criar membros de rede.' }
    return { branchId: null }
  }
  // Filial
  if (ctx.isNetworkAdmin) {
    if (!branchId) return { error: 'Selecione a filial.' }
    return { branchId }
  }
  // Gerente de filial só cria na própria filial
  return { branchId: ctx.branchId }
}

async function assertRoleInTenant(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  roleId: string,
): Promise<{ error: string } | { ok: true }> {
  const { data: role } = await admin
    .from('tenant_roles')
    .select('is_system')
    .eq('id', roleId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!role) return { error: 'Cargo inválido.' }
  if (role.is_system) return { error: 'Esse cargo não pode ser atribuído pela equipe.' }
  return { ok: true }
}

export async function createTeamMember(
  _prevState: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')

  const name             = (formData.get('name') as string)?.trim()
  const email            = (formData.get('email') as string)?.trim().toLowerCase()
  const roleId           = formData.get('roleId') as string
  const password         = formData.get('password') as string
  const scope            = formData.get('scope') as string | null
  const branchId         = formData.get('branchId') as string | null
  const providesServices = formData.get('providesServices') === 'on'
  const redirectPath     = (formData.get('redirectPath') as string) ?? '/admin/team'

  if (!name || !email || !roleId || !password) return { error: 'Preencha todos os campos.' }
  if (password.length < 8) return { error: 'A senha deve ter pelo menos 8 caracteres.' }

  const admin = createAdminClient()

  const roleCheck = await assertRoleInTenant(admin, ctx.tenantId!, roleId)
  if ('error' in roleCheck) return roleCheck

  const scoped = resolveScope(ctx, scope, branchId)
  if ('error' in scoped) return scoped
  const effectiveBranchId = scoped.branchId

  // 1. Criar usuário no Supabase Auth (exige service role)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError || !authData.user) {
    if (authError?.message?.includes('already registered')) {
      return { error: 'Esse e-mail já está cadastrado.' }
    }
    return { error: 'Erro ao criar usuário. Tente novamente.' }
  }

  const authId = authData.user.id

  // 2. Setar claims no JWT (role derivado do cargo; abrangência = branch_id)
  await admin.rpc('set_user_claims', {
    p_auth_id:   authId,
    p_tenant_id: ctx.tenantId!,
    p_branch_id: effectiveBranchId,
    p_role_id:   roleId,
  })

  // 3. Inserir na tabela users
  const { error: insertError } = await admin.from('users').insert({
    auth_id:           authId,
    tenant_id:         ctx.tenantId!,
    branch_id:         effectiveBranchId,
    name,
    email,
    role_id:           roleId,
    provides_services: providesServices,
  })

  if (insertError) {
    await admin.auth.admin.deleteUser(authId)
    return { error: 'Erro ao salvar membro. Tente novamente.' }
  }

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, 'max')
  revalidateTag(`user:${authId}`, 'max')
  return { success: true }
}

export async function updateTeamMember(
  _prevState: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')

  const userId           = formData.get('userId') as string
  const roleId           = formData.get('roleId') as string
  const scope            = formData.get('scope') as string | null
  const branchId         = formData.get('branchId') as string | null
  const providesServices = formData.get('providesServices') === 'on'
  const redirectPath     = (formData.get('redirectPath') as string) ?? '/admin/team'

  if (!userId || !roleId) return { error: 'Dados incompletos.' }

  const admin = createAdminClient()

  const roleCheck = await assertRoleInTenant(admin, ctx.tenantId!, roleId)
  if ('error' in roleCheck) return roleCheck

  const scoped = resolveScope(ctx, scope, branchId)
  if ('error' in scoped) return scoped
  const effectiveBranchId = scoped.branchId

  const { data: member } = await admin
    .from('users')
    .select('auth_id')
    .eq('id', userId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (!member) return { error: 'Membro não encontrado.' }

  const { error } = await admin
    .from('users')
    .update({ role_id: roleId, branch_id: effectiveBranchId, provides_services: providesServices, role: null })
    .eq('id', userId)
    .eq('tenant_id', ctx.tenantId!)
  if (error) return { error: 'Erro ao atualizar membro.' }

  // Reemite claims para refletir novo cargo/abrangência (vale no próximo refresh do token)
  await admin.rpc('set_user_claims', {
    p_auth_id:   member.auth_id,
    p_tenant_id: ctx.tenantId!,
    p_branch_id: effectiveBranchId,
    p_role_id:   roleId,
  })

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, 'max')
  revalidateTag(`user:${member.auth_id}`, 'max')
  return { success: true }
}

export async function deactivateTeamMember(userId: string, redirectPath: string = '/admin/team') {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')

  const admin = createAdminClient()
  await admin.from('users').update({ is_active: false }).eq('id', userId).eq('tenant_id', ctx.tenantId!)

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, 'max')
}

export async function reactivateTeamMember(userId: string, redirectPath: string = '/admin/team') {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'team', 'MANAGE')

  const admin = createAdminClient()
  await admin.from('users').update({ is_active: true }).eq('id', userId).eq('tenant_id', ctx.tenantId!)

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, 'max')
}
