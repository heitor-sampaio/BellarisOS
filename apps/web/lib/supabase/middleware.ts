import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { opcoesDoCookieDeSessao } from './cookie-de-sessao'
import { politicaDaClinica } from '@/lib/seguranca/csp'

export async function updateSession(request: NextRequest) {
  try {
    // O caminho e o método seguem num cabeçalho para o servidor: é com eles que
    // a sessão de SUPORTE registra o que foi aberto e feito (lib/auth.ts). O
    // cabeçalho vindo do navegador é sobrescrito — não dá para forjar o registro.
    const cabecalhos = new Headers(request.headers)
    cabecalhos.set('x-bellaris-caminho', `${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`)

    // O CSP da clínica, por enquanto só AVISANDO (lib/seguranca/csp.ts): o
    // nonce vai no cabeçalho do PEDIDO (o Next o lê e o põe nos scripts dele) e
    // no da resposta. As /api/* não levam (não são páginas).
    let csp: string | null = null
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
      csp = politicaDaClinica({
        nonce, supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', dev: process.env.NODE_ENV === 'development',
      })
      cabecalhos.set('content-security-policy-report-only', csp)
      cabecalhos.set('x-nonce', nonce)
    }
    const seguir = () => {
      const r = NextResponse.next({ request: { headers: cabecalhos } })
      if (csp) r.headers.set('content-security-policy-report-only', csp)
      return r
    }
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
                opcoesDoCookieDeSessao(value, options))
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
      // A entrada do "entrar como": a aba nova chega do painel do suporte
      // (outro host) com o código — ainda sem sessão aqui.
      || pathname === '/auth/suporte-entrada'
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

    // A PLATAFORMA (a equipe do BellarisOS) mora em outros apps, em outros
    // hosts (sistema e suporte, 2026-10-06): a sessão de quem tem a marca não
    // vale aqui. Desfeita na hora (os cookies apagados vão na resposta) e de
    // volta ao login, com o aviso de onde a equipe entra. `/api/*` se defende
    // sozinha (`buildContext` recusa a marca também).
    const plataforma = (user?.app_metadata as { plataforma?: string } | undefined)?.plataforma
    if (user && plataforma && !pathname.startsWith('/api/')) {
      await supabase.auth.signOut({ scope: 'local' })
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = '?acesso=plataforma'
      const resposta = NextResponse.redirect(url)
      // Leva os cookies apagados nesta mesma resposta.
      supabaseResponse.cookies.getAll().forEach(c => resposta.cookies.set(c))
      return resposta
    }

    return supabaseResponse
  } catch {
    // Mesmo na falha, o cabeçalho do registro do suporte é o do servidor: o
    // vindo do navegador não passa adiante.
    const limpos = new Headers(request.headers)
    limpos.set('x-bellaris-caminho', `${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.next({ request: { headers: limpos } })
  }
}
