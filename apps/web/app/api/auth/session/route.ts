import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath } from '@/lib/auth'
import type { JwtClaims } from '@estetica-os/types'

// Recebe tokens do armazenamento nativo (Capacitor Preferences),
// valida com Supabase, grava cookies de sessão e retorna o destino
// final para evitar um bounce extra via /auth/redirect.
export async function POST(req: NextRequest) {
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
            cookieStore.set(name, value, { ...options, maxAge: 60 * 60 * 24 * 7 })
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
  const claims = data.session.user.app_metadata as JwtClaims
  const admin  = createAdminClient()

  let redirectTo = '/auth/redirect'  // fallback seguro
  try {
    if (claims.client_id) {
      const { data: cl } = await admin
        .from('clients').select('branch_id').eq('id', claims.client_id).single()
      if (cl?.branch_id) {
        const { data: br } = await admin
          .from('branches').select('slug').eq('id', cl.branch_id).single()
        if (br?.slug) redirectTo = `/${br.slug}/cliente`
      }
    } else if (claims.branch_id) {
      const { data: br } = await admin
        .from('branches').select('slug').eq('id', claims.branch_id).single()
      redirectTo = getRedirectPath(claims.role, br?.slug ?? null)
    } else {
      redirectTo = getRedirectPath(claims.role, null)
    }
  } catch { /* mantém fallback */ }

  return NextResponse.json({ redirectTo })
}
