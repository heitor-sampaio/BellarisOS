import { NextRequest, NextResponse } from 'next/server'
import { emitirRetornosVencendo } from '@/lib/agenda/retornos-vencendo'

/**
 * O "Retorno vencendo" (D-12): no dia do retorno pedido ao finalizar o
 * atendimento, emite `agendamento.retorno_vencendo` — o gatilho das
 * automações. A conta mora em `lib/agenda/retornos-vencendo.ts` (reivindica
 * cada atendimento antes de emitir). Roda no cron de hora em hora: o retorno
 * é do DIA, e a primeira passagem do dia o pega.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { emitidos } = await emitirRetornosVencendo()
    return NextResponse.json({ ok: true, emitidos })
  } catch (e) {
    console.error('[cron/retornos]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
