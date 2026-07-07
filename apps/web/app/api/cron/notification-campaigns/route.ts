import webpush from 'web-push'
import { GoogleAuth } from 'google-auth-library'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchCampaignInline } from '@/actions/notification-campaigns'
import type { NotificationCampaign } from '@/actions/notification-campaigns'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

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
  const today = { month: now.getMonth() + 1, day: now.getDate() }

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

    // -- SCHEDULED --------------------------------------------
    if (camp.type === 'SCHEDULED') {
      if (!camp.scheduled_at) continue
      const scheduledAt = new Date(camp.scheduled_at)
      if (scheduledAt > now) { results.push({ id: camp.id, type: 'SCHEDULED', sent: 0, skipped: true }); continue }
      // Already ran?
      if (camp.last_run_at) { results.push({ id: camp.id, type: 'SCHEDULED', sent: 0, skipped: true }); continue }

      const { sent, error: dispErr } = await dispatchCampaignInline(camp, camp.tenant_id)
      await admin
        .from('notification_campaigns')
        .update({ status: 'COMPLETED', last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id)

      results.push({ id: camp.id, type: 'SCHEDULED', sent, skipped: false })
      if (dispErr) console.error(`[cron] SCHEDULED ${camp.id}`, dispErr)
      continue
    }

    // -- AUTOMATED ---------------------------------------------
    if (!camp.trigger_type) continue

    // -- BIRTHDAY ---------------------------------------------
    if (camp.trigger_type === 'BIRTHDAY') {
      const sent = await processBirthdayCampaign(camp, today, admin)
      await admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id)
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
      if (camp.last_run_at && isSameDay(new Date(camp.last_run_at), now)) {
        results.push({ id: camp.id, type: 'ANNUAL_DATE', sent: 0, skipped: true }); continue
      }

      const { sent } = await dispatchCampaignInline(camp, camp.tenant_id)
      await admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id)
      results.push({ id: camp.id, type: 'ANNUAL_DATE', sent, skipped: false })
      continue
    }

    // -- DAYS_AFTER_VISIT --------------------------------------
    if (camp.trigger_type === 'DAYS_AFTER_VISIT') {
      const cfg = camp.trigger_config as { days?: number } | null
      if (!cfg?.days) continue

      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() - cfg.days)
      const sent = await processVisitCampaign(camp, targetDate, admin)
      await admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id)
      results.push({ id: camp.id, type: 'DAYS_AFTER_VISIT', sent, skipped: false })
      continue
    }

    // -- DAYS_BEFORE_EXPIRY ------------------------------------
    if (camp.trigger_type === 'DAYS_BEFORE_EXPIRY') {
      const cfg = camp.trigger_config as { days?: number } | null
      if (!cfg?.days) continue

      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() + cfg.days)
      const sent = await processExpiryCampaign(camp, targetDate, admin)
      await admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id)
      results.push({ id: camp.id, type: 'DAYS_BEFORE_EXPIRY', sent, skipped: false })
      continue
    }

    // -- BEFORE_APPOINTMENT ------------------------------------
    if (camp.trigger_type === 'BEFORE_APPOINTMENT') {
      const cfg = camp.trigger_config as { hours?: number } | null
      const hours = cfg?.hours ?? 24

      const windowStart = new Date(now.getTime() + hours * 3_600_000)
      const windowEnd   = new Date(windowStart.getTime() + 3_600_000) // janela de 1h
      const sent = await processAppointmentReminderCampaign(camp, windowStart, windowEnd, admin)
      await admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id)
      results.push({ id: camp.id, type: 'BEFORE_APPOINTMENT', sent, skipped: false })
      continue
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}

// -- Birthday: send to clients whose birth_date month/day == today ------

