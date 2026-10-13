import { NextRequest, NextResponse } from 'next/server'
import { manterImportacoes } from '@/lib/importacao/processar'

/**
 * A manutenção das importações de contatos, de hora em hora (2026-10-13): a
 * importação sem sinal de vida há 15 min vira "interrompida" (retomável); o
 * relatório de erros — que guarda o valor errado, dado pessoal — some depois de
 * 7 dias; e as linhas de uma importação que nunca terminou também. Sem isto a
 * limpeza só acontecia quando alguém abria a tela.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await manterImportacoes()
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[cron/importacoes]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
