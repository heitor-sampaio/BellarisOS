'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath, NETWORK_LEVEL_ROLES } from '@/lib/auth'
import { LoginSchema, RegisterSchema } from '@estetica-os/validators'
import type { JwtClaims } from '@estetica-os/types'

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

export async function registerAction(
  _prevState: { error: string } | { needsConfirmation: boolean } | undefined,
  formData: FormData,
) {
  const raw = {
    email:           formData.get('email'),
    password:        formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  }

  const parsed = RegisterSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? 'Dados inválidos'
    return { error: msg }
  }

  const { email, password } = parsed.data
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
  if (signUpError) {
    if (signUpError.message.includes('already registered')) {
      return { error: 'Este e-mail já está cadastrado.' }
    }
    return { error: 'Erro ao criar conta. Tente novamente.' }
  }

  const authUser = signUpData.user
  if (!authUser) return { error: 'Erro ao criar conta. Tente novamente.' }

  // Gera slug único baseado no domínio do e-mail
  const domain      = email.split('@')[1]?.split('.')[0] ?? 'clinica'
  const baseSlug    = toSlug(domain)
  const uniqueSuffix = authUser.id.slice(0, 6)
  const tenantSlug  = `${baseSlug}-${uniqueSuffix}`

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({ name: 'Minha Clínica', slug: tenantSlug, email, plan_status: 'trial' })
    .select('id')
    .single()

  if (tenantError || !tenant) return { error: 'Erro ao configurar conta. Tente novamente.' }

  await admin.from('users').insert({
    auth_id:   authUser.id,
    tenant_id: tenant.id,
    branch_id: null,
    name:      email,
    email:     email,
    role:      'NETWORK_ADMIN',
  })

  await admin.rpc('set_user_claims', {
    p_auth_id:   authUser.id,
    p_tenant_id: tenant.id,
    p_branch_id: null,
    p_role:      'NETWORK_ADMIN',
  })

  // Se o Supabase exigir confirmação de e-mail, a sessão não estará disponível ainda
  if (!signUpData.session) {
    return { needsConfirmation: true }
  }

  redirect('/setup')
}

export async function loginAction(
  _prevState: { error: string } | { redirectTo: string } | undefined,
  formData: FormData,
) {
  const raw = { email: formData.get('email'), password: formData.get('password') }
  const parsed = LoginSchema.safeParse(raw)
  if (!parsed.success) return { error: 'Dados inválidos' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'E-mail ou senha incorretos' }

  // Resolve o destino final diretamente, eliminando a navegação extra para /auth/redirect.
  // Fallback: /auth/redirect (OAuth, links mágicos, erros inesperados).
  let dest = '/auth/redirect'
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const claims = (user.app_metadata ?? {}) as JwtClaims
      const admin  = createAdminClient()

      if (NETWORK_LEVEL_ROLES.includes(claims.role)) {
        dest = getRedirectPath(claims.role, null)
      } else if (claims.branch_id) {
        const { data: br } = await admin.from('branches').select('slug').eq('id', claims.branch_id).single()
        dest = getRedirectPath(claims.role, br?.slug ?? null)
      } else if (claims.client_id) {
        const { data: cl } = await admin.from('clients').select('branch_id').eq('id', claims.client_id).single()
        if (cl?.branch_id) {
          const { data: br } = await admin.from('branches').select('slug').eq('id', cl.branch_id).single()
          if (br?.slug) dest = `/${br.slug}/cliente`
        }
      }
    }
  } catch { /* mantém fallback /auth/redirect */ }

  return { redirectTo: dest }
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function resetPasswordAction(
  _prevState: { error: string } | { success: boolean } | undefined,
  formData: FormData,
) {
  const email = formData.get('email') as string
  if (!email) return { error: 'E-mail obrigatório' }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`,
  })

  if (error) return { error: 'Erro ao enviar e-mail. Tente novamente.' }
  return { success: true }
}
