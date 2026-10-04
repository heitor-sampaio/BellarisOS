'use server'
import { emSessaoDeSuporte } from '@/lib/suporte/sessao'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath } from '@/lib/auth'
import { LoginSchema, RegisterSchema, ResetPasswordSchema, UpdatePasswordSchema } from '@estetica-os/validators'
import type { JwtClaims } from '@estetica-os/types'
import { ler } from '@/lib/db'
import { bonusDePrimeiroAcesso } from '@/lib/fidelidade/bonus'
import { semearRede, fimDoTesteParaHoje } from '@/lib/redes/criar'
import { promoverSeForOAdmin, criarContaDoPrimeiroAdmin } from '@/lib/plataforma/primeiro-admin'

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

  // A rede nasce pelo MESMO caminho do "Nova rede" do /sistema
  // (lib/redes/criar.ts), em teste pelos dias da configuração da plataforma.
  const rede = await semearRede({
    authId: authUser.id, email, nomeDoResponsavel: email, nomeDaRede: 'Minha Clínica',
    slugBase: email.split('@')[1]?.split('.')[0] ?? 'clinica',
    planStatus: 'trial', trialEndsAt: await fimDoTesteParaHoje(),
  })
  if (!rede.ok) return { error: 'Erro ao configurar conta. Tente novamente.' }

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

  // O primeiro admin da plataforma (PLATAFORMA_ADMIN_EMAIL): promovido no
  // login, e a sessão renovada para o token já vir com a marca.
  if (user) {
    try {
      if (await promoverSeForOAdmin(user) === 'promovido') await supabase.auth.refreshSession()
    } catch (e) {
      console.error('[loginAction] primeiro admin:', (e as Error).message)
    }
  }

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
      // A plataforma vai para o /suporte, que pede a verificação em duas etapas.
      if ((claims as { plataforma?: string }).plataforma) return '/suporte/verificacao'
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
  // Na sessão de SUPORTE, "sair" é sair da conta do membro e voltar ao painel.
  if (await emSessaoDeSuporte()) redirect('/auth/suporte-fim')
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

  // O primeiro admin da plataforma ainda sem conta: nasce aqui, já marcado, e
  // o e-mail de definir senha sai logo abaixo como para qualquer um.
  try { await criarContaDoPrimeiroAdmin(parsed.data.email) } catch (e) {
    console.error('[resetPasswordAction] primeiro admin:', (e as Error).message)
  }

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

  // A senha do membro não muda pelo suporte (o banco também barra).
  if (await emSessaoDeSuporte()) return { error: 'No modo suporte, a senha desta conta não muda.' }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    // A mensagem do Auth é em inglês; a mais comum é repetir a senha atual.
    if (/different from the old/i.test(error.message)) return { error: 'A nova senha precisa ser diferente da atual.' }
    return { error: 'Não consegui trocar a senha. Tente novamente.' }
  }

  return { redirectTo: await destinoDaSessao(supabase) }
}
