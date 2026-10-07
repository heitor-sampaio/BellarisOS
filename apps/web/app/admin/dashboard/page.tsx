import { getTenantContext, isOwnScope, temRecurso } from '@/lib/auth'
import { redirect } from 'next/navigation'
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
  getTopClients, getLeadFunnel, getRankingDeComissao,
} from '@/lib/metrics'
import { getDemografia, getGiroDeEstoque, type Demografia } from '@/lib/metrics/demografia'
import { seedDefaultFunnel } from '@/actions/crm-funnels'
import { ler, contar } from '@/lib/db'

// -- Linhas como os selects as pedem ---------------------------------
type Num = number | string | null
type AgendamentoDeHoje = { id: string; status: string; branch_id: string }
type PlanoPendente = {
  id: string; branch_id: string; created_at: string
  clients: { name: string } | null; branches: { name: string; slug: string } | null
}
type SaldoLido = {
  current_stock: Num; min_stock: Num; branch_id: string
  products: { name: string; is_active: boolean } | null
  branches: { name: string; slug: string } | null
}
type ProcedimentoLido = {
  id: string; name: string; price: Num; labor_cost: Num; other_costs: Num
  procedure_products: { quantity: Num; products: { cost_price: Num } | null }[] | null
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; funil?: string }>
}) {
  const { period: rawPeriod, from: rawFrom, to: rawTo, funil: rawFunil } = await searchParams

  const ctx   = await getTenantContext()

  // A mesma trava do `admin/layout.tsx`, repetida DE PROPÓSITO: layout e página
  // renderizam em paralelo, e o `redirect` do layout decide a resposta mas não
  // impede esta página de rodar as consultas dela. O dashboard é a única tela
  // da rede sem `assertPermission` (toda a equipe da rede o vê), então é ele
  // que precisa mandar embora quem não é da rede. Visto no E2E de portais: o
  // cliente final fazia esta página consultar o banco com `tenantId` nulo.
  if (ctx.isClient) redirect('/login')
  if (ctx.branchId !== null && !ctx.isNetworkAdmin) redirect('/')

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
  const branchesRaw = await ler(admin
    .from('branches')
    .select('id, name, slug, city, state')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name'), 'carregar as unidades')

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
    totalClientsEver,
    todayApptsRaw,
    pendingPlansRaw,
    bpsRaw,
    proceduresRaw,
    stockTurnover,
    demografia,
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

    // Total de clientes da rede (all time)
    contar(admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true), 'contar os clientes da rede'),

    // Agendamentos de hoje (exceto cancelados e no-show)
    ler(admin.from('appointments')
      .select('id, status, branch_id')
      .in('branch_id', branchIds)
      .gte('scheduled_at', startOfToday.toISOString())
      .lte('scheduled_at', endOfToday.toISOString())
      .neq('status', 'CANCELLED')
      .neq('status', 'NO_SHOW'), 'carregar os agendamentos de hoje'),

    // Planos de tratamento aguardando checkout
    ler(admin.from('treatment_plans')
      .select('id, branch_id, created_at, clients(name), branches(name, slug)')
      .in('branch_id', branchIds)
      .eq('status', 'PROPOSED')
      .order('created_at', { ascending: true })
      .limit(20), 'carregar os planos aguardando checkout'),

    // Estoque: produtos com min_stock configurado OU zerados (para indicador de saúde)
    ler(admin.from('branch_product_stock')
      .select('current_stock, min_stock, branch_id, products(name, is_active), branches(name, slug)')
      .in('branch_id', branchIds)
      .or('min_stock.gt.0,current_stock.eq.0')
      .order('current_stock', { ascending: true }), 'carregar os saldos de estoque'),

    // Procedimentos ativos com custo variável (para cálculo de margem)
    ler(admin.from('procedures')
      .select('id, name, price, labor_cost, other_costs, procedure_products(quantity, products(cost_price))')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true), 'carregar os procedimentos'),

    // Giro do período: consumo em procedimentos, ao custo do MOVIMENTO (não
    // ao custo atual do produto, que mudaria o giro a cada compra). Fim do
    // PERÍODO e não "agora": o consumo que acabou de ser baixado nasce com o
    // relógio do Postgres, que está à frente do relógio do app. Somado no
    // banco: em JS, passando de 1000 movimentos, subcontava.
    getGiroDeEstoque({ branchIds, from: startDate, to: periodInfo.fullTo }),

    // Demografia — todos os clientes da rede, contada no banco (idade, cidade,
    // CEP e LTV por CEP). Antes vinha a base inteira e era cortada em 1000.
    getDemografia({ tenantId: ctx.tenantId!, branchIds, to: endDate }),
  ]) : [
    { ...EMPTY_CORE }, { ...EMPTY_CORE }, [], [], [], [], [],
    0, [], [], [], [], 0, { idades: [], cidades: [], ceps: [] } as Demografia,
  ]

  const todayAppts = (todayApptsRaw ?? []) as AgendamentoDeHoje[]

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
  const pendingPlans: AlertPendingPlan[] = ((pendingPlansRaw ?? []) as unknown as PlanoPendente[]).map(p => ({
    id:         p.id,
    clientName: p.clients?.name ?? 'Cliente',
    branchName: p.branches?.name ?? '—',
    branchSlug: p.branches?.slug ?? '',
    createdAt:  p.created_at,
  }))

  const allBps = (bpsRaw ?? []) as unknown as SaldoLido[]

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

  // Comissões por profissional. Quanto cada um ganha é do FINANCEIRO, e de
  // todos: o ranking vivia dentro da seção de equipe, e quem só via a equipe
  // (ou só as próprias comissões) via o de todo mundo. E ordena pela comissão
  // de verdade — antes era o top 5 por atendimentos, reordenado.
  const verComissoesDaEquipe = canFinancial && !isOwnScope(ctx, 'financial')
  const rankingDeComissao = verComissoesDaEquipe && needsCore
    ? await getRankingDeComissao({ ...metricArgs, limit: 5 })
    : []
  const maxProfComm = rankingDeComissao[0]?.commission ?? 0
  const topProfessionalsByCommission = rankingDeComissao.map(p => ({
    name: p.name, amount: p.commission, pct: barPct(p.commission, maxProfComm),
  }))

  // 3. Margem por procedimento — inclui mão de obra e outros custos, que já
  // existem no cadastro e ficavam de fora (a margem saía sempre otimista).
  const procedureMargins = ((proceduresRaw ?? []) as unknown as ProcedimentoLido[])
    .map(proc => {
      const inputs = (proc.procedure_products ?? []).reduce((s: number, pp) =>
        s + (Number(pp.quantity) * Number(pp.products?.cost_price ?? 0)), 0)
      const cost      = inputs + Number(proc.labor_cost ?? 0) + Number(proc.other_costs ?? 0)
      const price     = Number(proc.price ?? 0)
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0
      return { name: proc.name, price, cost, marginPct }
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
  // As faixas vêm contadas do banco (`metrics_demografia`); aqui só a ordem.
  const sortedAgeGroups = demografia.idades
    .map(i => [i.faixa, i.n] as const)
    .sort(([, a], [, b]) => b - a)
  // Percentual sobre o TOTAL de clientes classificados — é a legenda de uma
  // pizza. Antes era sobre o maior grupo, então a maior faixa mostrava sempre
  // 100% e a soma da legenda não fechava em 100%.
  const totalAgeClassified = sortedAgeGroups.reduce((s, [, count]) => s + count, 0)
  const clientAgeGroups = sortedAgeGroups.map(([label, count]) => ({
    label, count, pct: percent(count, totalAgeClassified) ?? 0,
  }))

  // 9. Top 5 cidades por número de clientes
  const maxCityCount  = demografia.cidades[0]?.n ?? 1
  const topClientsByLocation = demografia.cidades.map(c => ({ city: c.cidade, count: c.n, pct: (c.n / maxCityCount) * 100 }))

  // -- Hotmap: dados brutos para geocoding client-side ------------------
  // O geocoding (BrasilAPI + Nominatim) é feito pelo componente HotmapSection
  // no browser para não bloquear o SSR do dashboard.
  const hotmapRawBranches = branches.map(b => ({
    id:      b.id as string,
    name:    b.name as string,
    slug:    b.slug as string,
    cityKey: [b.city, b.state].filter(Boolean).join(', '),
  }))

  // Clientes e LTV por CEP vêm somados do banco. O LTV é o de
  // `metrics_top_clients` desde sempre — a mesma regra do dinheiro, não uma
  // segunda cópia dela.
  const hotmapRawCepCounts: Record<string, number> = {}
  const hotmapRawCepLtv: Record<string, number> = {}
  for (const c of demografia.ceps) {
    hotmapRawCepCounts[c.cep] = c.n
    if (c.ltv > 0) hotmapRawCepLtv[c.cep] = c.ltv
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
      // Anúncios fora do PLANO da rede: o quadro não consulta a Meta.
      const cfg = temRecurso(ctx, 'anuncios') ? await getAdsConfig(ctx.tenantId!, 'meta_ads') : null
      if (cfg) {
        connected = true
        const campaigns = await resolveAdsProvider(cfg).getCampaigns({ preset: adsPreset })
        spend           = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
        reach           = campaigns.reduce((s, c) => s + (c.reach ?? 0), 0)
        activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length
        totalCampaigns  = campaigns.length
      }
    } catch { /* integração indisponível → connected=false */ }
    const notifActive = await contar(admin
      .from('notification_campaigns').select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!).eq('status', 'ACTIVE'), 'contar as campanhas ativas')
    marketing = { connected, spend, reach, activeCampaigns, totalCampaigns, notifActive }
  }

  return (
    <>
      <RealtimeRefresher
        tables={['appointments', 'financial_transactions', 'branch_product_stock']}
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
        verComissoesDaEquipe={verComissoesDaEquipe}
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
