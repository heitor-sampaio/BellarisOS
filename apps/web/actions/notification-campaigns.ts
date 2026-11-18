'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { recusaDaConfigDaRede } from '@/lib/configuracao-da-rede'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { dispatchCampaignInline } from '@/lib/notifications/disparo-de-campanha'
import { contarPublico, contarPublicoComAparelho } from '@/lib/clientes/publico'
import { filtrosDaCampanha } from '@/lib/notifications/filtros-da-campanha'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { instanteDaCampanha } from '@/lib/notifications/hora-da-campanha'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { recusaDoTipoDaCampanha, type TipoDeCampanha } from '@/lib/notifications/tipo-da-campanha'

// -- Types --------------------------------------------------------------

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
/** MK1 (2026-11-14): Imediata ou Agendada — lib/notifications/tipo-da-campanha. */
export type CampaignType   = TipoDeCampanha
/** A agendada de todo ano numa data; a campanha não tem outro gatilho (MK1). */
export type TriggerType    = 'ANNUAL_DATE'

/** O público (MK2 do Bloco Tags, 2026-11-14: sem filtro de unidade — a cliente é da rede). */
export type AudienceRules = {
  genders?:              ('M' | 'F' | 'O')[]
  procedure_ids?:        string[]
  tags?:                 string[]
  has_app_account?:      boolean
  max_days_since_visit?: number
  min_visits?:           number
  /** A15/A37 da 15ª: só estas clientes ("Clientes específicas"), escolhidas pela busca. */
  client_ids?:           string[]
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
  // A campanha é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  // MK1: Imediata ou Agendada (numa data e hora, ou todo ano numa data). O
  // gatilho de cada cliente é um modelo nas Automações.
  const doTipo = recusaDoTipoDaCampanha(input)
  if (doTipo) return { error: doTipo }

  // F64 (D4): a hora digitada é a do relógio da REDE — ia crua e o banco a lia como UTC.
  let agendada: string | null = null
  if (input.scheduled_at) {
    agendada = instanteDaCampanha(input.scheduled_at, await fusoDaRede(ctx.tenantId))
    if (!agendada) return { error: 'Data e hora do disparo inválidas.' }
  }

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
      scheduled_at:      agendada,
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
  // A campanha é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }

  const admin = createAdminClient()

  // Só rascunho ou pausada. `maybeSingle`: id que não existe é "não
  // encontrado", não exceção dentro de `ler` (erro 500).
  const existing = await ler(admin
    .from('notification_campaigns')
    .select('status, tenant_id, type, scheduled_at, trigger_type, trigger_config')
    .eq('id', id)
    .maybeSingle(), 'buscar a campanha')

  if (!existing || existing.tenant_id !== ctx.tenantId!) return { error: 'Não encontrado' }
  if (!['DRAFT', 'PAUSED'].includes(existing.status))
    return { error: 'Apenas campanhas em rascunho ou pausadas podem ser editadas' }
  // MK1: a campanha como fica depois da edição (o tipo não muda).
  const doTipo = recusaDoTipoDaCampanha({
    type:           existing.type as string,
    scheduled_at:   input.scheduled_at !== undefined ? input.scheduled_at : (input.trigger_type ? null : existing.scheduled_at as string | null),
    trigger_type:   input.trigger_type !== undefined ? input.trigger_type : (input.scheduled_at ? null : existing.trigger_type as string | null),
    trigger_config: input.trigger_config !== undefined ? input.trigger_config : existing.trigger_config as Record<string, unknown> | null,
  })
  if (doTipo) return { error: doTipo }

  // F64 (D4): a hora digitada é a do relógio da REDE (a mesma conta do criar).
  let agendada: string | null | undefined = input.scheduled_at
  if (input.scheduled_at) {
    agendada = instanteDaCampanha(input.scheduled_at, await fusoDaRede(ctx.tenantId))
    if (!agendada) return { error: 'Data e hora do disparo inválidas.' }
  }

  const { error } = await admin
    .from('notification_campaigns')
    .update({
      ...(input.name              !== undefined && { name: input.name.trim() }),
      ...(input.description       !== undefined && { description: input.description?.trim() ?? null }),
      ...(input.title             !== undefined && { title: input.title.trim() }),
      ...(input.body              !== undefined && { body: input.body.trim() }),
      ...(input.notification_type !== undefined && { notification_type: input.notification_type }),
      // A agendada é numa data e hora OU todo ano: escolher uma limpa a outra.
      ...(input.scheduled_at      !== undefined && { scheduled_at: agendada || null }),
      ...(input.scheduled_at && input.trigger_type === undefined && { trigger_type: null, trigger_config: null }),
      ...(input.trigger_type      !== undefined && { trigger_type: input.trigger_type }),
      ...(input.trigger_type && input.scheduled_at === undefined && { scheduled_at: null }),
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
  // A campanha é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
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
  // MK1: só a Imediata e a Agendada (a data já guardada) se ativam.
  const doTipo = recusaDoTipoDaCampanha(camp as { type: string; scheduled_at: string | null; trigger_type: string | null; trigger_config: Record<string, unknown> | null })
  if (doTipo) return { error: doTipo }

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
  // A campanha é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }

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
  // A campanha é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }

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
  // A campanha é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }

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

// -- Clientes específicas (A37 da 15ª) ------------------------------------

/**
 * A busca das "Clientes específicas" do público: por nome, telefone ou CPF
 * (a regra única da busca de cliente, `buscar_clientes`), na rede de quem pede.
 */
export async function buscarClientesParaCampanha(termo: string): Promise<{ id: string; nome: string; telefone: string }[]> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'campanhas')
  assertPermission(ctx, 'marketing', 'MANAGE')
  const busca = typeof termo === 'string' ? termo.trim().slice(0, 80) : ''
  if (busca.length < 2) return []
  const { data, error } = await createAdminClient().rpc('buscar_clientes', { p_tenant: ctx.tenantId!, p_termo: busca, p_limite: 8 })
  if (error) return []
  return ((data ?? []) as { id: string; name: string; phone: string | null }[])
    .map(c => ({ id: c.id, nome: c.name, telefone: c.phone ?? '' }))
}

// -- Audience preview ---------------------------------------------------

export async function previewAudienceCount(
  rules: AudienceRules,
): Promise<{ count: number; comAparelho: number }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'marketing', 'MANAGE')

  // Contado no banco, com o MESMO filtro do disparo (lib/clientes/publico.ts).
  // Com procedimento, a conta era o mínimo entre o público e os 400 primeiros
  // de quem fez o procedimento — nunca passava de 400. Contagem que falha não
  // vira "0 clientes": `contar` para o fluxo.
  // Todas as regras gravadas, pela MESMA conta do disparo (D1 da 9ª: o "sem
  // visita há mais de N dias" não chegava aqui).
  const filtros = filtrosDaCampanha(rules)
  // E quantas RECEBEM: a campanha é aviso no celular (D-3), e só chega a quem
  // tem um aparelho registrado — o mesmo critério do disparo.
  const [count, comAparelho] = await Promise.all([
    contarPublico(ctx.tenantId!, filtros),
    contarPublicoComAparelho(ctx.tenantId!, filtros),
  ])
  return { count, comAparelho }
}

