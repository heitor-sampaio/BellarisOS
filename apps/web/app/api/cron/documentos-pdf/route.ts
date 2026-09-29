import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, tentar } from '@/lib/db'
import { gerarPdfAssinado } from '@/lib/documentos/pdf'

/**
 * Recolhe os documentos assinados que ficaram sem PDF final.
 *
 * O PDF sai em `after()` logo depois da assinatura; se o processo morreu no
 * meio, ele fica aqui. `documentos_pdf_reivindicar` pega a linha e soma a
 * tentativa na mesma instrução (`skip locked`): duas passagens do cron nunca
 * geram o mesmo PDF, e o que falha 5 vezes para de ser tentado — fica
 * visível no banco (assinado, sem PDF, 5 tentativas) em vez de repetir para
 * sempre.
 *
 * De carona, apaga as tentativas de abrir link de assinatura com mais de 30
 * dias: só servem ao limite por IP (1 hora), e IP é dado pessoal.
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
    const fila = await gravar(admin.rpc('documentos_pdf_reivindicar', { p_limite: 10 }), 'reivindicar os documentos sem PDF')
    let gerados = 0
    const falhas: string[] = []
    for (const d of (fila ?? []) as { id: string; tenant_id: string }[]) {
      try {
        if (await gerarPdfAssinado(d.tenant_id, d.id)) gerados++
      } catch (e) {
        falhas.push(`${d.id}: ${(e as Error).message}`)
      }
    }
    if (falhas.length) console.error('[cron documentos-pdf]', falhas)
    // Acessório: se falhar, o limite por IP continua certo — só sobra linha velha.
    await tentar(admin.from('document_link_attempts').delete()
      .lt('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()), 'apagar as tentativas de link antigas')
    return NextResponse.json({ ok: falhas.length === 0, reivindicados: (fila ?? []).length, gerados, falhas: falhas.length },
      { status: falhas.length ? 500 : 200 })
  } catch (e) {
    console.error('[cron documentos-pdf]', (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
