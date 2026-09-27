import webpush from 'web-push'
import { GoogleAuth } from 'google-auth-library'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchCampaignInline } from '@/actions/notification-campaigns'
import type { NotificationCampaign } from '@/actions/notification-campaigns'
import { gravar, ler } from '@/lib/db'
import { partsInTZ, startOfDayTZ, endOfDayTZ, addDaysTZ, dayKeyTZ } from '@/lib/datetime'

/** Cliente de uma campanha: quem recebe, e o nome para o {{first_name}}. */
type Destinatario = { id: string; name: string }

function getWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  return webpush
}

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
  const hoje  = partsInTZ(now)
  const today = { month: hoje.month, day: hoje.day }

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

    // -- BIRTHDAY ---------------------------------------------
    if (camp.trigger_type === 'BIRTHDAY') {
      const sent = await processBirthdayCampaign(camp, today, admin)
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
      if (camp.last_run_at && isSameDay(new Date(camp.last_run_at), now)) {
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

      const targetDate = addDaysTZ(now, -cfg.days)
      const sent = await processVisitCampaign(camp, targetDate, admin)
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

      const targetDate = addDaysTZ(now, cfg.days)
      const sent = await processExpiryCampaign(camp, targetDate, admin)
      await gravar(admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString(), total_sent: camp.total_sent + sent })
        .eq('id', camp.id), 'atualizar a campanha')
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

// -- Birthday: send to clients whose birth_date month/day == today ------

async function processBirthdayCampaign(
  camp: NotificationCampaign,
  today: { month: number; day: number },
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const rules = camp.audience_rules

  // `birth_date` TEM de vir no select: o filtro abaixo é por ela. Sem ela, a
  // lista de aniversariantes saía sempre vazia e a campanha de aniversário
  // nunca mandou nada — o `any` do filtro escondia (2026-09-27).
  let query = admin
    .from('clients')
    .select('id, name, birth_date, auth_id')
    .eq('tenant_id', camp.tenant_id)
    .eq('is_active', true)
    .not('birth_date', 'is', null)

  if (rules.branch_ids?.length) query = query.in('branch_id', rules.branch_ids)

  const allClients = await ler(query.limit(5000), 'carregar os clientes com aniversário')

  // Mês e dia lidos do TEXTO da data ('1990-09-27'). `new Date('1990-09-27')` é
  // meia-noite em UTC, que em São Paulo ainda é o dia 26 — a campanha sairia
  // na véspera.
  //
  // "Só quem tem o app" também é filtrado aqui: o `.not('auth_id', …)`
  // condicional no builder estoura a inferência de tipo do Supabase (TS2589).
  const birthdayClients: Destinatario[] = ((allClients ?? []) as { id: string; name: string; birth_date: string | null; auth_id: string | null }[])
    .filter(c => {
      if (!c.birth_date) return false
      if (rules.has_app_account && !c.auth_id) return false
      return Number(c.birth_date.slice(5, 7)) === today.month && Number(c.birth_date.slice(8, 10)) === today.day
    })
    .map(c => ({ id: c.id, name: c.name }))

  if (!birthdayClients.length) return 0

  // Idempotency: exclude clients already dispatched today
  const todayStart = startOfDayTZ(new Date())

  const existing = await ler(admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString()), 'carregar os disparos')

  const alreadySent = new Set(((existing ?? []) as { client_id: string }[]).map(d => d.client_id))
  const toSend = birthdayClients.filter(c => !alreadySent.has(c.id))

  if (!toSend.length) return 0
  return sendBatch(camp, toSend, admin)
}

// -- Days after visit ----------------------------------------------------

