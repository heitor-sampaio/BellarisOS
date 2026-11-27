import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { avisarLotesVencendo } from '@/lib/estoque/aviso-de-lote'
import { avisarEstoqueMinimo } from '@/lib/estoque/aviso-do-minimo'

/**
 * Avisa quem cuida do estoque que um produto está no mínimo ou abaixo, e que
 * um lote vence em 30 dias.
 *
 * **O cruzamento se registra no banco, na hora do movimento** (D1 da 36ª
 * simulação: dois cruzamentos na mesma hora viravam um aviso só, às 03:02): o
 * gatilho de `branch_product_stock`, que todo caminho que mexe no saldo
 * atravessa, põe cada um na fila `estoque_cruzamentos_do_minimo`. As actions do
 * estoque mandam o aviso logo depois (`avisarOMinimoDepois`); esta rotina é a
 * rede de segurança e manda o que ficou na fila.
 *
 * **O mínimo pela régua da TELA** (A48 da 11ª simulação, 2026-11-10): de
 * 2026-09-25 a 11-10 o aviso saía do evento `estoque.abaixo_do_minimo` do
 * gatilho, que compara as embalagens e só o "abaixo" estrito — o dashboard da
 * Gisele dizia "2" e o sino "Tudo em dia". Agora é `avisarEstoqueMinimo`
 * (`lib/estoque/aviso-do-minimo.ts`): um aviso a cada cruzamento da fila. O
 * evento continua, para as automações.
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

    // A48 da 11ª e D1 da 36ª: o mínimo pela régua da tela, um aviso a cada cruzamento.
    const minimo = await avisarEstoqueMinimo(admin, { tenantId })
    // A39 da 10ª: o lote que vence em 30 dias também chega ao sino, uma vez por lote.
    const lotes = await avisarLotesVencendo(admin, { tenantId })

    return NextResponse.json({
      ok: true, cruzamentos: minimo.pendentes, avisados: minimo.avisados,
      lotesVencendo: lotes.lotes, lotesAvisados: lotes.avisados,
    })
  } catch (e) {
    // Sai com erro de propósito: o script do cron marca a execução como
    // vermelha no painel do Railway em vez de falhar em silêncio.
    console.error('[cron estoque-minimo]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
