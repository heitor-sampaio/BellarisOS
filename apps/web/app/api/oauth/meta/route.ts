import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  const appId = process.env.META_APP_ID
  if (!appId) {
    return new NextResponse('META_APP_ID não configurado', { status: 500 })
  }

  const state       = randomBytes(16).toString('hex')
  const cookieStore = await cookies()

  cookieStore.set('meta_oauth_state', state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600, // 10 minutos
    path:     '/',
  })

  const origin      = req.nextUrl.origin
  const redirectUri = `${origin}/api/oauth/meta/callback`

  const url = new URL('https://www.facebook.com/dialog/oauth')
  url.searchParams.set('client_id',     appId)
  url.searchParams.set('redirect_uri',  redirectUri)
  url.searchParams.set('scope',         'ads_read,ads_management')
  url.searchParams.set('state',         state)
  url.searchParams.set('response_type', 'code')

  return NextResponse.redirect(url.toString())
}