async function processBirthdayCampaign(
  camp: NotificationCampaign,
  today: { month: number; day: number },
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const rules = camp.audience_rules

  let query = admin
    .from('clients')
    .select('id, name')
    .eq('tenant_id', camp.tenant_id)
    .eq('is_active', true)
    .not('birth_date', 'is', null)

  if (rules.branch_ids?.length) query = query.in('branch_id', rules.branch_ids)
  if (rules.has_app_account)    query = query.not('auth_id', 'is', null)

  const { data: allClients } = await query.limit(5000)

  // Filter by birth month/day in JS (Supabase doesn't expose EXTRACT easily via REST)
  const birthdayClients = (allClients ?? []).filter((c: any) => {
    if (!c.birth_date) return false
    const d = new Date(c.birth_date)
    return d.getMonth() + 1 === today.month && d.getDate() === today.day
  })

  if (!birthdayClients.length) return 0

  // Idempotency: exclude clients already dispatched today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: existing } = await admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString())

  const alreadySent = new Set((existing ?? []).map((d: any) => d.client_id))
  const toSend = birthdayClients.filter((c: any) => !alreadySent.has(c.id))

  if (!toSend.length) return 0
  return sendBatch(camp, toSend, admin)
}

// -- Days after visit ----------------------------------------------------

async function processVisitCampaign(
  camp: NotificationCampaign,
  targetDate: Date,
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0)
  const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999)

  const { data: appts } = await admin
    .from('appointments')
    .select('client_id, clients!inner(id, name), branches!inner(tenant_id)')
    .eq('branches.tenant_id', camp.tenant_id)
    .eq('status', 'COMPLETED')
    .gte('completed_at', dayStart.toISOString())
    .lte('completed_at', dayEnd.toISOString())

  const seen = new Set<string>()
  const clients: { id: string; name: string }[] = []

  for (const a of (appts ?? []) as any[]) {
    if (a.clients && !seen.has(a.client_id)) {
      seen.add(a.client_id)
      clients.push({ id: a.client_id, name: a.clients.name })
    }
  }
  if (!clients.length) return 0

  // Idempotency
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: existing } = await admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString())

  const alreadySent = new Set((existing ?? []).map((d: any) => d.client_id))
  const toSend = clients.filter(c => !alreadySent.has(c.id))
  if (!toSend.length) return 0
  return sendBatch(camp, toSend, admin)
}

// -- Days before package expiry ------------------------------------------

async function processExpiryCampaign(
  camp: NotificationCampaign,
  targetDate: Date,
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0)
  const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999)

  const { data: pkgs } = await admin
    .from('client_packages')
    .select('client_id, clients!inner(id, name, tenant_id)')
    .eq('clients.tenant_id', camp.tenant_id)
    .gte('expires_at', dayStart.toISOString())
    .lte('expires_at', dayEnd.toISOString())

  const seen = new Set<string>()
  const clients: { id: string; name: string }[] = []

  for (const p of (pkgs ?? []) as any[]) {
    if (p.clients && !seen.has(p.client_id)) {
      seen.add(p.client_id)
      clients.push({ id: p.client_id, name: p.clients.name })
    }
  }
  if (!clients.length) return 0

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: existing } = await admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString())

  const alreadySent = new Set((existing ?? []).map((d: any) => d.client_id))
  const toSend = clients.filter(c => !alreadySent.has(c.id))
  if (!toSend.length) return 0
  return sendBatch(camp, toSend, admin)
}

// -- Appointment reminder: agendamentos que ocorrem em ~N horas ------------

async function processAppointmentReminderCampaign(
  camp: NotificationCampaign,
  windowStart: Date,
  windowEnd: Date,
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  // Busca agendamentos cujo scheduled_at cai dentro da janela
  const { data: appts } = await admin
    .from('appointments')
    .select('client_id, scheduled_at, clients!inner(id, name), branches!inner(tenant_id)')
    .eq('branches.tenant_id', camp.tenant_id)
    .in('status', ['SCHEDULED', 'CONFIRMED'])
    .gte('scheduled_at', windowStart.toISOString())
    .lt('scheduled_at', windowEnd.toISOString())

  if (!appts?.length) return 0

  // Dedup: um lembrete por cliente por execução do cron (mesmo que tenha 2 agendamentos na janela)
  const seen = new Set<string>()
  const clients: { id: string; name: string; scheduled_at: string }[] = []
  for (const a of appts as any[]) {
    if (a.clients && !seen.has(a.client_id)) {
      seen.add(a.client_id)
      clients.push({ id: a.client_id, name: a.clients.name, scheduled_at: a.scheduled_at })
    }
  }

  // Idempotência: não enviar mais de um lembrete desta campanha ao mesmo cliente hoje
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: existing } = await admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString())

  const alreadySent = new Set((existing ?? []).map((d: any) => d.client_id))
  const toSend = clients.filter(c => !alreadySent.has(c.id))
  if (!toSend.length) return 0

  return sendBatch(camp, toSend, admin)
}

