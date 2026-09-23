import { NextRequest, NextResponse } from 'next/server'
import { rodarFilaDeAutomacoes } from '@/lib/automacoes/cron'

/**
 * O relógio das automações.
 *
 * Roda a cada **cinco minutos**, num serviço de cron próprio no Railway — não
 * no de hora em hora que já existe. A diferença importa: "esperar 30 minutos e
 * mandar" com granularidade de uma hora vira "em até 1h30", e uma automação
 * que promete meia hora tem de entregar meia hora.
 *
 * O que ele faz:
 *  - retoma o que estava **esperando** (a espera venceu);
 *  - tenta de novo o que **falhou**, até três vezes;
 *  - avalia os **gatilhos de agenda** ("todo dia às 9h").
 *
 * O que ele NÃO faz: o disparo por evento. Esse acontece dentro do request que
 * gravou o fato, em `after()` — enfileirar e esperar o cron faria "responder na
 * hora quem chegou pelo anúncio" virar "responder em até cinco minutos".
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
    const r = await rodarFilaDeAutomacoes()
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    // Sai com erro de propósito: o script do cron marca a execução como
    // vermelha no painel do Railway, em vez de falhar em silêncio.
    console.error('[cron automacoes]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
