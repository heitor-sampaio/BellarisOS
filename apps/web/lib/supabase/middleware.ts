import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function updateSession(request: NextRequest) {
  try {
    // O caminho e o método seguem num cabeçalho para o servidor: é com eles que
    // a sessão de SUPORTE registra o que foi aberto e feito (lib/auth.ts). O
    // cabeçalho vindo do navegador é sobrescrito — não dá para forjar o registro.
    const cabecalhos = new Headers(request.headers)
    cabecalhos.set('x-bellaris-caminho', `${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`)
    const seguir = () => NextResponse.next({ request: { headers: cabecalhos } })
    let supabaseResponse = seguir()

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
            // Os cookies renovados seguem para o servidor nesta requisição.
            cabecalhos.set('cookie', request.headers.get('cookie') ?? '')
            supabaseResponse = seguir()
            // O pedaço que vem VAZIO é para apagar (sessão trocada ou encurtada):
            // não pode ganhar a validade de 7 dias.
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value,
                value ? { ...options, maxAge: 60 * 60 * 24 * 7 } : { ...options, maxAge: 0 })
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
      // A volta do link de e-mail: é ela que ABRE a sessão (app/auth/confirm).
      || pathname === '/auth/confirm'
      // O fim da sessão de suporte: funciona também com a sessão já derrubada
      // (vencida ou revogada), para devolver o atendente ao painel.
      || pathname === '/auth/suporte-fim'
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
      // A conferência de um documento assinado: quem recebe o papel ou o PDF
      // (o cliente, um advogado, um juiz) não tem conta no sistema.
      || pathname === '/verificar' || pathname.startsWith('/verificar/')
      // O link de assinatura: o cliente abre sem conta; a identidade é o CPF
      // (ou o nascimento), conferido pelo banco.
      || pathname.startsWith('/assinar/')
      || pathname.startsWith('/api/')

    if (!user && !isAuthRoute && !isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // A PLATAFORMA (a equipe do BellarisOS) e as redes não se misturam: quem
    // tem a marca fica no /suporte, e quem não tem não entra nele. É só o
    // desvio de navegação — quem barra de verdade são `getPlatformContext` e
    // `buildContext`, em cada página e action.
    const plataforma = (user?.app_metadata as { plataforma?: string } | undefined)?.plataforma
    const noSuporte = pathname === '/suporte' || pathname.startsWith('/suporte/')
    const desvio = user && plataforma && !noSuporte && !isAuthRoute && !isPublicRoute && !pathname.startsWith('/auth/')
      ? '/suporte'
      : user && !plataforma && noSuporte ? '/' : null
    if (desvio) {
      const url = request.nextUrl.clone()
      url.pathname = desvio
      url.search = ''
      const resposta = NextResponse.redirect(url)
      // Leva os cookies renovados nesta mesma requisição.
      supabaseResponse.cookies.getAll().forEach(c => resposta.cookies.set(c))
      return resposta
    }

    return supabaseResponse
  } catch {
    return NextResponse.next({ request })
  }
}
