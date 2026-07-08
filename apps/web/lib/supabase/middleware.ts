import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function updateSession(request: NextRequest) {
  try {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, { ...options, maxAge: 60 * 60 * 24 * 7 })
            )
          },
        },
      }
    )

    // getClaims() valida o JWT localmente (ES256/WebCrypto) — sem round-trip ao
    // servidor de Auth em toda request. Quando o access token expira, o
    // getSession() interno renova via refresh token (7 dias) e o setAll acima
    // grava os novos cookies. Substitui o antigo getUser() (rede por request).
    const { data: claimsData } = await supabase.auth.getClaims()
    const user = claimsData?.claims ?? null

    const pathname = request.nextUrl.pathname
    const isAuthRoute = pathname === '/login' || pathname === '/register'
      || pathname === '/reset-password' || pathname === '/update-password'
    const isPublicRoute = pathname.startsWith('/schedule') || pathname.startsWith('/api/')

    if (!user && !isAuthRoute && !isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch {
    return NextResponse.next({ request })
  }
}
