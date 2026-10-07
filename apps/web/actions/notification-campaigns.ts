'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, contar } from '@/lib/db'
import { dispatchCampaignInline } from '@/lib/notifications/disparo-de-campanha'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'

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
  assertPermission(ctx, 'marketing', 'VIEW')

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
  assertPermission(ctx, 'marketing', 'VIEW')

  const admin = createAdminClient()
  const [{ data: camp, error }, dispatches] = await Promise.all([
    admin.from('notification_campaigns').select('*').eq('id', id).eq('tenant_id', ctx.tenantId!).single(),
    ler(admin
      .from('campaign_dispatches')
      .select('sent_at, status, client_id, clients(name)')
      .eq('campaign_id', id)
      .order('sent_at', { ascending: false })
      .limit(20), 'carregar os disparos da campanha'),
  ])

  if (error || !camp) throw new Error('Campanha não encontrada')

  return {
    campaign: camp as NotificationCampaign,
    dispatches: ((dispatches ?? []) as unknown as { sent_at: string; status: string; clients: { name?: string } | null }[]).map(d => ({
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
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')

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
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')

  const admin = createAdminClient()

  // Só rascunho ou pausada. `maybeSingle`: id que não existe é "não
  // encontrado", não exceção dentro de `ler` (erro 500).
  const existing = await ler(admin
    .from('notification_campaigns')
    .select('status, tenant_id')
    .eq('id', id)
    .maybeSingle(), 'buscar a campanha')

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
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')
  // No modo suporte nada sai para o paciente (decisão do Heitor).
  const travado = bloqueioDoSuporte(ctx, 'disparar campanha')
  if (travado) return { error: travado }

  const admin = createAdminClient()
  const camp = await ler(admin
    .from('notification_campaigns')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a campanha')

  if (!camp) return { error: 'Campanha não encontrada' }
  if (!['DRAFT', 'PAUSED'].includes(camp.status)) return { error: 'Campanha já está ativa ou arquivada' }

  if (camp.type === 'IMMEDIATE') {
    // Dispatch inline
    const result = await dispatchCampaignInline(camp as NotificationCampaign, ctx.tenantId!)
    if (result.error) return { error: result.error }

    await gravar(admin
      .from('notification_campaigns')
      .update({ status: 'COMPLETED', last_run_at: new Date().toISOString(), total_sent: result.sent })
      .eq('id', id), 'salvar a campanha')
  } else {
    await gravar(admin
      .from('notification_campaigns')
      .update({ status: 'ACTIVE' })
      .eq('id', id), 'salvar a campanha')
  }

  revalidatePath('/admin/notificacoes')
  revalidatePath(`/admin/notificacoes/${id}`)
  return {}
}

export async function pauseCampaign(id: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')

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
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')

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
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')

  const admin = createAdminClient()

  // Only DRAFT or ARCHIVED campaigns can be deleted
  const campaign = await ler(admin
    .from('notification_campaigns')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a campanha')

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
  assertPermission(ctx, 'marketing', 'MANAGE')

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

  // Contagem que falha não pode virar "0 clientes": quem monta a campanha
  // concluiria que o público está vazio.
  let result = await contar(query, 'contar o público da campanha')

  // procedure_ids filter: clientes com appointments nesses procedimentos
  if (rules.procedure_ids?.length) {
    const apptClients = await ler(admin
      .from('appointments')
      .select('client_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', ctx.tenantId!)
      .in('procedure_id', rules.procedure_ids)
      .eq('status', 'COMPLETED'), 'carregar os agendamentos')

    const clientsWithProc = new Set(((apptClients ?? []) as { client_id: string }[]).map(a => a.client_id))
    // This is an over-approximation without a subquery; use count from the base query
    // filtered by intersection — for preview purposes this is acceptable
    const procCount = await contar(admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .in('id', [...clientsWithProc].slice(0, 400)), 'contar o público com o procedimento')

    result = Math.min(result, procCount)
  }

  return { count: result }
}

