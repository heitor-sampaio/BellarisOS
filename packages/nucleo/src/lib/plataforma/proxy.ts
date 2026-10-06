import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { opcoesDoCookieDeSessao } from '../supabase/cookie-de-sessao'
import { aceitaNoHost, urlDaClinica, type HostDaPlataforma } from './destino'
import { ipPermitido, politicaDeConteudo } from './porta'

/**
 * A PORTA de cada app da plataforma (o `proxy.ts` do sistema e do suporte).
 *
 * - **IP** (opcional, `PLATAFORMA_IPS`): fora da lista, 403 — menos nas rotas
 *   públicas do host (health, webhook, cron, a conversa entre os apps), que
 *   vêm de fora e se defendem sozinhas.
 * - **Nega por padrão**: sem sessão, só as rotas de acesso e as públicas
 *   abrem; com sessão de quem não é do host (membro de rede, cliente final,
 *   SUPORTE no sistema), a sessão é desfeita aqui mesmo e a pessoa volta ao
 *   login — nenhuma tela chega a renderizar. Quem barra cada página e action
 *   de verdade continua sendo `getPlatformContext`; isto é a primeira parede.
 * - **CSP estrita com nonce** (`porta.ts`) em toda página. As `/api/*` ficam
 *   de fora: não são HTML, e a única que é (`/api/entrar` do suporte) manda a
 *   sua — duas políticas somariam, e o nonce de uma barraria a outra.
 * - Renova a sessão (o refresh), com os cookies httpOnly de
 *   `opcoesDoCookieDeSessao`.
 */
const DE_ACESSO = ['/login', '/reset-password', '/update-password', '/auth/confirm']

export async function proxyDaPlataforma(
  request: NextRequest,
  host: HostDaPlataforma,
  /** Rotas abertas sem sessão (cada uma se defende sozinha: health, webhook, cron). */
  publicas: (caminho: string) => boolean,
): Promise<NextResponse> {
  const caminho = request.nextUrl.pathname
  const publica = publicas(caminho)
  if (!publica && !ipPermitido(request.headers.get('x-real-ip'), process.env.PLATAFORMA_IPS)) {
    return new NextResponse('Acesso não permitido deste endereço.', { status: 403 })
  }

  // A CSP desta requisição: o nonce vai no cabeçalho do PEDIDO (o Next o lê e
  // o põe nos scripts dele) e no da resposta.
  const comCsp = !caminho.startsWith('/api/')
  const cabecalhos = new Headers(request.headers)
  let csp: string | null = null
  if (comCsp) {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
    let formulario: string[] = []
    if (host === 'suporte') { try { formulario = [new URL(urlDaClinica()).origin] } catch { /* sem CLINICA_URL */ } }
    csp = politicaDeConteudo({
      nonce, supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', formulario, dev: process.env.NODE_ENV === 'development',
    })
    cabecalhos.set('x-nonce', nonce)
    cabecalhos.set('content-security-policy', csp)
  }
  const seguir = () => {
    const r = NextResponse.next({ request: { headers: cabecalhos } })
    if (csp) r.headers.set('content-security-policy', csp)
    return r
  }

  let resposta = seguir()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista: { name: string; value: string; options?: CookieOptions }[]) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value))
        // Os cookies renovados seguem para o servidor nesta mesma requisição.
        cabecalhos.set('cookie', request.headers.get('cookie') ?? '')
        resposta = seguir()
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, opcoesDoCookieDeSessao(value, options)))
      },
    },
  })

  if (publica) return resposta

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims as { app_metadata?: { plataforma?: string } } | undefined
  const deAcesso = DE_ACESSO.includes(caminho)

  const levarPara = (destino: string) => {
    const url = request.nextUrl.clone()
    url.pathname = destino
    url.search = ''
    const r = NextResponse.redirect(url)
    resposta.cookies.getAll().forEach(c => r.cookies.set(c))
    return r
  }

  if (!claims) return deAcesso ? resposta : levarPara('/login')

  if (!aceitaNoHost(host, claims.app_metadata?.plataforma)) {
    // Sessão de quem não é deste host: desfeita aqui (os cookies apagados vão
    // na resposta), sem tela nenhuma no meio.
    await supabase.auth.signOut({ scope: 'local' })
    return caminho === '/login' ? resposta : levarPara('/login')
  }
  return resposta
}