async function processVisitCampaign(
  camp: NotificationCampaign,
  targetDate: Date,
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const dayStart = startOfDayTZ(targetDate)
  const dayEnd   = endOfDayTZ(targetDate)

  const appts = await ler(admin
    .from('appointments')
    .select('client_id, clients!inner(id, name), branches!inner(tenant_id)')
    .eq('branches.tenant_id', camp.tenant_id)
    .eq('status', 'COMPLETED')
    .gte('completed_at', dayStart.toISOString())
    .lte('completed_at', dayEnd.toISOString()), 'carregar os agendamentos')

  const seen = new Set<string>()
  const clients: Destinatario[] = []

  for (const a of (appts ?? []) as unknown as { client_id: string; clients: { name: string } | null }[]) {
    if (a.clients && !seen.has(a.client_id)) {
      seen.add(a.client_id)
      clients.push({ id: a.client_id, name: a.clients.name })
    }
  }
  if (!clients.length) return 0

  // Idempotency
  const todayStart = startOfDayTZ(new Date())
  const existing = await ler(admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString()), 'carregar os disparos')

  const alreadySent = new Set(((existing ?? []) as { client_id: string }[]).map(d => d.client_id))
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
  const dayStart = startOfDayTZ(targetDate)
  const dayEnd   = endOfDayTZ(targetDate)

  const pkgs = await ler(admin
    .from('client_packages')
    .select('client_id, clients!inner(id, name, tenant_id)')
    .eq('clients.tenant_id', camp.tenant_id)
    .gte('expires_at', dayStart.toISOString())
    .lte('expires_at', dayEnd.toISOString()), 'carregar os pacotes do cliente')

  const seen = new Set<string>()
  const clients: Destinatario[] = []

  for (const p of (pkgs ?? []) as unknown as { client_id: string; clients: { name: string } | null }[]) {
    if (p.clients && !seen.has(p.client_id)) {
      seen.add(p.client_id)
      clients.push({ id: p.client_id, name: p.clients.name })
    }
  }
  if (!clients.length) return 0

  const todayStart = startOfDayTZ(new Date())
  const existing = await ler(admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString()), 'carregar os disparos')

  const alreadySent = new Set(((existing ?? []) as { client_id: string }[]).map(d => d.client_id))
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
  const appts = await ler(admin
    .from('appointments')
    .select('client_id, scheduled_at, clients!inner(id, name), branches!inner(tenant_id)')
    .eq('branches.tenant_id', camp.tenant_id)
    .in('status', ['SCHEDULED', 'CONFIRMED'])
    .gte('scheduled_at', windowStart.toISOString())
    .lt('scheduled_at', windowEnd.toISOString()), 'carregar os agendamentos')

  if (!appts?.length) return 0

  // Dedup: um lembrete por cliente por execução do cron (mesmo que tenha 2 agendamentos na janela)
  const seen = new Set<string>()
  const clients: { id: string; name: string; scheduled_at: string }[] = []
  for (const a of appts as unknown as { client_id: string; scheduled_at: string; clients: { name: string } | null }[]) {
    if (a.clients && !seen.has(a.client_id)) {
      seen.add(a.client_id)
      clients.push({ id: a.client_id, name: a.clients.name, scheduled_at: a.scheduled_at })
    }
  }

  // Idempotência: não enviar mais de um lembrete desta campanha ao mesmo cliente hoje
  const todayStart = startOfDayTZ(new Date())
  const existing = await ler(admin
    .from('campaign_dispatches')
    .select('client_id')
    .eq('campaign_id', camp.id)
    .gte('sent_at', todayStart.toISOString()), 'carregar os disparos')

  const alreadySent = new Set(((existing ?? []) as { client_id: string }[]).map(d => d.client_id))
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

    const inserted = await ler(admin
      .from('client_notifications')
      .insert(notifications)
      .select('id, client_id'), 'carregar as notificações')

    if (inserted?.length) {
      await gravar(admin.from('campaign_dispatches').insert(
        (inserted as { id: string; client_id: string }[]).map(n => ({
          campaign_id:     camp.id,
          client_id:       n.client_id,
          notification_id: n.id,
          status:          'SENT',
        })),
      ), 'registrar os disparos da campanha')
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
  const subs = await ler(admin
    .from('web_push_subscriptions')
    .select('client_id, endpoint, keys')
    .in('client_id', clients.map(c => c.id)), 'carregar as inscrições de notificações')

  if (!subs?.length) return

  await Promise.allSettled(
    (subs as { client_id: string; endpoint: string; keys: { p256dh: string; auth: string } }[]).map(sub => {
      const client = clients.find(c => c.id === sub.client_id)
      if (!client) return Promise.resolve()
      return getWebPush().sendNotification(
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
  const rows = await ler(admin
    .from('push_tokens')
    .select('token, client_id')
    .in('client_id', clients.map(c => c.id)), 'carregar os aparelhos')

  if (!rows?.length) return

  const sa = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!sa) return
  const projectId = (JSON.parse(sa) as { project_id: string }).project_id
  const accessToken = await getFcmToken()
  if (!accessToken) return

  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  await Promise.allSettled(
    (rows as { token: string; client_id: string }[]).map(r => {
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

/** Mesmo dia no fuso da clínica — o do processo não entra na conta. */
function isSameDay(a: Date, b: Date): boolean {
  return dayKeyTZ(a) === dayKeyTZ(b)
}
