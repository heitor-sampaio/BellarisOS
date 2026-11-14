import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchCampaignInline } from '@/lib/notifications/disparo-de-campanha'
import type { NotificationCampaign } from '@/actions/notification-campaigns'
import { gravar } from '@/lib/db'
import { relogioDaCampanha } from '@/lib/notifications/relogio-da-campanha'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { jaEhHoraDeDisparar } from '@/lib/notifications/quando-dispara'
import { ehADataDeTodoAno } from '@/lib/notifications/gatilho-de-hoje'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Protect with CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now   = new Date()
  // A campanha AGENDADA (MK1, 2026-11-14: a campanha é Imediata ou Agendada).
  // A de todo ano sai a partir das 09:00 — do relógio da REDE (D8 da 11ª, F62;
  // sem fuso, o de Brasília): `relogioDaCampanha`, por campanha.
  // `?hora=` é a costura do teste (só com o segredo).
  const horaPedida = Number(req.nextUrl.searchParams.get('hora'))
  const horaDoTeste = Number.isInteger(horaPedida) && horaPedida >= 0 && horaPedida <= 23 && req.nextUrl.searchParams.has('hora') ? horaPedida : null

  // As agendadas ativas: a de data e hora (uma vez) e a de todo ano.
  const { data: campaigns, error } = await admin
    .from('notification_campaigns')
    .select('*')
    .eq('status', 'ACTIVE')
    .eq('type', 'SCHEDULED')

  if (error) {
    console.error('[cron] fetch campaigns error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; type: string; sent: number; skipped: boolean }[] = []

  for (const raw of campaigns ?? []) {
    const camp = raw as NotificationCampaign
    // Rede bloqueada (desligada, suspensa, cancelada): nada sai, e a campanha
    // ESPERA — a agendada não é marcada como concluída.
    if (await redeEstaBloqueada(camp.tenant_id)) { results.push({ id: camp.id, type: camp.type, sent: 0, skipped: true }); continue }
    // Campanhas fora do PLANO da rede: nada sai, e a campanha espera (como a da rede bloqueada).
    if (!(await redeTemRecurso(camp.tenant_id, 'campanhas'))) { results.push({ id: camp.id, type: camp.type, sent: 0, skipped: true }); continue }

    // O relógio da rede (F62): a campanha é da rede — o fuso comum das unidades.
    const fuso = await fusoDaRede(camp.tenant_id)
    const relogio = relogioDaCampanha(now, fuso)
    const hora = horaDoTeste ?? relogio.hora

    // -- Todo ano numa data --------------------------------------
    // Sai no dia, a partir das 09:00, ao público inteiro — uma vez no dia (o
    // envio reivindica um disparo por campanha, cliente e dia, C56) — e segue
    // ATIVA para o ano que vem.
    if (camp.trigger_type === 'ANNUAL_DATE') {
      if (!ehADataDeTodoAno(camp.trigger_config, relogio.hoje) || !jaEhHoraDeDisparar('ANNUAL_DATE', hora)) {
        results.push({ id: camp.id, type: 'ANNUAL_DATE', sent: 0, skipped: true }); continue
      }
      if (camp.last_run_at && relogio.mesmoDia(new Date(camp.last_run_at), now)) {
        results.push({ id: camp.id, type: 'ANNUAL_DATE', sent: 0, skipped: true }); continue
      }
      const { sent, error: dispErr } = await dispatchCampaignInline(camp, camp.tenant_id)
      await gravar(admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id), 'atualizar a campanha')
      results.push({ id: camp.id, type: 'ANNUAL_DATE', sent, skipped: false })
      if (dispErr) console.error(`[cron] ANNUAL_DATE ${camp.id}`, dispErr)
      continue
    }

    // -- Numa data e hora (uma vez) -------------------------------
    if (!camp.scheduled_at) continue
    const scheduledAt = new Date(camp.scheduled_at)
    if (scheduledAt > now) { results.push({ id: camp.id, type: 'SCHEDULED', sent: 0, skipped: true }); continue }
    // Already ran?
    if (camp.last_run_at) { results.push({ id: camp.id, type: 'SCHEDULED', sent: 0, skipped: true }); continue }

    const { sent, error: dispErr } = await dispatchCampaignInline(camp, camp.tenant_id)
    await gravar(admin
      .from('notification_campaigns')
      .update({ status: 'COMPLETED', last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
      .eq('id', camp.id), 'atualizar a campanha')

    results.push({ id: camp.id, type: 'SCHEDULED', sent, skipped: false })
    if (dispErr) console.error(`[cron] SCHEDULED ${camp.id}`, dispErr)
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
