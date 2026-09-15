import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

/**
 * Início do OAuth da Meta.
 *
 * Um app só serve dois produtos: anúncios (Ads) e mensagens (Messenger +
 * Instagram Direct). Os escopos são pedidos SEPARADAMENTE de propósito — pedir
 * permissão de mensagem a quem só quer conectar o Ads faz a tela de consentimento
 * assustar sem motivo, e cada escopo a mais é um item a justificar no App Review.
 */
const ESCOPOS = {
  ads: ['ads_read', 'ads_management'],
  mensagens: [
    'pages_show_list',          // listar as páginas do usuário
    'pages_messaging',          // enviar e receber no Messenger
    'pages_manage_metadata',    // inscrever a página no webhook
    'instagram_basic',          // ler a conta profissional ligada à página
    'instagram_manage_messages',// enviar e receber no Instagram Direct
    'business_management',
  ],
} as const

export type ProdutoMeta = keyof typeof ESCOPOS

export async function GET(req: NextRequest) {
  const appId = process.env.META_APP_ID
  if (!appId) {
    return new NextResponse('META_APP_ID não configurado', { status: 500 })
  }

  const bruto   = req.nextUrl.searchParams.get('produto')
  const produto: ProdutoMeta = bruto === 'mensagens' ? 'mensagens' : 'ads'

  const state       = randomBytes(16).toString('hex')
  const cookieStore = await cookies()

  cookieStore.set('meta_oauth_state', state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600, // 10 minutos
    path:     '/',
  })

  // O callback é o mesmo para os dois produtos; sem este cookie ele não teria
  // como saber o que buscar depois da troca de token (contas de anúncio ou
  // páginas), já que a Meta não devolve os escopos concedidos no redirect.
  cookieStore.set('meta_oauth_produto', produto, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600,
    path:     '/',
  })

  const origin      = req.nextUrl.origin
  const redirectUri = `${origin}/api/oauth/meta/callback`

  const url = new URL('https://www.facebook.com/dialog/oauth')
  url.searchParams.set('client_id',     appId)
  url.searchParams.set('redirect_uri',  redirectUri)
  url.searchParams.set('scope',         ESCOPOS[produto].join(','))
  url.searchParams.set('state',         state)
  url.searchParams.set('response_type', 'code')

  return NextResponse.redirect(url.toString())
}