// -- Shared batch sender -------------------------------------------------

async function sendBatch(
  camp: NotificationCampaign,
  clients: { id: string; name: string }[],
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const BATCH = 100
  let sent = 0

  for (let i = 0; i < clients.length; i += BATCH) {
    const batch = clients.slice(i, i + BATCH)

    const notifications = batch.map(c => ({
      client_id: c.id,
      title:     applyTemplate(camp.title, c.name),
      body:      applyTemplate(camp.body, c.name),
      type:      camp.notification_type,
      data:      { campaign_id: camp.id },
      is_read:   false,
    }))

    const { data: inserted } = await admin
      .from('client_notifications')
      .insert(notifications)
      .select('id, client_id')

    if (inserted?.length) {
      await admin.from('campaign_dispatches').insert(
        inserted.map((n: any) => ({
          campaign_id:     camp.id,
          client_id:       n.client_id,
          notification_id: n.id,
          status:          'SENT',
        })),
      )
      sent += inserted.length
    }

    // Web Push (browser/PWA)
    await sendWebPushBatch(batch, camp.title, camp.body, admin)
    // FCM native push (Android/iOS app)
    await sendFcmBatch(batch, camp.title, camp.body, admin)
  }

  return sent
}

async function sendWebPushBatch(
  clients: { id: string; name: string }[],
  titleTpl: string,
  bodyTpl: string,
  admin: ReturnType<typeof createAdminClient>,
) {
  const { data: subs } = await admin
    .from('web_push_subscriptions')
    .select('client_id, endpoint, keys')
    .in('client_id', clients.map(c => c.id))

  if (!subs?.length) return

  await Promise.allSettled(
    subs.map((sub: any) => {
      const client = clients.find(c => c.id === sub.client_id)
      if (!client) return Promise.resolve()
      return webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({
          title: applyTemplate(titleTpl, client.name),
          body:  applyTemplate(bodyTpl,  client.name),
        }),
      )
    }),
  )
}

function applyTemplate(text: string, clientName: string): string {
  const firstName = clientName.split(' ')[0] ?? clientName
  return text.replace(/\{\{first_name\}\}/g, firstName)
}

// -- FCM HTTP v1 batch (mirrors sendWebPushBatch) -----------------------

let _fcmToken: string | null = null
let _fcmExpiry = 0

async function getFcmToken(): Promise<string | null> {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!sa) return null
  if (_fcmToken && Date.now() < _fcmExpiry) return _fcmToken
  try {
    const auth = new GoogleAuth({
      credentials: JSON.parse(sa),
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    const client = await auth.getClient()
    const res = await client.getAccessToken()
    _fcmToken  = res.token ?? null
    _fcmExpiry = Date.now() + 55 * 60 * 1000
    return _fcmToken
  } catch { return null }
}

async function sendFcmBatch(
  clients: { id: string; name: string }[],
  titleTpl: string,
  bodyTpl: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data: rows } = await admin
    .from('push_tokens')
    .select('token, client_id')
    .in('client_id', clients.map(c => c.id))

  if (!rows?.length) return

  const sa = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!sa) return
  const projectId = (JSON.parse(sa) as { project_id: string }).project_id
  const accessToken = await getFcmToken()
  if (!accessToken) return

  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  await Promise.allSettled(
    rows.map((r: any) => {
      const client = clients.find(c => c.id === r.client_id)
      if (!client) return Promise.resolve()
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: r.token,
            notification: {
              title: applyTemplate(titleTpl, client.name),
              body:  applyTemplate(bodyTpl,  client.name),
            },
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      })
    }),
  )
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth()      === b.getMonth()
    && a.getDate()       === b.getDate()
}
