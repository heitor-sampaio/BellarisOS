import { type NextRequest } from 'next/server'
import { rotaDeExpirar } from '@estetica-os/nucleo/lib/plataforma/expirar-na-clinica'

/**
 * Expira caches DESTE processo a pedido de outro app (2026-10-06). Pública no
 * proxy: se defende pelo segredo (`INTERNO_SECRET`) e pela lista fechada de
 * tags — ver `lib/interno.ts` no núcleo.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return rotaDeExpirar(req)
}
