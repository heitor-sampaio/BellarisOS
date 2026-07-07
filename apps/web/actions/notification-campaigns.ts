'use server'

import webpush from 'web-push'
import { GoogleAuth } from 'google-auth-library'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function getWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  return webpush
}

// -- Types --------------------------------------------------------------

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
export type CampaignType   = 'IMMEDIATE' | 'SCHEDULED' | 'AUTOMATED'
export type TriggerType    = 'BIRTHDAY' | 'ANNUAL_DATE' | 'DAYS_AFTER_VISIT' | 'DAYS_BEFORE_EXPIRY' | 'BEFORE_APPOINTMENT'

export type AudienceRules = {
  branch_ids?:           string[]
  genders?:              ('M' | 'F' | 'O')[]
  procedure_ids?:        string[]
  tags?:                 string[]
  has_app_account?:      boolean
  max_days_since_visit?: number
  min_visits?:           number
}

export type NotificationCampaign = {
  id:                string
  tenant_id:         string
  name:              string
  description:       string | null
  status:            CampaignStatus
  type:              CampaignType
  title:             string
  body:              string
  notification_type: string
  scheduled_at:      string | null
  trigger_type:      TriggerType | null
  trigger_config:    Record<string, unknown> | null
  audience_rules:    AudienceRules
  channels:          string[]
  total_sent:        number
  total_read:        number
  created_by:        string | null
  created_at:        string
  updated_at:        string
  last_run_at:       string | null
}

export type CreateCampaignInput = {
  name:              string
  description?:      string
  type:              CampaignType
  title:             string
  body:              string
  notification_type: string
  scheduled_at?:     string
  trigger_type?:     TriggerType
  trigger_config?:   Record<string, unknown>
  audience_rules:    AudienceRules
  channels?:         string[]
}

// -- List ---------------------------------------------------------------

export async function listCampaigns(): Promise<{
  campaigns: NotificationCampaign[]
  totalSent: number
  activeCount: number
}> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notification_campaigns')
    .select('*')
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const campaigns = (data ?? []) as NotificationCampaign[]
  const totalSent  = campaigns.reduce((s, c) => s + c.total_sent, 0)
  const activeCount = campaigns.filter(c => c.status === 'ACTIVE').length

  return { campaigns, totalSent, activeCount }
}

// -- Get one ------------------------------------------------------------

export async function getCampaign(id: string): Promise<{
  campaign: NotificationCampaign
  dispatches: { client_name: string; sent_at: string; status: string }[]
}> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  const [{ data: camp, error }, { data: dispatches }] = await Promise.all([
    admin.from('notification_campaigns').select('*').eq('id', id).eq('tenant_id', ctx.tenantId!).single(),
    admin
      .from('campaign_dispatches')
      .select('sent_at, status, client_id, clients(name)')
      .eq('campaign_id', id)
      .order('sent_at', { ascending: false })
      .limit(20),
  ])

  if (error || !camp) throw new Error('Campanha não encontrada')

  return {
    campaign: camp as NotificationCampaign,
    dispatches: (dispatches ?? []).map((d: any) => ({
      client_name: d.clients?.name ?? '—',
      sent_at:     d.sent_at,
      status:      d.status,
    })),
  }
}

