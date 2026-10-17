import { NextResponse, type NextRequest } from 'next/server'

/**
 * `www.bellarisos.com` → `bellarisos.com` (308, o caminho junto): um endereço
 * só para o buscador e para quem compartilha. O host vem do pedido — atrás do
 * Railway, o `x-forwarded-host`.
 */
export function proxy(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0]!.trim().toLowerCase()
  if (!host.startsWith('www.')) return NextResponse.next()
  const destino = `https://${host.slice(4).replace(/:\d+$/, '')}${req.nextUrl.pathname}${req.nextUrl.search}`
  return NextResponse.redirect(destino, 308)
}

export const config = { matcher: '/:caminho*' }
