import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { dayKeyTZ } from '@/lib/datetime'
import { notifyClient } from '@/lib/notifications/notify'
import { formatarPontos } from '@/lib/fidelidade/formato'

/**
 * A rotina da fidelidade, de hora em hora (Notification Cron):
 *
 * 1. baixa dos pontos vencidos (`expirar_pontos` — FIFO em forma fechada);
 * 2. bônus de aniversário, nas redes que o ligaram (`fidelidade_bonus_aniversario`);
 * 3. aviso de vencimento por push, nas redes que o ligaram (`avisos_de_vencimento`).
 *
 * Os três são idempotentes no BANCO: expiração conta o que já venceu, o bônus
 * tem `bonus_ref` única por ano, e o aviso é reivindicado (a conta guarda até
 * onde já avisou) antes de o push sair. Rodar de hora em hora, ou duas passagens
 * ao mesmo tempo, não repete nada.
 *
 * A ordem importa: expirar antes de avisar, senão o aviso contaria pontos que
 * acabaram de vencer.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const agora = new Date()
  try {
    const contas = await ler(admin.rpc('expirar_pontos', { p_ate: agora.toISOString() }),
      'dar baixa nos pontos vencidos')

    const aniversariantes = (await ler(admin.rpc('fidelidade_bonus_aniversario', { p_hoje: dayKeyTZ(agora) }),
      'dar o bônus de aniversário') ?? []) as { client_id: string; pontos: number }[]
    await Promise.allSettled(aniversariantes.map(a => notifyClient(admin, a.client_id, {
      type:  'fidelidade_bonus',
      title: 'Feliz aniversário!',
      body:  `Você ganhou ${formatarPontos(Number(a.pontos))} de presente.`,
    })))

    const avisos = (await ler(admin.rpc('avisos_de_vencimento', { p_agora: agora.toISOString() }),
      'separar os avisos de vencimento') ?? []) as { client_id: string; pontos: number; ate: string; slug: string | null }[]
    await Promise.allSettled(avisos.map(a => notifyClient(admin, a.client_id, {
      type:  'fidelidade_vencimento',
      title: 'Seus pontos vão vencer',
      body:  `${formatarPontos(Number(a.pontos))} vencem até ${new Date(a.ate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Use na próxima visita.`,
      data:  a.slug ? { url: `/${a.slug}/cliente/fidelidade` } : undefined,
    })))

    return NextResponse.json({
      ok: true, contas: Number(contas ?? 0), aniversarios: aniversariantes.length, avisos: avisos.length,
    })
  } catch (e) {
    console.error('[cron/fidelidade]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Falha na rotina da fidelidade.' }, { status: 500 })
  }
}
