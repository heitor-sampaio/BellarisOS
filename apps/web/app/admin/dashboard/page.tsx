import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdsConfig, resolveAdsProvider } from '@/lib/ads/factory'
import type { DatePreset } from '@/lib/ads/types'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import type {
  BranchStat,
  TodayBranchStat,
  AlertPendingPlan,
  AlertLowStock,
} from '@/components/admin/admin-dashboard-view'
import { AdminDashboardDynamic as AdminDashboardView } from '@/components/admin/admin-dashboard-dynamic'
import { startOfDayTZ, endOfDayTZ, addDaysTZ, dayKeyTZ, partsInTZ } from '@/lib/datetime'
import {
  resolvePeriod, ratio, percent, EMPTY_CORE,
  getCore, getByBranch, getSeries, getTopProcedures, getTopProfessionals,
  getTopClients, getLeadFunnel,
} from '@/lib/metrics'
import { seedDefaultFunnel } from '@/actions/crm-funnels'

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; funil?: string }>
}) {
  const { period: rawPeriod, from: rawFrom, to: rawTo, funil: rawFunil } = await searchParams

  const ctx   = await getTenantContext()

  const perm = ctx.permissions
  const canFinancial  = perm.financial  !== 'NONE'
  const canAgenda     = perm.agenda     !== 'NONE'
  const canClients    = perm.clients    !== 'NONE'
  const canStock      = perm.stock      !== 'NONE'
  const canProcedures = perm.procedures !== 'NONE'
  const canTeam       = perm.team       !== 'NONE'
  const canReports    = perm.reports    !== 'NONE'
  const canCrm        = perm.crm        !== 'NONE'
  const canMarketing  = perm.marketing  !== 'NONE'
  // Queries "core" (analytics internos) só rodam se o cargo tem algum módulo core.
  const needsCore = canFinancial || canAgenda || canClients || canStock || canProcedures || canTeam || canReports

  const admin = createAdminClient()
  const now   = new Date()

  // -- Período selecionado -------------------------------------------
  // Janela e comparação resolvidas em America/Sao_Paulo, com o período
  // anterior de mesma duração decorrida (antes o mês parcial era comparado
  // com o mês anterior inteiro, e todo delta nascia negativo).
  const periodInfo  = resolvePeriod(rawPeriod, rawFrom, rawTo, now)
  const period      = periodInfo.key
  const startDate   = periodInfo.from
  const endDate     = periodInfo.to
  const prevStart   = periodInfo.prevFrom
  const prevEnd     = periodInfo.prevTo
  const periodLabel = periodInfo.label

  // O seletor da tela oferece um subconjunto dos períodos; qualquer outro
  // valor vindo da URL cai em "month", que é o padrão exibido.
  const SELECTOR_PERIODS = ['today', '7d', '15d', 'month', 'all', 'custom'] as const
  const selectorPeriod = (SELECTOR_PERIODS as readonly string[]).includes(period)
    ? (period as typeof SELECTOR_PERIODS[number])
    : 'month'

  // -- Datas fixas (não afetadas pelo seletor) -----------------------
  const startOfToday = startOfDayTZ(now)
  const endOfToday   = endOfDayTZ(now)

  // -- Filiais -------------------------------------------------------
  // Falha de consulta não é rede sem filial — o erro sobe em vez de virar um
  // dashboard vazio com cara de rede nova.
  const { data: branchesRaw, error: branchesError } = await admin
    .from('branches')
    .select('id, name, slug, city, state')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  if (branchesError) throw new Error(`Não foi possível carregar as unidades: ${branchesError.message}`)

  const branches  = branchesRaw ?? []
  const branchIds = branches.map(b => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // -- Queries paralelas ---------------------------------------------
  const metricArgs = { tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate }
  const prevArgs   = { tenantId: ctx.tenantId!, branchIds, from: prevStart, to: prevEnd }

  const [
    core,
    prevCore,
    branchMetrics,
    seriesData,
    procedureStats,
    professionalStats,
    clientStats,
    ltvStats,
    { count: totalClientsEver },
    { data: todayApptsRaw },
    { data: pendingPlansRaw },
    { data: bpsRaw },
    { data: proceduresRaw },
    { data: stockMovementsRaw },
    { data: clientsDemoRaw },
  ] = needsCore ? await Promise.all([

    // Núcleo agregado no Postgres: receita, atendimentos, novos clientes,
    // comissões e minutos agendados numa chamada só e coerentes entre si.
    getCore(metricArgs),
    getCore(prevArgs),
    getByBranch({ tenantId: ctx.tenantId!, from: startDate, to: endDate }),
    getSeries({ ...metricArgs, granularity: period === 'today' ? 'hour' : 'day' }),
    getTopProcedures({ ...metricArgs, limit: 5 }),
    getTopProfessionals({ ...metricArgs, limit: 5 }),
    getTopClients({ ...metricArgs, limit: 10 }),

    // LTV desde sempre. O limite alto é do SQL, não do PostgREST: antes esta
    // consulta trazia "todas" as transações da história e era cortada em 1000.
    getTopClients({
      tenantId: ctx.tenantId!, branchIds,
      from: new Date(Date.UTC(2000, 0, 1)), to: endDate, limit: 5000,
    }),

    // Total de clientes da rede (all time)
    admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true),

    // Agendamentos de hoje (exceto cancelados e no-show)
    admin.from('appointments')
      .select('id, status, branch_id')
      .in('branch_id', branchIds)
      .gte('scheduled_at', startOfToday.toISOString())
      .lte('scheduled_at', endOfToday.toISOString())
      .neq('status', 'CANCELLED')
      .neq('status', 'NO_SHOW'),

    // Planos de tratamento aguardando checkout
    admin.from('treatment_plans')
      .select('id, branch_id, created_at, clients(name), branches(name, slug)')
      .in('branch_id', branchIds)
      .eq('status', 'PROPOSED')
      .order('created_at', { ascending: true })
      .limit(20),

    // Estoque: produtos com min_stock configurado OU zerados (para indicador de saúde)
    admin.from('branch_product_stock')
      .select('current_stock, min_stock, branch_id, products(name, is_active), branches(name, slug)')
      .in('branch_id', branchIds)
      .or('min_stock.gt.0,current_stock.eq.0')
      .order('current_stock', { ascending: true }),

    // Procedimentos ativos com custo variável (para cálculo de margem)
    admin.from('procedures')
      .select('id, name, price, labor_cost, other_costs, procedure_products(quantity, products(cost_price))')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true),

    // Giro do período: consumo em procedimentos, ao custo do movimento
    admin.from('stock_movements')
      .select('quantity, unit_cost, created_at, products(cost_price)')
      .in('branch_id', branchIds)
      .eq('type', 'PROCEDURE_USAGE')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),

    // Demografia — todos os clientes da rede
    admin.from('clients')
      .select('id, name, birth_date, city, zip_code')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true),
  ]) : [
    { ...EMPTY_CORE }, { ...EMPTY_CORE }, [], [], [], [], [], [],
    { count: 0 }, { data: [] }, { data: [] }, { data: [] }, { data: [] },
    { data: [] }, { data: [] },
  ]

  const todayAppts = (todayApptsRaw ?? []) as any[]

  // -- KPIs consolidados ---------------------------------------------
  const totalRevenue      = core.revenueCash
  const prevRevenue       = prevCore.revenueCash
  const totalAppointments = core.appointmentsCompleted
  const prevAppointments  = prevCore.appointmentsCompleted
  const newClients        = core.newClients
  const prevClientsCount  = prevCore.newClients

  // Ticket médio = receita dos atendimentos ÷ atendimentos concluídos.
  // Antes o numerador era o caixa do período (que inclui venda de produto,
  // pacote e lançamento avulso) sobre a contagem da agenda: a conta nunca
  // fechava quando conferida na mão.
  const ticketMedio = ratio(core.serviceRevenue, core.appointmentsCompleted) ?? 0

  // -- Por filial ----------------------------------------------------
  const branchStats: BranchStat[] = branchMetrics.map(b => ({
    id:           b.branchId,
    name:         b.branchName,
    slug:         b.branchSlug,
    revenue:      b.revenueCash,
    appointments: b.appointmentsCompleted,
    newClients:   b.newClients,
    ticketMedio:  ratio(b.serviceRevenue, b.appointmentsCompleted) ?? 0,
  }))

  // -- Hoje por filial -----------------------------------------------
  const todayByBranch: TodayBranchStat[] = branches
    .map(branch => {
      const bToday = todayAppts.filter(a => a.branch_id === branch.id)
      if (bToday.length === 0) return null
      return {
        id:         branch.id,
        name:       branch.name,
        slug:       branch.slug,
        total:      bToday.length,
        scheduled:  bToday.filter(a => a.status === 'SCHEDULED').length,
        confirmed:  bToday.filter(a => a.status === 'CONFIRMED').length,
        inProgress: bToday.filter(a => a.status === 'IN_PROGRESS').length,
        completed:  bToday.filter(a => a.status === 'COMPLETED').length,
      }
    })
    .filter(Boolean) as TodayBranchStat[]

  // -- Alertas -------------------------------------------------------
  const pendingPlans: AlertPendingPlan[] = (pendingPlansRaw ?? []).map((p: any) => ({
    id:         p.id,
    clientName: p.clients?.name ?? 'Cliente',
    branchName: p.branches?.name ?? '—',
    branchSlug: p.branches?.slug ?? '',
    createdAt:  p.created_at,
  }))

  const allBps = (bpsRaw ?? []) as any[]

  const lowStockItems: AlertLowStock[] = allBps
    .filter(b => Number(b.current_stock) <= Number(b.min_stock) && Number(b.min_stock) > 0)
    .slice(0, 20)
    .map(b => ({
      productName:  b.products?.name ?? '—',
      branchName:   b.branches?.name ?? '—',
      branchSlug:   b.branches?.slug ?? '',
      currentStock: Number(b.current_stock),
      minStock:     Number(b.min_stock),
    }))

  // -- Indicador de saúde do estoque --------------------------------
  const zeroStockCount = allBps.filter(b =>
    Number(b.current_stock) === 0 && b.products?.is_active !== false
  ).length
  const lowStockCount = allBps.filter(b =>
    Number(b.current_stock) > 0 &&
    Number(b.min_stock) > 0 &&
    Number(b.current_stock) <= Number(b.min_stock)
  ).length
  const stockStatus: 'critical' | 'warning' | 'healthy' =
    zeroStockCount > 0 ? 'critical' : lowStockCount > 0 ? 'warning' : 'healthy'
  // Giro ao custo do MOVIMENTO (unit_cost), não ao custo atual do produto —
  // a coluna existe e antes nem era selecionada, então o giro era recalculado
  // toda vez que o preço de compra mudava.
  const stockTurnover = ((stockMovementsRaw ?? []) as any[])
    .reduce((s, m) => s + Math.abs(Number(m.quantity)) * Number(m.unit_cost ?? m.products?.cost_price ?? 0), 0)

  // Despesas do período. Simétrico à receita: só o que foi efetivamente pago
  // (antes a receita exigia is_paid e a despesa não, então o "lucro" misturava
  // caixa de um lado com competência do outro).
  const totalCost = core.expensesCash

  // -- Gráfico de evolução -------------------------------------------
  // Buckets vêm prontos do Postgres, já no fuso do negócio. A soma das barras
  // fecha com o KPI do período — antes as fatias eram remontadas em JS sobre
  // o fuso do servidor e divergiam do total.
  const granularity = period === 'today' ? 'hour' : 'day'

  const seriesByBucket = new Map(
    seriesData.map(p => [
      granularity === 'hour' ? String(partsInTZ(new Date(p.bucket)).hour) : dayKeyTZ(p.bucket),
      p,
    ]),
  )

  const evolutionData = granularity === 'hour'
    ? Array.from({ length: 24 }, (_, i) => {
        const point = seriesByBucket.get(String(i))
        const revenue = point?.revenue ?? 0
        const cost    = point?.expenses ?? 0
        return { day: i, revenue, cost, profit: revenue - cost }
      })
    : (() => {
        const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1)
        return Array.from({ length: days }, (_, i) => {
          const point   = seriesByBucket.get(dayKeyTZ(addDaysTZ(startDate, i)))
          const revenue = point?.revenue ?? 0
          const cost    = point?.expenses ?? 0
          return { day: i + 1, revenue, cost, profit: revenue - cost }
        })
      })()

  // -- Aproveitamento da agenda por filial ---------------------------
  // Renomeado de "ocupação": o denominador é o total marcado, não a
  // capacidade instalada. É taxa de comparecimento, e o rótulo agora diz isso.
  const branchOccupancy = branchMetrics.map(b => ({
    name:         b.branchName,
    slug:         b.branchSlug,
    completed:    b.appointmentsCompleted,
    cancelled:    b.appointmentsCancelled,
    noShow:       b.appointmentsNoShow,
    total:        b.appointmentsTotal,
    occupancyPct: percent(b.appointmentsCompleted, b.appointmentsTotal) ?? 0,
  })).filter(b => b.total > 0).sort((a, b) => b.occupancyPct - a.occupancyPct)

  // -- Analytics avançados -------------------------------------------
  // Rankings vêm agregados do Postgres. Antes eram montados em JS sobre a
  // lista de atendimentos do período — que o PostgREST cortava em 1000 linhas.
  const barPct = (value: number, max: number) => (max > 0 ? (value / max) * 100 : 0)

  // 1. Top procedimentos por atendimentos
  const maxProcCount  = procedureStats[0]?.appointments ?? 0
  const topProcedures = procedureStats.map(p => ({
    name: p.name, count: p.appointments, pct: barPct(p.appointments, maxProcCount),
  }))

  // 1a. Top procedimentos por receita de serviço
  const byProcRevenue    = [...procedureStats].sort((a, b) => b.revenue - a.revenue)
  const maxProcRevenue   = byProcRevenue[0]?.revenue ?? 0
  const topProceduresByRevenue = byProcRevenue.map(p => ({
    name: p.name, revenue: p.revenue, pct: barPct(p.revenue, maxProcRevenue),
  }))

  // 1b. Recorrência: retornos do mesmo cliente no período
  const topRecurring = [...procedureStats]
    .map(p => ({ name: p.name, repeatVisits: p.repeatVisits }))
    .sort((a, b) => b.repeatVisits - a.repeatVisits)

  // 2. Top profissionais por atendimentos
  const maxProfCount     = professionalStats[0]?.appointments ?? 0
  const topProfessionals = professionalStats.map(p => ({
    name: p.name, count: p.appointments, pct: barPct(p.appointments, maxProfCount),
  }))

  const byProfRevenue  = [...professionalStats].sort((a, b) => b.revenue - a.revenue)
  const maxProfRevenue = byProfRevenue[0]?.revenue ?? 0
  const topProfessionalsByRevenue = byProfRevenue.map(p => ({
    name: p.name, revenue: p.revenue, pct: barPct(p.revenue, maxProfRevenue),
  }))

  // Comissões por profissional — a consulta antiga filtrava por
  // `commissions.created_at`, coluna que não existe: o PostgREST devolvia erro,
  // o erro era descartado e o ranking ficava permanentemente vazio.
  const byProfComm  = [...professionalStats].sort((a, b) => b.commission - a.commission)
  const maxProfComm = byProfComm[0]?.commission ?? 0
  const topProfessionalsByCommission = byProfComm.map(p => ({
    name: p.name, amount: p.commission, pct: barPct(p.commission, maxProfComm),
  }))

  // 3. Margem por procedimento — inclui mão de obra e outros custos, que já
  // existem no cadastro e ficavam de fora (a margem saía sempre otimista).
  const procedureMargins = ((proceduresRaw ?? []) as any[])
    .map(proc => {
      const inputs = ((proc.procedure_products as any[]) ?? []).reduce((s: number, pp: any) =>
        s + (Number(pp.quantity) * Number(pp.products?.cost_price ?? 0)), 0)
      const cost      = inputs + Number(proc.labor_cost ?? 0) + Number(proc.other_costs ?? 0)
      const price     = Number(proc.price ?? 0)
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0
      return { name: proc.name as string, price, cost, marginPct }
    })
    .filter(p => p.price > 0)
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, 5)

  // 4. Avaliações — exige pelo menos 3 notas para entrar no ranking; com uma
  // nota só, um único atendimento definia o "melhor" e o "pior" da rede.
  const MIN_RATINGS = 3

  const ratedProfessionals = professionalStats
    .filter(p => p.avgRating != null && p.ratingCount >= MIN_RATINGS)
    .map(p => ({ name: p.name, avgRating: p.avgRating!, count: p.ratingCount }))

  const bestRatedPros  = [...ratedProfessionals].sort((a, b) => b.avgRating - a.avgRating).slice(0, 5)
  const worstRatedPros = [...ratedProfessionals].sort((a, b) => a.avgRating - b.avgRating).slice(0, 5)

  const ratedProcedures = procedureStats
    .filter(p => p.avgRating != null && p.ratingCount >= MIN_RATINGS)
    .map(p => ({ name: p.name, avgRating: p.avgRating!, count: p.ratingCount }))

  const bestRatedProcedures  = [...ratedProcedures].sort((a, b) => b.avgRating - a.avgRating).slice(0, 5)
  const worstRatedProcedures = [...ratedProcedures].sort((a, b) => a.avgRating - b.avgRating).slice(0, 5)

  // 5. Clientes — "Atend." agora é a contagem de atendimentos concluídos, não
  // a de transações financeiras (que inclui venda de produto e parcelas).
  const topClients = clientStats.slice(0, 5).map(c => ({
    id: c.clientId, name: c.name, totalSpent: c.totalSpent, appointmentCount: c.appointments,
  }))

  const byRecurrence   = [...clientStats].sort((a, b) => b.appointments - a.appointments).slice(0, 5)
  const maxClientCount = byRecurrence[0]?.appointments ?? 0
  const topClientsByRecurrence = byRecurrence.map(c => ({
    name: c.name, count: c.appointments, pct: barPct(c.appointments, maxClientCount),
  }))

  // 8. Distribuição de clientes por faixa etária
  const clientsDemo = (clientsDemoRaw ?? []) as any[]
  const now2        = new Date()
  const ageBuckets: Record<string, number> = { '< 18': 0, '18–25': 0, '26–35': 0, '36–45': 0, '46–55': 0, '55+': 0 }
  for (const c of clientsDemo) {
    if (!c.birth_date) continue
    const age = Math.floor((now2.getTime() - new Date(c.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    const key = age < 18 ? '< 18' : age <= 25 ? '18–25' : age <= 35 ? '26–35' : age <= 45 ? '36–45' : age <= 55 ? '46–55' : '55+'
    ageBuckets[key] = (ageBuckets[key] ?? 0) + 1
  }
  const sortedAgeGroups = Object.entries(ageBuckets)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
  // Percentual sobre o TOTAL de clientes classificados — é a legenda de uma
  // pizza. Antes era sobre o maior grupo, então a maior faixa mostrava sempre
  // 100% e a soma da legenda não fechava em 100%.
  const totalAgeClassified = sortedAgeGroups.reduce((s, [, count]) => s + count, 0)
  const clientAgeGroups = sortedAgeGroups.map(([label, count]) => ({
    label, count, pct: percent(count, totalAgeClassified) ?? 0,
  }))

  // 9. Top 5 cidades por número de clientes
  const cityMap: Record<string, number> = {}
  for (const c of clientsDemo) {
    if (!c.city) continue
    cityMap[c.city] = (cityMap[c.city] ?? 0) + 1
  }
  const sortedCities  = Object.entries(cityMap).sort(([, a], [, b]) => b - a).slice(0, 5)
  const maxCityCount  = sortedCities[0]?.[1] ?? 1
  const topClientsByLocation = sortedCities.map(([city, count]) => ({ city, count, pct: (count / maxCityCount) * 100 }))

  // -- Hotmap: dados brutos para geocoding client-side ------------------
  // O geocoding (BrasilAPI + Nominatim) é feito pelo componente HotmapSection
  // no browser para não bloquear o SSR do dashboard.
  const hotmapRawBranches = branches.map(b => ({
    id:      b.id as string,
    name:    b.name as string,
    slug:    b.slug as string,
    cityKey: [b.city, b.state].filter(Boolean).join(', '),
  }))

  const hotmapRawCepCounts: Record<string, number> = {}
  for (const c of clientsDemo) {
    const digits = ((c.zip_code as string | null) ?? '').replace(/\D/g, '')
    if (digits.length !== 8) continue
    hotmapRawCepCounts[digits] = (hotmapRawCepCounts[digits] ?? 0) + 1
  }

  // LTV por cliente desde sempre, agregado no banco. Antes vinha de um select
  // sem limite de "todas as transações da história", cortado em 1000 linhas.
  const clientLtvMap: Record<string, number> = {}
  for (const c of ltvStats) clientLtvMap[c.clientId] = c.totalSpent

  const hotmapRawCepLtv: Record<string, number> = {}
  for (const c of clientsDemo) {
    const digits = ((c.zip_code as string | null) ?? '').replace(/\D/g, '')
    if (digits.length !== 8) continue
    const ltv = clientLtvMap[c.id as string] ?? 0
    if (ltv === 0) continue
    hotmapRawCepLtv[digits] = (hotmapRawCepLtv[digits] ?? 0) + ltv
  }

  // -- Comercial: funil de leads por estágio + conversão (gate crm) --------
  // O funil vem do banco e inclui os leads da REDE (branch_id null). A rede
  // pode ter mais de um funil, então o gráfico mostra UM: o escolhido em
  // `?funil=`, ou o padrão. Empilhar todos misturaria etapas que não se
  // sucedem — "Novo" de vendas somado com "Novo" de recuperação.
  const funnels = canCrm ? await seedDefaultFunnel(ctx.tenantId!) : []
  const funisAtivos = funnels.filter(f => f.archived_at === null)
  const funilAtivo  = funisAtivos.find(f => f.id === rawFunil)
    ?? funisAtivos.find(f => f.is_default)
    ?? funisAtivos[0]

  const funnelStages = canCrm
    ? await getLeadFunnel({
        tenantId: ctx.tenantId!, branchIds: null,
        from: startDate, to: endDate,
        funnelId: funilAtivo?.id ?? null,
      })
    : []

  const leadFunnel     = funnelStages.map(s => ({ name: s.name, count: s.leads }))
  const leadsTotal     = funnelStages.reduce((s, st) => s + st.leads, 0)
  const leadsConverted = funnelStages.reduce((s, st) => s + st.converted, 0)
  const conversionRate = percent(leadsConverted, leadsTotal) ?? 0

  // -- Marketing: alcance/gasto (Meta Ads, tempo real) + campanhas (gate marketing) --
  let marketing: {
    connected: boolean; spend: number; reach: number
    activeCampaigns: number; totalCampaigns: number; notifActive: number
  } | null = null
  if (canMarketing) {
    const adsPreset: DatePreset =
      period === 'today' ? 'today' : period === '7d' ? '7d' : period === 'all' ? 'all' : '30d'
    let spend = 0, reach = 0, activeCampaigns = 0, totalCampaigns = 0, connected = false
    try {
      const cfg = await getAdsConfig(ctx.tenantId!, 'meta_ads')
      if (cfg) {
        connected = true
        const campaigns = await resolveAdsProvider(cfg).getCampaigns({ preset: adsPreset })
        spend           = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
        reach           = campaigns.reduce((s, c) => s + (c.reach ?? 0), 0)
        activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length
        totalCampaigns  = campaigns.length
      }
    } catch { /* integração indisponível → connected=false */ }
    const { count: notifActive } = await admin
      .from('notification_campaigns').select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!).eq('status', 'ACTIVE')
    marketing = { connected, spend, reach, activeCampaigns, totalCampaigns, notifActive: notifActive ?? 0 }
  }

  return (
    <>
      <RealtimeRefresher
        tables={['appointments', 'financial_transactions', 'treatment_plans', 'branch_product_stock']}
      />
      <AdminDashboardView
        permissions={ctx.permissions}
        userName={ctx.userName}
        leadFunnel={leadFunnel}
        funnels={funisAtivos.map(f => ({ id: f.id, name: f.name }))}
        activeFunnelId={funilAtivo?.id ?? ''}
        leadsTotal={leadsTotal}
        leadsConverted={leadsConverted}
        conversionRate={conversionRate}
        marketing={marketing}
        monthLabel={periodLabel}
        currentPeriod={selectorPeriod}
        customFrom={rawFrom}
        customTo={rawTo}
        granularity={granularity}
        totalRevenue={totalRevenue}
        totalCost={totalCost}
        totalAppointments={totalAppointments}
        newClients={newClients}
        ticketMedio={ticketMedio}
        totalClientsEver={totalClientsEver ?? 0}
        branchCount={branches.length}
        prevRevenue={prevRevenue}
        prevAppointments={prevAppointments}
        prevNewClients={prevClientsCount ?? 0}
        branchStats={branchStats}
        todayTotal={todayAppts.length}
        todayByBranch={todayByBranch}
        pendingPlans={pendingPlans}
        lowStockItems={lowStockItems}
        stockStatus={stockStatus}
        zeroStockCount={zeroStockCount}
        lowStockCount={lowStockCount}
        stockTurnover={stockTurnover}
        evolutionData={evolutionData}
        branchOccupancy={branchOccupancy}
        topProcedures={topProcedures}
        topProceduresByRevenue={topProceduresByRevenue}
        topRecurring={topRecurring}
        topProfessionals={topProfessionals}
        topProfessionalsByRevenue={topProfessionalsByRevenue}
        topProfessionalsByCommission={topProfessionalsByCommission}
        procedureMargins={procedureMargins}

        bestRatedPros={bestRatedPros}
        worstRatedPros={worstRatedPros}
        bestRatedProcedures={bestRatedProcedures}
        worstRatedProcedures={worstRatedProcedures}
        topClients={topClients}
        topClientsByRecurrence={topClientsByRecurrence}
        clientAgeGroups={clientAgeGroups}
        topClientsByLocation={topClientsByLocation}
        hotmapRawBranches={hotmapRawBranches}
        hotmapRawCepCounts={hotmapRawCepCounts}
        hotmapRawCepLtv={hotmapRawCepLtv}
      />
    </>
  )
}
