import { type NextRequest } from 'next/server'
import { proxyDaPlataforma } from '@estetica-os/nucleo/lib/plataforma/proxy'

/**
 * A porta do sistema (só ADMIN): nega por padrão,
 * renova a sessão e recusa quem não é deste host (ver o núcleo).
 */
export async function proxy(request: NextRequest) {
  return proxyDaPlataforma(request, 'sistema', caminho => caminho === '/api/health'
    // Se defende pelo segredo entre os apps (lib/interno no núcleo).
    || caminho === '/api/interno/expirar'
    // A clínica pede que o total novo (adicional contratado) vá ao Asaas.
    || caminho === '/api/interno/levar-valor'
    // Cada uma se defende sozinha: o webhook pelo token do Asaas, o cron pelo CRON_SECRET.
    || caminho === '/api/webhooks/asaas'
    || caminho.startsWith('/api/cron/'))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$).*)'],
}
