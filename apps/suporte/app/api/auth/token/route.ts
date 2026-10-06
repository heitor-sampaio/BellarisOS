import type { NextRequest } from 'next/server'
import { rotaDoToken } from '@estetica-os/nucleo/lib/supabase/rota-do-token'

/** O access token para o Realtime da fila de chamados (`SinalDaFila`) — a regra mora no núcleo (`rotaDoToken`). */
export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  return rotaDoToken(req)
}
