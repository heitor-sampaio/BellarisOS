import { NextRequest, NextResponse } from 'next/server'
import { reenviarEventosPendentes } from '@/lib/ads/capi'

/**
 * Drena os eventos da API de Conversões que não saíram no ato.
 *
 * Duas populações chegam aqui, por motivos diferentes:
 *
 * - **O que falhou.** `Schedule` e `CompleteRegistration` são enviados na hora
 *   em que o fato acontece, porque a Meta penaliza evento que chega tarde: mais
 *   de uma hora depois já atrapalha a otimização de entrega. Quando a rede ou a
 *   Graph API falham, a linha fica `falhou` e é recolhida aqui.
 *
 * - **`Purchase`, sempre.** Ele é registrado por GATILHO no banco
 *   (`on_transaction_paid`), porque um pagamento vira real em seis lugares do
 *   código e instrumentar um a um é garantir esquecer o sétimo. O gatilho não
 *   tem como chamar a Graph API, então o envio é daqui. A troca é consciente:
 *   até uma hora de atraso no `Purchase` não custa nada, porque quem otimiza a
 *   campanha é o `Schedule` — o `Purchase` serve a ROI e valor, onde completude
 *   vale mais que pressa.
 *
 * Também é por aqui que entram os eventos que esperavam a integração Meta Ads
 * ser conectada: eles ficam `pendente` e saem assim que houver para onde mandar.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** A Graph API é um nó por chamada; 50 cabem folgados no minuto de execução. */
const LOTE = 50

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const r = await reenviarEventosPendentes(LOTE)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    // Sai com erro de propósito: o script do cron marca a execução como
    // vermelha no painel do Railway, em vez de falhar em silêncio.
    console.error('[cron meta-capi]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
