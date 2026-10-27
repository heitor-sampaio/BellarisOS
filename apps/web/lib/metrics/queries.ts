import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

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
  /** Concluídos COBRADOS (preço > 0): o denominador do ticket médio (2026-10-27). */
  appointmentsCharged:   number
}

export const EMPTY_CORE: MetricsCore = {
  revenueCash: 0, revenuePending: 0, expensesCash: 0, serviceRevenue: 0,
  appointmentsCompleted: 0, appointmentsTotal: 0, appointmentsCancelled: 0,
  appointmentsNoShow: 0, scheduledMinutes: 0, newClients: 0,
  commissionsOpen: 0, commissionsPaid: 0, appointmentsCharged: 0,
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
  appointmentsCharged:   number
}

export type SeriesPoint       = { bucket: string; revenue: number; expenses: number }
export type ProcedureMetrics  = { procedureId: string; name: string; appointments: number; revenue: number; repeatVisits: number; avgRating: number | null; ratingCount: number }
export type ProfessionalMetrics = { professionalId: string; name: string; appointments: number; revenue: number; commission: number; avgRating: number | null; ratingCount: number }
export type ClientMetrics     = { clientId: string; name: string; totalSpent: number; appointments: number }
export type FunnelStage       = { stageId: string; name: string; position: number; outcome: 'OPEN' | 'WON' | 'LOST'; leads: number; converted: number }

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
/**
 * Falha de indicador PARA a tela — não vira zero.
 *
 * Isto registrava e seguia: o wrapper devolvia `EMPTY_CORE` ou lista vazia, e
 * um RPC quebrado aparecia como "R$ 0,00" com cara de dado (§13.1). O nome
 * ficou porque é chamado em todo wrapper; o comportamento é o de `ler`.
 */
function logRpcError(fn: string, error: { message: string } | null): void {
  if (error) {
    console.error(`[metrics] ${fn} falhou: ${error.message}`)
    throw new Error(`Não consegui calcular os indicadores (${fn}): ${error.message}`)
  }
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
    appointmentsCharged:   n(row.appointments_charged),
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
    appointmentsCharged:   n(r.appointments_charged),
  }))
}

export async function getSeries(
  args: Args & { granularity?: 'hour' | 'day' | 'week' | 'month' },
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

/**
 * Quem mais tem comissão LANÇADA no período, ordenado pela comissão. O
 * dashboard reordenava o top 5 por atendimentos — quem mais ganhou podia nem
 * estar nele.
 */
export async function getRankingDeComissao(args: Args & { limit?: number }): Promise<{ professionalId: string; name: string; commission: number }[]> {
  const { data, error } = await createAdminClient().rpc('metrics_ranking_comissao', {
    ...baseArgs(args), p_limit: args.limit ?? 5,
  })
  logRpcError('metrics_ranking_comissao', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    professionalId: String(r.professional_id),
    name:           String(r.professional_name),
    commission:     n(r.commission),
  }))
}

/**
 * Margem por procedimento (o catálogo, não um período): preço − (insumos ao
 * custo da unidade de CONSUMO + mão de obra + outros custos). A conta é do
 * banco (`metrics_margem_procedimentos`); até 2026-10-21 a página fazia, com o
 * preço da embalagem inteira — a Toxina saía com −3858%.
 */
export async function getMargemPorProcedimento(args: { tenantId: string; limit?: number }): Promise<{ name: string; price: number; cost: number; marginPct: number }[]> {
  const { data, error } = await createAdminClient().rpc('metrics_margem_procedimentos', {
    p_tenant: args.tenantId, p_limit: args.limit ?? 5,
  })
  logRpcError('metrics_margem_procedimentos', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    name:      String(r.procedure_name),
    price:     n(r.price),
    cost:      n(r.cost),
    marginPct: n(r.margin_pct),
  }))
}

/**
 * As movimentações do financeiro (os lançamentos da LISTA: data de referência
 * no período, sem o saldo zerado), por unidade e no total — o mesmo número na
 * coluna e no rodapé (`metrics_movimentacoes`, 2026-10-21; eram duas contas).
 */
