'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath } from '@/lib/auth'
import { LoginSchema, RegisterSchema, ResetPasswordSchema, UpdatePasswordSchema } from '@estetica-os/validators'
import type { JwtClaims } from '@estetica-os/types'
import { gravar, ler, tentar } from '@/lib/db'
import { bonusDePrimeiroAcesso } from '@/lib/fidelidade/bonus'

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
  // Com confirmação de e-mail ligada, o Supabase NÃO devolve erro para e-mail
  // já cadastrado: devolve um usuário disfarçado, sem identidades e com id
  // fictício (para não revelar quem tem conta). Seguir adiante criava uma rede
  // "Minha Clínica" órfã a cada tentativa e gravava acesso para um id que não
  // existe.
  if (!authUser.identities?.length) return { error: 'Este e-mail já está cadastrado.' }

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

  // Rede, membro e acesso valem JUNTOS: se um falhar, a rede recém-criada sai,
  // senão sobra uma clínica vazia que ninguém consegue abrir.
  try {
    // O cargo-sistema NETWORK_ADMIN é semeado pela trigger after-insert em tenants.
    const adminRole = await ler(admin
      .from('tenant_roles')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('key', 'NETWORK_ADMIN')
      .single(), 'buscar o cargo de administrador')

    await gravar(admin.from('users').insert({
      auth_id:   authUser.id,
      tenant_id: tenant.id,
      branch_id: null,
      name:      email,
      email:     email,
      role_id:   adminRole?.id ?? null,
    }), 'criar o usuário da rede')

    // Sem as claims o login entra sem rede no JWT, e a RLS inteira depende delas.
    await gravar(admin.rpc('set_user_claims', {
      p_auth_id:   authUser.id,
      p_tenant_id: tenant.id,
      p_branch_id: null,
      p_role_id:   adminRole?.id ?? null,
    }), 'gravar o acesso do usuário')
  } catch (e) {
    console.error('[registerAction]', (e as Error).message)
    await tentar(admin.from('users').delete().eq('tenant_id', tenant.id), 'desfazer o membro do cadastro')
    await tentar(admin.from('tenants').delete().eq('id', tenant.id), 'desfazer a rede do cadastro')
    return { error: 'Erro ao configurar conta. Tente novamente.' }
  }

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

  // Cliente final: o primeiro login marca o primeiro acesso e, se a rede
  // configurou, dá o bônus. Acessório — nunca impede a entrada.
  const { data: { user } } = await supabase.auth.getUser()
  const clienteId = (user?.app_metadata as JwtClaims | undefined)?.client_id
  if (clienteId) await bonusDePrimeiroAcesso(clienteId)

  return { redirectTo: await destinoDaSessao(supabase) }
}

/**
 * Para onde a pessoa da sessão vai: o portal dela. Resolve direto, sem a
 * navegação extra por /auth/redirect — que fica de reserva (OAuth, links
 * mágicos, erro inesperado).
 */
async function destinoDaSessao(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  let dest = '/auth/redirect'
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const claims = (user.app_metadata ?? {}) as JwtClaims
      const admin  = createAdminClient()

      if (claims.client_id) {
        const cl = await ler(admin.from('clients').select('branch_id').eq('id', claims.client_id).single(), 'buscar o cliente')
        if (cl?.branch_id) {
          const br = await ler(admin.from('branches').select('slug').eq('id', cl.branch_id).single(), 'buscar a unidade')
          if (br?.slug) dest = `/${br.slug}/cliente`
        }
      } else if (claims.branch_id) {
        const br = await ler(admin.from('branches').select('slug').eq('id', claims.branch_id).single(), 'buscar a unidade')
        dest = getRedirectPath(claims.role, br?.slug ?? null)
      } else {
        dest = getRedirectPath(claims.role, null)
      }
    }
  } catch { /* mantém fallback /auth/redirect */ }

  return dest
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
  const parsed = ResetPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'E-mail inválido' }

  const supabase = await createClient()
  // O link volta por /auth/confirm, que troca o código por sessão e segue para
  // a tela da nova senha. Até 2026-09-28 apontava para /auth/update-password,
  // que não existia: todo "esqueci minha senha" terminava num 404.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/update-password`,
  })

  if (error) return { error: 'Erro ao enviar e-mail. Tente novamente.' }
  return { success: true }
}

/**
 * A nova senha, com a sessão que o link de recuperação abriu (/auth/confirm).
 * Sem essa sessão o link já expirou ou foi usado — e não há o que trocar.
 */
export async function updatePasswordAction(
  _prevState: { error: string } | { redirectTo: string } | undefined,
  formData: FormData,
) {
  const parsed = UpdatePasswordSchema.safeParse({
    password:        formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'O link expirou ou já foi usado. Peça um novo.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    // A mensagem do Auth é em inglês; a mais comum é repetir a senha atual.
    if (/different from the old/i.test(error.message)) return { error: 'A nova senha precisa ser diferente da atual.' }
    return { error: 'Não consegui trocar a senha. Tente novamente.' }
  }

  return { redirectTo: await destinoDaSessao(supabase) }
}
