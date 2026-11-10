import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { avisarLotesVencendo } from '@/lib/estoque/aviso-de-lote'
import { avisarEstoqueMinimo } from '@/lib/estoque/aviso-do-minimo'

/**
 * Avisa quem cuida do estoque que um produto está no mínimo ou abaixo, e que
 * um lote vence em 30 dias.
 *
 * **Por que um cron e não a ação que mexe no estoque:** o saldo cai em cinco ou
 * seis lugares (atendimento, entrada, ajuste, transferência, código de barras).
 * Instrumentar cada caminho seria esquecer o próximo.
 *
 * **O mínimo pela régua da TELA** (A48 da 11ª simulação, 2026-11-10): de
 * 2026-09-25 a 11-10 o aviso saía do evento `estoque.abaixo_do_minimo` do
 * gatilho, que compara as embalagens e só o "abaixo" estrito — o dashboard da
 * Gisele dizia "2" e o sino "Tudo em dia". Agora é `avisarEstoqueMinimo`
 * (`lib/estoque/aviso-do-minimo.ts`): o estado de cada linha com mínimo, uma
 * vez por cruzamento (`branch_product_stock.minimo_avisado_em`). O evento
 * continua, para as automações.
 *
 * `?rede=` recorta uma rede (os testes passam a [e2e]; o cron, nenhuma).
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
    const admin = createAdminClient()
    const rede = req.nextUrl.searchParams.get('rede')
    const tenantId = rede && /^[0-9a-f-]{36}$/i.test(rede) ? rede : null

    // A48 da 11ª: o mínimo pela régua da tela, uma vez por cruzamento.
    const minimo = await avisarEstoqueMinimo(admin, { tenantId })
    // A39 da 10ª: o lote que vence em 30 dias também chega ao sino, uma vez por lote.
    const lotes = await avisarLotesVencendo(admin, { tenantId })

    return NextResponse.json({
      ok: true, noMinimo: minimo.abaixo, avisados: minimo.avisados, liberados: minimo.limpos,
      lotesVencendo: lotes.lotes, lotesAvisados: lotes.avisados,
    })
  } catch (e) {
    // Sai com erro de propósito: o script do cron marca a execução como
    // vermelha no painel do Railway em vez de falhar em silêncio.
    console.error('[cron estoque-minimo]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
