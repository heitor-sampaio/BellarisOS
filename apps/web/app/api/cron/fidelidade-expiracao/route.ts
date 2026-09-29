import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Dá baixa nos pontos de fidelidade que venceram (fase 4).
 *
 * Só nas redes com o programa ligado e validade definida; a conta — FIFO por
 * vencimento, em forma fechada — mora no banco (`expirar_pontos` →
 * `fidelidade_a_expirar`). É idempotente: as expirações já lançadas contam como
 * consumo, então rodar de hora em hora (o ritmo do Notification Cron) não vence
 * o mesmo ponto duas vezes.
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
    const contas = await ler(createAdminClient().rpc('expirar_pontos', { p_ate: new Date().toISOString() }),
      'dar baixa nos pontos vencidos')
    return NextResponse.json({ ok: true, contas: Number(contas ?? 0) })
  } catch (e) {
    console.error('[cron/fidelidade-expiracao]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Falha ao dar baixa nos pontos vencidos.' }, { status: 500 })
  }
}
