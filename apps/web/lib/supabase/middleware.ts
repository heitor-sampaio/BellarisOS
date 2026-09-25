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
    // Abre SEM sessão. É aqui que "página pública" se decide de verdade: a
    // página pode não chamar `getTenantContext` e ainda assim nunca ser vista,
    // porque o proxy manda para o login antes de ela renderizar.
    //
    // `/privacidade` precisa disso porque é lida por quem ainda não entrou, por
    // quem nunca vai entrar (o cliente da clínica) e por quem avalia o app na
    // loja — loja de aplicativo exige uma URL pública para publicar.
    // `/` é a landing, que já decide sozinha se redireciona.
    const PUBLICAS = ['/privacidade']
    const isPublicRoute = pathname === '/'
      || PUBLICAS.includes(pathname)
      || pathname.startsWith('/schedule')
      || pathname.startsWith('/api/')

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
