import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { tagDaSessao } from '@/lib/suporte/sessao'

/**
 * Fecha as sessões de SUPORTE vencidas (a de 60 min que ninguém encerrou) e
 * derruba a sessão do Auth delas — sem isso o refresh token do membro gerado
 * para o suporte ficaria vivo até o `not_after`.
 *
 * O servidor já recusa a sessão vencida em cada requisição (`buildContext`
 * confere o prazo); isto fecha a ponta do Auth e o registro. Cada sessão é
 * REIVINDICADA no banco (`for update skip locked`): duas passagens do cron
 * não fecham a mesma duas vezes.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await createAdminClient().rpc('suporte_encerrar_vencidas')
  if (error) {
    console.error('[cron/suporte-sessoes]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const sessoes = (data ?? []) as string[]
  for (const s of sessoes) revalidateTag(tagDaSessao(s), { expire: 0 })
  return NextResponse.json({ ok: true, encerradas: sessoes.length })
}
