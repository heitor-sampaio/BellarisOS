'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ROLES = ['BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL', 'COMERCIAL', 'GERENTE_COMERCIAL'] as const
type AssignableRole = typeof ALLOWED_ROLES[number]

// Cargos de nível-rede criáveis pela UI: sem filial (branch_id = null, igual ao claim do JWT)
// e restritos ao NETWORK_ADMIN.
const NETWORK_ASSIGNABLE_ROLES: readonly string[] = ['COMERCIAL', 'GERENTE_COMERCIAL']

export async function createTeamMember(
  _prevState: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

  const name         = (formData.get('name') as string)?.trim()
  const email        = (formData.get('email') as string)?.trim().toLowerCase()
  const role         = formData.get('role') as string
  const password     = formData.get('password') as string
  const branchId     = formData.get('branchId') as string
  const redirectPath = (formData.get('redirectPath') as string) ?? '/admin/team'

  const isNetworkRole = NETWORK_ASSIGNABLE_ROLES.includes(role)

  if (!name || !email || !role || !password || (!branchId && !isNetworkRole)) {
    return { error: 'Preencha todos os campos.' }
  }
  if (password.length < 8) {
    return { error: 'A senha deve ter pelo menos 8 caracteres.' }
  }
  if (!ALLOWED_ROLES.includes(role as AssignableRole)) {
    return { error: 'Cargo inválido.' }
  }
  if (ctx.role === 'BRANCH_ADMIN' && role === 'BRANCH_ADMIN') {
    return { error: 'Sem permissão para criar outro gerente.' }
  }
  // Cargos de rede (comercial) só o admin da rede cria — não têm filial.
  if (isNetworkRole && ctx.role !== 'NETWORK_ADMIN') {
    return { error: 'Apenas o admin da rede pode criar esse cargo.' }
  }

  const supabase = createAdminClient()

  // 1. Criar usuário no Supabase Auth (exige service role)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
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

  // branch_id null para cargos de rede — mantém users.branch_id coerente com o claim do JWT
  const effectiveBranchId = isNetworkRole ? null : branchId

  // 2. Setar claims no JWT
  await supabase.rpc('set_user_claims', {
    p_auth_id: authId,
    p_tenant_id: ctx.tenantId!,
    p_branch_id: effectiveBranchId,
    p_role: role,
  })

  // 3. Inserir na tabela users
  const { error: insertError } = await supabase.from('users').insert({
    auth_id: authId,
    tenant_id: ctx.tenantId!,
    branch_id: effectiveBranchId,
    name,
    email,
    role,
  })

  if (insertError) {
    await supabase.auth.admin.deleteUser(authId)
    return { error: 'Erro ao salvar membro. Tente novamente.' }
  }

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, 'max')
  revalidateTag(`user:${authId}`, 'max')  // limpa mapa auth_id→users.id (getTenantContext)
  return { success: true }
}

export async function deactivateTeamMember(userId: string, redirectPath: string = '/admin/team') {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

  const supabase = createAdminClient()
  await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', userId)
    .eq('tenant_id', ctx.tenantId!)

  revalidatePath(redirectPath)
  revalidateTag(`professionals:${ctx.tenantId!}`, 'max')
}
