import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { opcoesDoCookieDeSessao } from '@/lib/supabase/cookie-de-sessao'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath } from '@/lib/auth'
import type { JwtClaims } from '@estetica-os/types'
import { ler } from '@/lib/db'
import { promoverSeForOAdmin } from '@/lib/plataforma/primeiro-admin'
import { bonusDePrimeiroAcesso } from '@/lib/fidelidade/bonus'

// Troca um par de tokens por cookies de sessão (httpOnly) e devolve o destino.
// Era a volta do espelho nativo do app (saiu em 2026-10-06); hoje serve ao
// apoio do E2E, que abre a sessão de cada pessoa por aqui.
//
// `/api/*` é público no proxy: a rota se defende sozinha contra o LOGIN CSRF
// (outro site plantando a sessão DELE no navegador da vítima, que passaria a
// trabalhar na conta do atacante). Só JSON — um <form> de outro site não manda
// application/json — e nada que o navegador marque como vindo de fora.
export async function POST(req: NextRequest) {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'Só JSON' }, { status: 415 })
  }
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.json({ error: 'Pedido de outro site' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const { access_token, refresh_token } = (body ?? {}) as Record<string, string>

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400 })
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, opcoesDoCookieDeSessao(value, options))
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })

  if (error || !data.session) {
    return NextResponse.json({ error: 'Invalid or expired tokens' }, { status: 401 })
  }

  // Computa o destino final usando as claims do JWT (sem DB extras para roles de rede).
  // Para roles com branchId/clientId, uma query mínima busca o slug da filial.
  // O primeiro admin da plataforma (PLATAFORMA_ADMIN_EMAIL) também pelo app.
  let usuario = data.session.user
  try {
    if (await promoverSeForOAdmin(usuario) === 'promovido') {
      const { data: renovada } = await supabase.auth.refreshSession()
      if (renovada.user) usuario = renovada.user
    }
  } catch (e) {
    console.error('[api/auth/session] primeiro admin:', (e as Error).message)
  }

  const claims = usuario.app_metadata as JwtClaims
  const admin  = createAdminClient()

  // Primeiro acesso do cliente pelo app: a mesma marca (e o bônus opcional) do
  // login pela tela. Idempotente — só o primeiro conta.
  if (claims.client_id) await bonusDePrimeiroAcesso(claims.client_id)

  let redirectTo = '/auth/redirect'  // fallback seguro
  // A plataforma vai para o /suporte, que pede a verificação em duas etapas.
  if ((claims as { plataforma?: string }).plataforma) return NextResponse.json({ redirectTo: '/suporte/verificacao' })
  try {
    if (claims.client_id) {
      const cl = await ler(admin
        .from('clients').select('branch_id').eq('id', claims.client_id).single(), 'buscar o cliente')
      if (cl?.branch_id) {
        const br = await ler(admin
          .from('branches').select('slug').eq('id', cl.branch_id).single(), 'buscar a unidade')
        if (br?.slug) redirectTo = `/${br.slug}/cliente`
      }
    } else if (claims.branch_id) {
      const br = await ler(admin
        .from('branches').select('slug').eq('id', claims.branch_id).single(), 'buscar a unidade')
      redirectTo = getRedirectPath(claims.role, br?.slug ?? null)
    } else {
      redirectTo = getRedirectPath(claims.role, null)
    }
  } catch { /* mantém fallback */ }

  return NextResponse.json({ redirectTo })
}
