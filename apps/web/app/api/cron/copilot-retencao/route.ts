import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Apaga as conversas do Copilot paradas há mais de 90 dias (2026-10-08).
 *
 * A conversa guarda o que a pessoa escreveu e o que as ferramentas leram
 * (nomes, telefones, horários). Guardar para sempre seria juntar dado pessoal
 * parado sem precisar (LGPD: necessidade). As mensagens e as ações saem em
 * cascata; o uso do mês (a cota) fica — é número, não conversa.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIAS = 90

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limite = new Date(Date.now() - DIAS * 86_400_000).toISOString()
  const { count, error } = await createAdminClient()
    .from('copilot_conversas')
    .delete({ count: 'exact' })
    .lt('atualizada_em', limite)
  if (error) {
    console.error('[cron/copilot-retencao]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, apagadas: count ?? 0 })
}
