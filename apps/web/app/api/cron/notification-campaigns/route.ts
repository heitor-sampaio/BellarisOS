import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchCampaignInline } from '@/lib/notifications/disparo-de-campanha'
import type { NotificationCampaign } from '@/actions/notification-campaigns'
import { gravar } from '@/lib/db'
import { relogioDaCampanha } from '@/lib/notifications/relogio-da-campanha'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { enviarCampanha } from '@/lib/notifications/envio-da-campanha'
import { dayKeyTZ } from '@/lib/datetime'
import { jaEhHoraDeDisparar, type GatilhoDaCampanha } from '@/lib/notifications/quando-dispara'
import { aniversariantes, concluiramNoDia, pacotesVencendoNoDia, lembretesNaJanela, type Destinatario } from '@/lib/notifications/gatilho-de-hoje'

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
  // D8 da 11ª: os gatilhos do DIA saem a partir das 09:00 — do relógio da
  // CLÍNICA (F62; sem fuso, o de Brasília): `relogioDaCampanha`, por campanha.
  // `?hora=` é a costura do teste (só com o segredo).
  const horaPedida = Number(req.nextUrl.searchParams.get('hora'))
  const horaDoTeste = Number.isInteger(horaPedida) && horaPedida >= 0 && horaPedida <= 23 && req.nextUrl.searchParams.has('hora') ? horaPedida : null

  // Fetch all active automated campaigns + scheduled ones due now
  const { data: campaigns, error } = await admin
    .from('notification_campaigns')
    .select('*')
    .eq('status', 'ACTIVE')
    .in('type', ['SCHEDULED', 'AUTOMATED'])

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

    // O relógio da clínica (F62): a campanha é da rede — o fuso comum das unidades.
    const fuso = await fusoDaRede(camp.tenant_id)
    const relogio = relogioDaCampanha(now, fuso)
    const today = relogio.hoje
    const hora = horaDoTeste ?? relogio.hora
    // Um disparo por campanha, cliente e DIA do relógio da clínica (C56).
    const dia = dayKeyTZ(now, fuso)
    const enviar = async (clientes: Destinatario[]) => clientes.length ? enviarCampanha(admin, camp, clientes, dia) : 0

    // -- SCHEDULED --------------------------------------------
    if (camp.type === 'SCHEDULED') {
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
      continue
    }

    // -- AUTOMATED ---------------------------------------------
    if (!camp.trigger_type) continue
    if (!jaEhHoraDeDisparar(camp.trigger_type as GatilhoDaCampanha, hora)) {
      results.push({ id: camp.id, type: camp.trigger_type, sent: 0, skipped: true }); continue
    }

    // -- BIRTHDAY ---------------------------------------------
    if (camp.trigger_type === 'BIRTHDAY') {
      // A escolha (as aniversariantes do público, no banco) é a do "Quem
      // receberia hoje" do detalhe da campanha (D10 da 12ª).
      const sent = await enviar(await aniversariantes(camp, today))
      await gravar(admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id), 'atualizar a campanha')
      results.push({ id: camp.id, type: 'BIRTHDAY', sent, skipped: false })
      continue
    }

    // -- ANNUAL_DATE -------------------------------------------
    if (camp.trigger_type === 'ANNUAL_DATE') {
      const cfg = camp.trigger_config as { month?: number; day?: number } | null
      if (!cfg?.month || !cfg?.day) continue
      if (cfg.month !== today.month || cfg.day !== today.day) {
        results.push({ id: camp.id, type: 'ANNUAL_DATE', sent: 0, skipped: true }); continue
      }
      // Check if already ran today
      if (camp.last_run_at && relogio.mesmoDia(new Date(camp.last_run_at), now)) {
        results.push({ id: camp.id, type: 'ANNUAL_DATE', sent: 0, skipped: true }); continue
      }

      const { sent } = await dispatchCampaignInline(camp, camp.tenant_id)
      await gravar(admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id), 'atualizar a campanha')
      results.push({ id: camp.id, type: 'ANNUAL_DATE', sent, skipped: false })
      continue
    }

    // -- DAYS_AFTER_VISIT --------------------------------------
    if (camp.trigger_type === 'DAYS_AFTER_VISIT') {
      const cfg = camp.trigger_config as { days?: number } | null
      if (!cfg?.days) continue

      const targetDate = relogio.daquiA(-cfg.days)
      const sent = await enviar(await concluiramNoDia(admin, camp, targetDate, fuso))
      await gravar(admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id), 'atualizar a campanha')
      results.push({ id: camp.id, type: 'DAYS_AFTER_VISIT', sent, skipped: false })
      continue
    }

    // -- DAYS_BEFORE_EXPIRY ------------------------------------
    if (camp.trigger_type === 'DAYS_BEFORE_EXPIRY') {
      const cfg = camp.trigger_config as { days?: number } | null
      if (!cfg?.days) continue

      const targetDate = relogio.daquiA(cfg.days)
      const sent = await enviar(await pacotesVencendoNoDia(admin, camp, targetDate, fuso))
      await gravar(admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id), 'atualizar a campanha')
      results.push({ id: camp.id, type: 'DAYS_BEFORE_EXPIRY', sent, skipped: false })
      continue
    }

    // -- BEFORE_APPOINTMENT ------------------------------------
    if (camp.trigger_type === 'BEFORE_APPOINTMENT') {
      // Os lembretes que SAEM nesta hora: "N horas antes" do agendamento — e,
      // com a opção da véspera (C74), o que cairia de madrugada às 20:00.
      const sent = await enviar(await lembretesNaJanela(admin, camp, now, new Date(now.getTime() + 3_600_000), fuso))
      await gravar(admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id), 'atualizar a campanha')
      results.push({ id: camp.id, type: 'BEFORE_APPOINTMENT', sent, skipped: false })
      continue
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
