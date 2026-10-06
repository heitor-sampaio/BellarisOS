import 'server-only'
import { redirect } from 'next/navigation'
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType, User } from '@supabase/supabase-js'
import { LoginSchema, ResetPasswordSchema, UpdatePasswordSchema } from '@estetica-os/validators'
import { createClient } from '../supabase/server'
import { caminhoInterno, urlPublica } from '../origem'
import { recusaDoHost, type HostDaPlataforma } from './destino'

/**
 * O ACESSO da equipe da plataforma — o mesmo nos dois apps (sistema e
 * suporte); cada app o amarra às próprias actions (`actions/acesso.ts`).
 *
 * O login recusa quem não é do host ANTES de qualquer tela: sem a marca da
 * plataforma (membro de rede, cliente final) ou SUPORTE no sistema, a sessão
 * recém-aberta é desfeita (`signOut` local) e a pessoa fica no login com o
 * motivo. Depois vai ao painel; se a verificação em duas etapas estiver
 * pendente (`verificacao-exigida.ts`), o painel manda para `/verificacao`.
 */
export type EstadoDoLogin = { error: string } | { redirectTo: string } | undefined
export type EstadoDoPedido = { error: string } | { success: true } | undefined

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function entrarNaPlataforma(
  host: HostDaPlataforma,
  formData: FormData,
  /** Antes de conferir a marca: o sistema promove o primeiro admin aqui. */
  antes?: (usuario: User, supabase: Supabase) => Promise<void>,
): Promise<EstadoDoLogin> {
  const parsed = LoginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) return { error: 'Dados inválidos' }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'E-mail ou senha incorretos' }

  let { data: { user } } = await supabase.auth.getUser()
  if (user && antes) {
    await antes(user, supabase)
    ;({ data: { user } } = await supabase.auth.getUser())
  }
  const recusa = recusaDoHost(host, (user?.app_metadata as { plataforma?: string } | undefined)?.plataforma)
  if (recusa) {
    await supabase.auth.signOut({ scope: 'local' })
    return { error: recusa }
  }
  return { redirectTo: '/' }
}

export async function sairDaPlataforma(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}

/**
 * "Esqueci minha senha" no host da plataforma: o link volta por
 * `${origem}/auth/confirm`, que abre a sessão neste MESMO host (cookie é do
 * host). `antes` é do sistema: cria a conta do primeiro admin.
 */
export async function pedirNovaSenhaNaPlataforma(
  formData: FormData,
  origem: string,
  antes?: (email: string) => Promise<void>,
): Promise<EstadoDoPedido> {
  const parsed = ResetPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'E-mail inválido' }
  if (antes) {
    try { await antes(parsed.data.email) } catch (e) { console.error('[plataforma] pedir nova senha:', (e as Error).message) }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origem}/auth/confirm?next=/update-password`,
  })
  if (error) return { error: 'Erro ao enviar e-mail. Tente novamente.' }
  return { success: true }
}

export async function trocarSenhaNaPlataforma(formData: FormData): Promise<EstadoDoLogin> {
  const parsed = UpdatePasswordSchema.safeParse({
    password: formData.get('password'), confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dados inválidos' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'O link expirou ou já foi usado. Peça um novo.' }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (/different from the old/i.test(error.message)) return { error: 'A nova senha precisa ser diferente da atual.' }
    return { error: 'Não consegui trocar a senha. Tente novamente.' }
  }
  return { redirectTo: '/' }
}

/**
 * A volta de um link de e-mail do Supabase (`/auth/confirm` de cada app):
 * troca o código ou o token_hash por sessão e segue para `next` (só caminho
 * interno). Igual à da clínica (`apps/web/app/auth/confirm`).
 */
export async function confirmarLinkDeEmail(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = caminhoInterno(url.searchParams.get('next'))

  const supabase = await createClient()
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('link sem código') }
  if (error) {
    const volta = urlPublica(req, next === '/update-password' ? '/update-password' : '/login')
    volta.searchParams.set('erro', 'link')
    return NextResponse.redirect(volta)
  }
  return NextResponse.redirect(urlPublica(req, next))
}