// -- Create -------------------------------------------------------------

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notification_campaigns')
    .insert({
      tenant_id:         ctx.tenantId!,
      created_by:        ctx.userId,
      status:            'DRAFT',
      channels:          input.channels ?? ['in_app'],
      name:              input.name.trim(),
      description:       input.description?.trim() ?? null,
      type:              input.type,
      title:             input.title.trim(),
      body:              input.body.trim(),
      notification_type: input.notification_type,
      scheduled_at:      input.scheduled_at ?? null,
      trigger_type:      input.trigger_type ?? null,
      trigger_config:    input.trigger_config ?? null,
      audience_rules:    input.audience_rules,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Erro ao criar campanha' }
  revalidatePath('/admin/notificacoes')
  return { id: data.id }
}

// -- Update -------------------------------------------------------------

export async function updateCampaign(
  id: string,
  input: Partial<CreateCampaignInput>,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()

  // Only allow editing DRAFT or PAUSED campaigns
  const { data: existing } = await admin
    .from('notification_campaigns')
    .select('status, tenant_id')
    .eq('id', id)
    .single()

  if (!existing || existing.tenant_id !== ctx.tenantId!) return { error: 'Não encontrado' }
  if (!['DRAFT', 'PAUSED'].includes(existing.status))
    return { error: 'Apenas campanhas em rascunho ou pausadas podem ser editadas' }

  const { error } = await admin
    .from('notification_campaigns')
    .update({
      ...(input.name              !== undefined && { name: input.name.trim() }),
      ...(input.description       !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.title             !== undefined && { title: input.title.trim() }),
      ...(input.body              !== undefined && { body: input.body.trim() }),
      ...(input.notification_type !== undefined && { notification_type: input.notification_type }),
      ...(input.scheduled_at      !== undefined && { scheduled_at: input.scheduled_at }),
      ...(input.trigger_type      !== undefined && { trigger_type: input.trigger_type }),
      ...(input.trigger_config    !== undefined && { trigger_config: input.trigger_config }),
      ...(input.audience_rules    !== undefined && { audience_rules: input.audience_rules }),
      ...(input.channels          !== undefined && { channels: input.channels }),
    })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { error: error.message }
  revalidatePath('/admin/notificacoes')
  revalidatePath(`/admin/notificacoes/${id}`)
  return {}
}

// -- Status transitions --------------------------------------------------

export async function activateCampaign(id: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  const { data: camp } = await admin
    .from('notification_campaigns')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  if (!camp) return { error: 'Campanha não encontrada' }
  if (!['DRAFT', 'PAUSED'].includes(camp.status)) return { error: 'Campanha já está ativa ou arquivada' }

  if (camp.type === 'IMMEDIATE') {
    // Dispatch inline
    const result = await dispatchCampaignInline(camp as NotificationCampaign, ctx.tenantId!)
    if (result.error) return { error: result.error }

    await admin
      .from('notification_campaigns')
      .update({ status: 'COMPLETED', last_run_at: new Date().toISOString(), total_sent: result.sent })
      .eq('id', id)
  } else {
    await admin
      .from('notification_campaigns')
      .update({ status: 'ACTIVE' })
      .eq('id', id)
  }

  revalidatePath('/admin/notificacoes')
  revalidatePath(`/admin/notificacoes/${id}`)
  return {}
}

export async function pauseCampaign(id: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  const { error } = await admin
    .from('notification_campaigns')
    .update({ status: 'PAUSED' })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .eq('status', 'ACTIVE')

  if (error) return { error: error.message }
  revalidatePath('/admin/notificacoes')
  revalidatePath(`/admin/notificacoes/${id}`)
  return {}
}

export async function archiveCampaign(id: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  const { error } = await admin
    .from('notification_campaigns')
    .update({ status: 'ARCHIVED' })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { error: error.message }
  revalidatePath('/admin/notificacoes')
  return {}
}

export async function deleteCampaign(id: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()

  // Only DRAFT or ARCHIVED campaigns can be deleted
  const { data: campaign } = await admin
    .from('notification_campaigns')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .single()

  if (!campaign) return { error: 'Campanha não encontrada' }
  if (!['DRAFT', 'ARCHIVED'].includes(campaign.status)) {
    return { error: 'Apenas campanhas em rascunho ou arquivadas podem ser removidas' }
  }

  const { error } = await admin
    .from('notification_campaigns')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { error: error.message }
  redirect('/admin/notificacoes')
}

// -- Audience preview ---------------------------------------------------

export async function previewAudienceCount(
  rules: AudienceRules,
): Promise<{ count: number }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()
  let query = admin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)

  if (rules.branch_ids?.length) {
    query = query.in('branch_id', rules.branch_ids)
  }
  if (rules.genders?.length) {
    query = query.in('gender', rules.genders)
  }
  if (rules.tags?.length) {
    query = query.overlaps('tags', rules.tags)
  }
  if (rules.has_app_account === true) {
    query = query.not('auth_id', 'is', null)
  }

  const { count, error } = await query
  if (error) return { count: 0 }

  let result = count ?? 0

  // procedure_ids filter: clientes com appointments nesses procedimentos
  if (rules.procedure_ids?.length) {
    const { data: apptClients } = await admin
      .from('appointments')
      .select('client_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', ctx.tenantId!)
      .in('procedure_id', rules.procedure_ids)
      .eq('status', 'COMPLETED')

    const clientsWithProc = new Set((apptClients ?? []).map((a: any) => a.client_id))
    // This is an over-approximation without a subquery; use count from the base query
    // filtered by intersection — for preview purposes this is acceptable
    const { count: procCount } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .in('id', [...clientsWithProc].slice(0, 400))

    result = Math.min(result, procCount ?? 0)
  }

  return { count: result }
}

// -- Internal dispatch --------------------------------------------------
// Used by activateCampaign (IMMEDIATE) and by the cron route.

export async function dispatchCampaignInline(
  campaign: NotificationCampaign,
  tenantId: string,
): Promise<{ sent: number; error?: string }> {
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
    const { data: apptClients } = await admin
      .from('appointments')
      .select('client_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenantId)
      .in('procedure_id', rules.procedure_ids)
      .eq('status', 'COMPLETED')

    const set = new Set((apptClients ?? []).map((a: any) => a.client_id))
    eligibleClients = eligibleClients.filter((c: any) => set.has(c.id))
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

    const { data: inserted } = await admin
      .from('client_notifications')
      .insert(notifications)
      .select('id, client_id')

    if (inserted?.length) {
      const dispatches = inserted.map((n: any) => ({
        campaign_id:     campaign.id,
        client_id:       n.client_id,
        notification_id: n.id,
        status:          'SENT',
      }))
      await admin.from('campaign_dispatches').insert(dispatches)
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
  const { data: subs } = await admin
    .from('web_push_subscriptions')
    .select('client_id, endpoint, keys')
    .in('client_id', clients.map(c => c.id))

  if (!subs?.length) return

  await Promise.allSettled(
    subs.map((sub: any) => {
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

async function getFcmAccessToken(): Promise<string | null> {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!sa) return null
  if (_fcmAccessToken && Date.now() < _fcmTokenExpiry) return _fcmAccessToken
  try {
    const auth = new GoogleAuth({
      credentials: JSON.parse(sa),
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    const client = await auth.getClient()
    const res = await client.getAccessToken()
    _fcmAccessToken = res.token ?? null
    _fcmTokenExpiry = Date.now() + 55 * 60 * 1000  // 55 min cache
    return _fcmAccessToken
  } catch { return null }
}

async function sendFcmBatch(
  clients: { id: string; name: string }[],
  titleTpl: string,
  bodyTpl: string,
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data: rows } = await adminClient
    .from('push_tokens')
    .select('token, client_id')
    .in('client_id', clients.map(c => c.id))

  if (!rows?.length) return

  const sa = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!sa) return
  const projectId = (JSON.parse(sa) as { project_id: string }).project_id
  const accessToken = await getFcmAccessToken()
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
