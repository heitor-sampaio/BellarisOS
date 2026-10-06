import { type NextRequest } from 'next/server'
import { proxyDaPlataforma } from '@estetica-os/nucleo/lib/plataforma/proxy'

/**
 * A porta do suporte (SUPORTE e ADMIN): nega por padrão,
 * renova a sessão e recusa quem não é deste host (ver o núcleo).
 */
export async function proxy(request: NextRequest) {
  return proxyDaPlataforma(request, 'suporte', caminho => caminho === '/api/health'
    // Se defende pelo segredo entre os apps (lib/interno no núcleo).
    || caminho === '/api/interno/expirar')
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$).*)'],
}
