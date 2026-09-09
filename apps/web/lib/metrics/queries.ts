import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Acesso às funções de agregação do Postgres (migration 20260909000001).
 *
 * Toda soma/contagem de indicador passa por aqui. Antes cada tela fazia um
 * `select` sem limite e somava em JavaScript — o PostgREST corta em 1000
 * linhas, então os números encolhiam em silêncio conforme a base crescia.
 *
 * `branchIds = null` significa "toda a rede do tenant".
 */

export type MetricsCore = {
  revenueCash:           number
  revenuePending:        number
  expensesCash:          number
  serviceRevenue:        number
  appointmentsCompleted: number
  appointmentsTotal:     number
  appointmentsCancelled: number
  appointmentsNoShow:    number
  scheduledMinutes:      number
  newClients:            number
  commissionsOpen:       number
  commissionsPaid:       number
}

export const EMPTY_CORE: MetricsCore = {
  revenueCash: 0, revenuePending: 0, expensesCash: 0, serviceRevenue: 0,
  appointmentsCompleted: 0, appointmentsTotal: 0, appointmentsCancelled: 0,
  appointmentsNoShow: 0, scheduledMinutes: 0, newClients: 0,
  commissionsOpen: 0, commissionsPaid: 0,
}

export type BranchMetrics = {
  branchId:              string
  branchName:            string
  branchSlug:            string
  isActive:              boolean
  revenueCash:           number
  revenuePending:        number
  expensesCash:          number
  serviceRevenue:        number
  appointmentsCompleted: number
  appointmentsTotal:     number
  appointmentsCancelled: number
  appointmentsNoShow:    number
  scheduledMinutes:      number
  newClients:            number
  commissionsOpen:       number
  commissionsPaid:       number
  transactionsCount:     number
}

export type SeriesPoint       = { bucket: string; revenue: number; expenses: number }
export type ProcedureMetrics  = { procedureId: string; name: string; appointments: number; revenue: number; repeatVisits: number; avgRating: number | null; ratingCount: number }
export type ProfessionalMetrics = { professionalId: string; name: string; appointments: number; revenue: number; commission: number; avgRating: number | null; ratingCount: number }
export type ClientMetrics     = { clientId: string; name: string; totalSpent: number; appointments: number }
export type FunnelStage       = { stageId: string; name: string; position: number; leads: number; converted: number }

const n = (v: unknown): number => (v == null ? 0 : Number(v))
const nullableN = (v: unknown): number | null => (v == null ? null : Number(v))

type Args = {
  tenantId: string
  branchIds?: string[] | null
  from: Date
  to: Date
  /** Escopa tudo a um profissional (dashboard do profissional que atende). */
  professionalId?: string | null
}

function baseArgs({ tenantId, branchIds, from, to }: Args) {
  return {
    p_tenant:     tenantId,
    p_branch_ids: branchIds ?? null,
    p_from:       from.toISOString(),
    p_to:         to.toISOString(),
  }
}

/**
 * O erro do PostgREST era descartado em todas as telas, então drift de schema
 * virava "R$ 0,00" silencioso em vez de falha visível. Aqui ele é registrado.
 */
function logRpcError(fn: string, error: { message: string } | null): void {
  if (error) console.error(`[metrics] ${fn} falhou: ${error.message}`)
}

export async function getCore(args: Args): Promise<MetricsCore> {
  const { data, error } = await createAdminClient().rpc('metrics_core', {
    ...baseArgs(args), p_professional_id: args.professionalId ?? null,
  })
  logRpcError('metrics_core', error)
  const row = (data as Record<string, unknown>[] | null)?.[0]
  if (!row) return { ...EMPTY_CORE }
  return {
    revenueCash:           n(row.revenue_cash),
    revenuePending:        n(row.revenue_pending),
    expensesCash:          n(row.expenses_cash),
    serviceRevenue:        n(row.service_revenue),
    appointmentsCompleted: n(row.appointments_completed),
    appointmentsTotal:     n(row.appointments_total),
    appointmentsCancelled: n(row.appointments_cancelled),
    appointmentsNoShow:    n(row.appointments_no_show),
    scheduledMinutes:      n(row.scheduled_minutes),
    newClients:            n(row.new_clients),
    commissionsOpen:       n(row.commissions_open),
    commissionsPaid:       n(row.commissions_paid),
  }
}

export async function getByBranch(
  { tenantId, from, to }: Omit<Args, 'branchIds'>,
): Promise<BranchMetrics[]> {
  const { data, error } = await createAdminClient().rpc('metrics_by_branch', {
    p_tenant: tenantId, p_from: from.toISOString(), p_to: to.toISOString(),
  })
  logRpcError('metrics_by_branch', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    branchId:              String(r.branch_id),
    branchName:            String(r.branch_name),
    branchSlug:            String(r.branch_slug),
    isActive:              Boolean(r.is_active),
    revenueCash:           n(r.revenue_cash),
    revenuePending:        n(r.revenue_pending),
    expensesCash:          n(r.expenses_cash),
    serviceRevenue:        n(r.service_revenue),
    appointmentsCompleted: n(r.appointments_completed),
    appointmentsTotal:     n(r.appointments_total),
    appointmentsCancelled: n(r.appointments_cancelled),
    appointmentsNoShow:    n(r.appointments_no_show),
    scheduledMinutes:      n(r.scheduled_minutes),
    newClients:            n(r.new_clients),
    commissionsOpen:       n(r.commissions_open),
    commissionsPaid:       n(r.commissions_paid),
    transactionsCount:     n(r.transactions_count),
  }))
}

