import webpush from 'web-push'
import { GoogleAuth } from 'google-auth-library'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import type { NotificationCampaign } from '@/actions/notification-campaigns'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'

/**
 * O DISPARO de uma campanha (notificação + Web Push + FCM) para o público dela.
 *
 * Morava em `actions/notification-campaigns.ts` e era EXPORTADO de um arquivo
 * `'use server'` — ou seja, um endpoint público que recebia a campanha e a rede
 * como argumento, sem conferir ninguém: qualquer pessoa disparava notificação
 * para os clientes de qualquer rede (achado em 2026-10-03). Fora de
 * `'use server'`, só quem o importa no servidor o chama: `activateCampaign`
 * (que confere `marketing: MANAGE`) e o cron (que confere o `CRON_SECRET`).
 */

function getWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  return webpush
}

// -- Internal dispatch --------------------------------------------------
// Used by activateCampaign (IMMEDIATE) and by the cron route.

export async function dispatchCampaignInline(
  campaign: NotificationCampaign,
  tenantId: string,
): Promise<{ sent: number; error?: string }> {
  // Rede bloqueada (assinatura): campanha não sai.
  if (await redeEstaBloqueada(tenantId)) return { sent: 0, error: 'A rede está bloqueada (assinatura).' }
  const admin = createAdminClient()
  const rules = campaign.audience_rules

  // Build client query
  let query = admin
    .from('clients')
    .select('id, name, auth_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (rules.branch_ids?.length)  query = query.in('branch_id', rules.branch_ids)
  if (rules.genders?.length)     query = query.in('gender', rules.genders)
  if (rules.tags?.length)        query = query.overlaps('tags', rules.tags)
  if (rules.has_app_account)     query = query.not('auth_id', 'is', null)

  const { data: clients, error } = await query.limit(2000)
  if (error) return { sent: 0, error: error.message }

  let eligibleClients = clients ?? []

  // Filter by procedure history if needed
  if (rules.procedure_ids?.length) {
    const apptClients = await ler(admin
      .from('appointments')
      .select('client_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenantId)
      .in('procedure_id', rules.procedure_ids)
      .eq('status', 'COMPLETED'), 'carregar os agendamentos')

    const set = new Set(((apptClients ?? []) as { client_id: string }[]).map(a => a.client_id))
    eligibleClients = eligibleClients.filter(c => set.has(c.id))
  }

  if (eligibleClients.length === 0) return { sent: 0 }

  // Batch insert
  const BATCH = 100
  let sent = 0

  for (let i = 0; i < eligibleClients.length; i += BATCH) {
    const batch = eligibleClients.slice(i, i + BATCH) as { id: string; name: string }[]

    const notifications = batch.map(client => ({
      client_id: client.id,
      title:     applyTemplate(campaign.title, client.name),
      body:      applyTemplate(campaign.body, client.name),
      type:      campaign.notification_type,
      data:      { campaign_id: campaign.id },
      is_read:   false,
    }))

    const inserted = await ler(admin
      .from('client_notifications')
      .insert(notifications)
      .select('id, client_id'), 'carregar as notificações')

    if (inserted?.length) {
      const dispatches = (inserted as { id: string; client_id: string }[]).map(n => ({
        campaign_id:     campaign.id,
        client_id:       n.client_id,
        notification_id: n.id,
        status:          'SENT',
      }))
      await gravar(admin.from('campaign_dispatches').insert(dispatches), 'registrar os disparos da campanha')
      sent += inserted.length
    }

    // Web Push (browser/PWA)
    await sendWebPush(batch, campaign.title, campaign.body, admin)
    // FCM native push (Android/iOS app)
    await sendFcmBatch(batch, campaign.title, campaign.body, admin)
  }

  return { sent }
}

async function sendWebPush(
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
      const payload = JSON.stringify({
        title: applyTemplate(titleTpl, client.name),
        body:  applyTemplate(bodyTpl,  client.name),
      })
      return getWebPush().sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
      )
    }),
  )
}

function applyTemplate(text: string, clientName: string): string {
  const firstName = clientName.split(' ')[0] ?? clientName
  return text.replace(/\{\{first_name\}\}/g, firstName)
}

// -- FCM HTTP v1 dispatch (native Android/iOS push) ----------------------

let _fcmAccessToken: string | null = null
let _fcmTokenExpiry = 0
let _fcmProjectId: string | null = null

function parseServiceAccount(raw: string): Record<string, unknown> {
  // Try multiple formats in order of likelihood
  const candidates = [
    raw.trim(),
    // strip single-quote wrapper: '{...}'
    raw.trim().replace(/^'([\s\S]*)'$/, '$1'),
    // strip double-quote wrapper: "{...}" → then unescape inner \"
    raw.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/\\"/g, '"'),
  ]

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.private_key === 'string') {
          parsed.private_key = (parsed.private_key as string).replace(/\\n/g, '\n')
        }
        return parsed
      }
    } catch { /* try next */ }
  }

  throw new Error(
    `GOOGLE_SERVICE_ACCOUNT is not valid JSON. First 40 chars: ${JSON.stringify(raw.trim().slice(0, 40))}`
  )
}

async function getFcmReady(): Promise<{ accessToken: string; projectId: string } | null> {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!sa) return null
  // Re-parse only when token is expired — also refreshes projectId
  if (_fcmAccessToken && _fcmProjectId && Date.now() < _fcmTokenExpiry) {
    return { accessToken: _fcmAccessToken, projectId: _fcmProjectId }
  }
  try {
    const creds = parseServiceAccount(sa)
    _fcmProjectId = (creds.project_id as string) ?? null
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    const client = await auth.getClient()
    const res = await client.getAccessToken()
    _fcmAccessToken = res.token ?? null
    _fcmTokenExpiry = Date.now() + 55 * 60 * 1000
    if (!_fcmAccessToken || !_fcmProjectId) return null
    return { accessToken: _fcmAccessToken, projectId: _fcmProjectId }
  } catch (e) {
    console.error('[FCM]', e)
    return null
  }
}

async function sendFcmBatch(
  clients: { id: string; name: string }[],
  titleTpl: string,
  bodyTpl: string,
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const rows = await ler(adminClient
    .from('push_tokens')
    .select('token, client_id')
    .in('client_id', clients.map(c => c.id)), 'carregar os aparelhos')

  if (!rows?.length) return

  const fcm = await getFcmReady()
  if (!fcm) return

  const { accessToken, projectId } = fcm
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  await Promise.allSettled(
    (rows as { token: string; client_id: string }[]).map(async r => {
      const client = clients.find(c => c.id === r.client_id)
      if (!client) return
      const res = await fetch(endpoint, {
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
      if (!res.ok) {
        const body = await res.text()
        console.error(`[FCM] send failed — client=${r.client_id} token=...${r.token.slice(-8)} status=${res.status}:`, body)
        // Token inválido (UNREGISTERED / NOT_FOUND) → limpar do banco
        if (res.status === 404 || body.includes('UNREGISTERED') || body.includes('NOT_FOUND')) {
          await adminClient.from('push_tokens').delete().eq('token', r.token)
        }
      }
    }),
  )
}

