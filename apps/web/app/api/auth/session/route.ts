import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Recebe tokens do armazenamento nativo (Capacitor Preferences),
// valida com Supabase e grava cookies de sessão para o SSR funcionar.
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

  return NextResponse.json({ ok: true })
}
