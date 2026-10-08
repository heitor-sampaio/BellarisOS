import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Apaga as conversas do Copilot paradas há mais de 90 dias (2026-10-08).
 *
 * A conversa guarda o que a pessoa escreveu e o que as ferramentas leram
 * (nomes, telefones, horários). Guardar para sempre seria juntar dado pessoal
 * parado sem precisar (LGPD: necessidade). As mensagens e as ações saem em
 * cascata; o uso do mês (a cota) fica — é número, não conversa.
 *
 * E a MENSAGEM de mais de 90 dias numa conversa que segue em uso (revisão de
 * 2026-10-08): sem isto, quem conversa toda semana guardava o ano inteiro. As
 * ações de mais de 90 dias também (já não se confirmam: valem 15 minutos).
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
  const admin = createAdminClient()
  const conversas = await admin.from('copilot_conversas').delete({ count: 'exact' }).lt('atualizada_em', limite)
  const mensagens = await admin.from('copilot_mensagens').delete({ count: 'exact' }).lt('criada_em', limite)
  const acoes     = await admin.from('copilot_acoes').delete({ count: 'exact' }).lt('criada_em', limite)
  const erro = conversas.error ?? mensagens.error ?? acoes.error
  if (erro) {
    console.error('[cron/copilot-retencao]', erro.message)
    return NextResponse.json({ error: erro.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, apagadas: conversas.count ?? 0, mensagens: mensagens.count ?? 0, acoes: acoes.count ?? 0 })
}