export async function getSeries(
  args: Args & { granularity?: 'hour' | 'day' | 'month' },
): Promise<SeriesPoint[]> {
  const { data, error } = await createAdminClient().rpc('metrics_series', {
    ...baseArgs(args), p_granularity: args.granularity ?? 'day',
  })
  logRpcError('metrics_series', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    bucket:   String(r.bucket),
    revenue:  n(r.revenue),
    expenses: n(r.expenses),
  }))
}

export async function getTopProcedures(args: Args & { limit?: number }): Promise<ProcedureMetrics[]> {
  const { data, error } = await createAdminClient().rpc('metrics_top_procedures', {
    ...baseArgs(args), p_limit: args.limit ?? 5,
  })
  logRpcError('metrics_top_procedures', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    procedureId:  String(r.procedure_id),
    name:         String(r.procedure_name),
    appointments: n(r.appointments),
    revenue:      n(r.revenue),
    repeatVisits: n(r.repeat_visits),
    avgRating:    nullableN(r.avg_rating),
    ratingCount:  n(r.rating_count),
  }))
}

export async function getTopProfessionals(args: Args & { limit?: number }): Promise<ProfessionalMetrics[]> {
  const { data, error } = await createAdminClient().rpc('metrics_top_professionals', {
    ...baseArgs(args), p_limit: args.limit ?? 5,
  })
  logRpcError('metrics_top_professionals', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    professionalId: String(r.professional_id),
    name:           String(r.professional_name),
    appointments:   n(r.appointments),
    revenue:        n(r.revenue),
    commission:     n(r.commission),
    avgRating:      nullableN(r.avg_rating),
    ratingCount:    n(r.rating_count),
  }))
}

export async function getTopClients(args: Args & { limit?: number }): Promise<ClientMetrics[]> {
  const { data, error } = await createAdminClient().rpc('metrics_top_clients', {
    ...baseArgs(args), p_limit: args.limit ?? 10,
  })
  logRpcError('metrics_top_clients', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    clientId:     String(r.client_id),
    name:         String(r.client_name),
    totalSpent:   n(r.total_spent),
    appointments: n(r.appointments),
  }))
}

export type CommissionEntry = {
  id: string; professionalId: string; professionalName: string
  amount: number; isPaid: boolean; referenceAt: string
}

/** Extrato de comissões do período (a referência é a data do atendimento). */
export async function getCommissionsDetail(args: Args): Promise<CommissionEntry[]> {
  const { data, error } = await createAdminClient().rpc('metrics_commissions_detail', baseArgs(args))
  logRpcError('metrics_commissions_detail', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    id:               String(r.id),
    professionalId:   String(r.professional_id),
    professionalName: r.professional_name ? String(r.professional_name) : 'Profissional',
    amount:           n(r.amount),
    isPaid:           Boolean(r.is_paid),
    referenceAt:      String(r.reference_at),
  }))
}

export type Retention = {
  /** Clientes distintos atendidos no período. */
  clientsServed:    number
  /** Destes, os que já tinham sido atendidos ANTES do período. */
  returningClients: number
  /** Destes, os que foram atendidos pela primeira vez no período. */
  firstTimeClients: number
}

/**
 * Retenção de verdade: quem já era cliente antes do período e voltou nele.
 * O que a tela chamava de "taxa de retenção" era a proporção de clientes com
 * 2+ atendimentos dentro da própria janela — em "hoje" isso tende a zero por
 * construção, e não mede retenção.
 */
export async function getRetention(args: Args): Promise<Retention> {
  const { data, error } = await createAdminClient().rpc('metrics_retention', baseArgs(args))
  logRpcError('metrics_retention', error)
  const row = (data as Record<string, unknown>[] | null)?.[0]
  return {
    clientsServed:    n(row?.clients_served),
    returningClients: n(row?.returning_clients),
    firstTimeClients: n(row?.first_time_clients),
  }
}

/** Novos clientes por bucket, no fuso do negócio e dentro da janela. */
export async function getNewClientsSeries(
  args: Args & { granularity?: 'hour' | 'day' | 'month' },
): Promise<{ bucket: string; count: number }[]> {
  const { data, error } = await createAdminClient().rpc('metrics_new_clients_series', {
    ...baseArgs(args), p_granularity: args.granularity ?? 'day',
  })
  logRpcError('metrics_new_clients_series', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    bucket: String(r.bucket),
    count:  n(r.count),
  }))
}

export async function getLeadFunnel(args: Args): Promise<FunnelStage[]> {
  const { data, error } = await createAdminClient().rpc('metrics_lead_funnel', baseArgs(args))
  logRpcError('metrics_lead_funnel', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    stageId:   String(r.stage_id),
    name:      String(r.stage_name),
    position:  n(r.stage_position),
    leads:     n(r.leads),
    converted: n(r.converted),
  }))
}