export async function getMovimentacoes(args: Args): Promise<{ porUnidade: Record<string, number>; total: number }> {
  const { data, error } = await createAdminClient().rpc('metrics_movimentacoes', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  logRpcError('metrics_movimentacoes', error)
  const linhas = (data as { branch_id: string | null; n: unknown }[] | null) ?? []
  return {
    porUnidade: Object.fromEntries(linhas.filter(l => l.branch_id).map(l => [l.branch_id as string, n(l.n)])),
    total:      n(linhas.find(l => l.branch_id === null)?.n),
  }
}

/** A despesa em aberto do período (vencimento no período), sem estorno — o "A pagar". */
export async function getAPagar(args: Args): Promise<number> {
  const { data, error } = await createAdminClient().rpc('metrics_a_pagar', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  logRpcError('metrics_a_pagar', error)
  return n(data)
}

/** O que vence num dia (Brasília): o próximo vencimento depois do período. */
export interface ProximoVencimento { dia: string; valor: number }
export interface EmAberto {
  /** Em aberto no período, pelo VENCIMENTO (data de referência). */
  aReceber: number
  aPagar:   number
  /** O primeiro vencimento DEPOIS do período, e quanto vence nele. */
  proximoAReceber: ProximoVencimento | null
  proximoAPagar:   ProximoVencimento | null
}

/**
 * "A receber" e "A pagar" do período pelo vencimento, e o próximo vencimento
 * de cada lado (`metrics_em_aberto`, A34 da simulação de 2026-10-27): "A pagar
 * R$ 0" em "Este mês" com R$ 300 vencendo em 05/11 parecia conta sumida.
 * `to` é o FIM do período (fullTo), como nas listas.
 */
export async function getEmAberto(args: Args): Promise<EmAberto> {
  const { data, error } = await createAdminClient().rpc('metrics_em_aberto', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  logRpcError('metrics_em_aberto', error)
  const r = ((data as Record<string, unknown>[] | null) ?? [])[0] ?? {}
  const proximo = (dia: unknown, valor: unknown) => dia ? { dia: String(dia), valor: n(valor) } : null
  return {
    aReceber: n(r.a_receber), aPagar: n(r.a_pagar),
    proximoAReceber: proximo(r.proximo_receber_dia, r.proximo_receber_valor),
    proximoAPagar:   proximo(r.proximo_pagar_dia, r.proximo_pagar_valor),
  }
}

export interface LinhaDoFechamento { forma: string; entradas: number; saidas: number; saldo: number; lancamentos: number }
export interface FechamentoDoDia {
  /** Uma linha por forma de pagamento (CASH, PIX…; SEM_FORMA = pago com pontos/sem forma). */
  formas: LinhaDoFechamento[]
  total:  LinhaDoFechamento
  /** O dinheiro em espécie que deve estar na gaveta: o saldo de CASH do dia. */
  esperadoDinheiro: number
}

/**
 * O dia da unidade por forma de pagamento (`metrics_fechamento_do_dia`,
 * 2026-10-21): entradas pela regra de receita de sempre, saídas pagas, estorno
 * fora dos dois lados. O total vem do banco.
 */
export async function getFechamentoDoDia(args: { tenantId: string; branchId: string; from: Date; to: Date }): Promise<FechamentoDoDia> {
  const { data, error } = await createAdminClient().rpc('metrics_fechamento_do_dia', {
    p_tenant: args.tenantId, p_branch: args.branchId, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  logRpcError('metrics_fechamento_do_dia', error)
  const linhas = ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    forma: String(r.forma), entradas: n(r.entradas), saidas: n(r.saidas), saldo: n(r.saldo), lancamentos: n(r.lancamentos),
  }))
  const total = linhas.find(l => l.forma === 'TOTAL') ?? { forma: 'TOTAL', entradas: 0, saidas: 0, saldo: 0, lancamentos: 0 }
  return {
    formas: linhas.filter(l => l.forma !== 'TOTAL').sort((x, y) => y.entradas - x.entradas),
    total,
    esperadoDinheiro: linhas.find(l => l.forma === 'CASH')?.saldo ?? 0,
  }
}

export interface ComposicaoFinanceira {
  /** Receita paga por forma de pagamento (método do banco: PIX, CASH…). */
  formas:   { chave: string; valor: number }[]
  receitas: { chave: string; valor: number }[]
  despesas: { chave: string; valor: number }[]
}

/**
 * Receita por forma de pagamento e receita/despesa por categoria, no período
 * (`metrics_financeiro_composicao`, a regra de metrics_core: estorno fora dos
 * dois lados). A tela do financeiro somava a lista e contava a
 * contra-transação do estorno como despesa (simulação de 2026-10-20).
 */
export async function getComposicaoFinanceira(args: Args): Promise<ComposicaoFinanceira> {
  const { data, error } = await createAdminClient().rpc('metrics_financeiro_composicao', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  logRpcError('metrics_financeiro_composicao', error)
  const linhas = ((data as { grupo: string; chave: string; valor: unknown }[] | null) ?? [])
  const de = (g: string) => linhas.filter(l => l.grupo === g).map(l => ({ chave: String(l.chave), valor: n(l.valor) }))
    .sort((a, b) => b.valor - a.valor)
  return { formas: de('FORMA'), receitas: de('RECEITA'), despesas: de('DESPESA') }
}

export type CommissionEntry = {
  id: string; professionalId: string; professionalName: string
  amount: number; isPaid: boolean; referenceAt: string
}

/**
 * Extrato de comissões do período (a referência é o LANÇAMENTO, `released_at`).
 * Em páginas (2026-10-22): uma linha por comissão, e o PostgREST corta em 1000
 * — o total do card ficava baixo e os profissionais do fim do alfabeto sumiam.
 */
export async function getCommissionsDetail(args: Args): Promise<CommissionEntry[]> {
  const admin = createAdminClient()
  const data = await lerTodas<Record<string, unknown>>(
    (de, ate) => admin.rpc('metrics_commissions_detail', baseArgs(args))
      .order('professional_name').order('reference_at', { ascending: false }).order('id').range(de, ate),
    'carregar as comissões do período',
  )
  return data.map(r => ({
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

/**
 * O painel comercial (relatório, aba Comercial), agregado no banco
 * (`metrics_comercial`, 2026-10-22): leads da REDE criados no período e
 * atendimentos COMERCIAIS das unidades marcados no período. Era contado na
 * tela sobre as listas — até 1000 linhas de cada — e saía subcontado.
 */
export type PainelComercial = {
  totalLeads: number; convertidos: number
  agendados: number; considerados: number; realizados: number
  porDono: { dono: string | null; leads: number; convertidos: number; agendamentos: number }[]
}

export async function getPainelComercial(args: { tenantId: string; branchIds: string[]; from: Date; to: Date }): Promise<PainelComercial> {
  const { data, error } = await createAdminClient().rpc('metrics_comercial', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  logRpcError('metrics_comercial', error)
  const r = (data ?? {}) as Record<string, unknown>
  return {
    totalLeads: n(r.total_leads), convertidos: n(r.convertidos),
    agendados: n(r.agendados), considerados: n(r.considerados), realizados: n(r.realizados),
    porDono: ((r.ranking as Record<string, unknown>[] | null) ?? []).map(d => ({
      dono: d.dono == null ? null : String(d.dono),
      leads: n(d.leads), convertidos: n(d.convertidos), agendamentos: n(d.agendamentos),
    })),
  }
}

/**
 * Os motivos das oportunidades PERDIDAS no período (`leads.perdido_em`), da
 * rede inteira — os leads são da rede, como no funil. Perdida sem motivo (o
 * Copilot e as automações movem sem perguntar) vem como "Sem motivo".
 */
export async function getMotivosDePerda(args: { tenantId: string; from: Date; to: Date }): Promise<{ motivo: string; total: number }[]> {
  const { data, error } = await createAdminClient().rpc('metrics_motivos_de_perda', {
    p_tenant: args.tenantId, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  logRpcError('metrics_motivos_de_perda', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({ motivo: String(r.motivo), total: n(r.total) }))
}

/**
 * Etapas de UM funil.
 *
 * Sem `funnelId` a função do banco usa o funil padrão da rede. Desde que existe
 * mais de um funil, empilhar todos no mesmo gráfico misturaria etapas que não
 * se sucedem — "Novo" de vendas somado com "Novo" de recuperação.
 */
export async function getLeadFunnel(
  args: Args & { funnelId?: string | null },
): Promise<FunnelStage[]> {
  const { data, error } = await createAdminClient().rpc('metrics_lead_funnel', {
    ...baseArgs(args), p_funnel: args.funnelId ?? null,
  })
  logRpcError('metrics_lead_funnel', error)
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    stageId:   String(r.stage_id),
    name:      String(r.stage_name),
    position:  n(r.stage_position),
    outcome:   (r.stage_outcome as FunnelStage['outcome']) ?? 'OPEN',
    leads:     n(r.leads),
    converted: n(r.converted),
  }))
}
