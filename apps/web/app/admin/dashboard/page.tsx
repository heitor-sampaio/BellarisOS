import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import type {
  BranchStat,
  TodayBranchStat,
  AlertPendingPlan,
  AlertLowStock,
} from '@/components/admin/admin-dashboard-view'
import { AdminDashboardDynamic as AdminDashboardView } from '@/components/admin/admin-dashboard-dynamic'

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const { period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams

  const ctx   = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')

  const admin = createAdminClient()
  const now   = new Date()

  // -- Período selecionado -------------------------------------------
  const msPerDay = 86_400_000
  type Period = 'today' | '7d' | '15d' | 'month' | 'all' | 'custom'
  const period = ((rawPeriod ?? 'month') as Period)

  let startDate: Date
  let endDate:   Date
  let prevStart: Date
  let prevEnd:   Date

  if (period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    endDate   = now
    prevStart = new Date(startDate.getTime() - msPerDay)
    prevEnd   = new Date(startDate.getTime() - 1)
  } else if (period === '7d') {
    startDate = new Date(now.getTime() - 7 * msPerDay); startDate.setHours(0, 0, 0, 0)
    endDate   = now
    prevEnd   = new Date(startDate.getTime() - 1)
    prevStart = new Date(prevEnd.getTime() - 7 * msPerDay); prevStart.setHours(0, 0, 0, 0)
  } else if (period === '15d') {
    startDate = new Date(now.getTime() - 15 * msPerDay); startDate.setHours(0, 0, 0, 0)
    endDate   = now
    prevEnd   = new Date(startDate.getTime() - 1)
    prevStart = new Date(prevEnd.getTime() - 15 * msPerDay); prevStart.setHours(0, 0, 0, 0)
  } else if (period === 'custom' && rawFrom && rawTo) {
    startDate = new Date(rawFrom + 'T00:00:00')
    endDate   = new Date(rawTo   + 'T23:59:59.999')
    const dur = endDate.getTime() - startDate.getTime()
    prevEnd   = new Date(startDate.getTime() - 1)
    prevStart = new Date(prevEnd.getTime() - dur)
  } else if (period === 'all') {
    startDate = new Date(2000, 0, 1)
    endDate   = now
    prevStart = new Date(1999, 0, 1)
    prevEnd   = new Date(1999, 11, 31, 23, 59, 59, 999)
  } else {
    // month (default)
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate   = now
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  }

  const periodLabel =
    period === 'today'  ? `Hoje, ${now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}` :
    period === '7d'     ? 'Últimos 7 dias' :
    period === '15d'    ? 'Últimos 15 dias' :
    period === 'all'    ? 'Todo período' :
    period === 'custom' ? `${startDate.toLocaleDateString('pt-BR')} – ${endDate.toLocaleDateString('pt-BR')}` :
    now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())

  // -- Datas fixas (não afetadas pelo seletor) -----------------------
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  // -- Filiais -------------------------------------------------------
  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug, city, state')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  const branches  = branchesRaw ?? []
  const branchIds = branches.map(b => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // -- Queries paralelas ---------------------------------------------
  const [
    { data: txsCurrRaw },
    { data: txsPrevRaw },
    { data: apptsCurrRaw },
    { data: apptsPrevRaw },
    { data: clientsCurrRaw },
    { count: totalClientsEver },
    { data: todayApptsRaw },
    { data: pendingPlansRaw },
    { data: bpsRaw },
    { data: proceduresRaw },
    { data: txWithClientRaw },
    { data: allMonthlyApptsRaw },
    { data: stockMovementsRaw },
    { data: commissionsRaw },
    { data: clientsDemoRaw },
    { data: ltvTxsRaw },
    { count: prevClientsCount },
  ] = await Promise.all([

    // Transações do período corrente (created_at incluído para gráfico diário)
    admin.from('financial_transactions')
      .select('amount, type, is_paid, branch_id, created_at')
      .in('branch_id', branchIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),

    // Transações do período anterior (para comparação de delta)
    admin.from('financial_transactions')
      .select('amount, type, is_paid, branch_id')
      .in('branch_id', branchIds)
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', prevEnd.toISOString()),

    // Atendimentos concluídos no período corrente
    admin.from('appointments')
      .select('id, branch_id, procedure_id, professional_id, client_id, started_at, completed_at, price, client_rating, procedure_rating, procedures(name), users(name), clients(name, id)')
      .in('branch_id', branchIds)
      .eq('status', 'COMPLETED')
      .gte('scheduled_at', startDate.toISOString())
      .lte('scheduled_at', endDate.toISOString()),

    // Atendimentos concluídos no período anterior (só contagem)
    admin.from('appointments')
      .select('id, branch_id')
      .in('branch_id', branchIds)
      .eq('status', 'COMPLETED')
      .gte('scheduled_at', prevStart.toISOString())
      .lte('scheduled_at', prevEnd.toISOString()),

    // Novos clientes no período corrente
    admin.from('clients')
      .select('id, branch_id')
      .in('branch_id', branchIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),

    // Total de clientes da rede (all time)
    admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!),

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
      .select('id, name, price, procedure_products(quantity, products(cost_price))')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true),

    // Transações do período com client_id direto (ranking de clientes por gasto)
    admin.from('financial_transactions')
      .select('amount, client_id')
      .in('branch_id', branchIds)
      .eq('type', 'INCOME')
      .eq('is_paid', true)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .not('client_id', 'is', null),

    // Todos os agendamentos do período (qualquer status) para cálculo de ocupação
    admin.from('appointments')
      .select('id, branch_id, status')
      .in('branch_id', branchIds)
      .gte('scheduled_at', startDate.toISOString())
      .lte('scheduled_at', endDate.toISOString()),

    // Giro do período: apenas consumo de procedimentos (PROCEDURE_USAGE)
    admin.from('stock_movements')
      .select('quantity, created_at, products(cost_price)')
      .in('branch_id', branchIds)
      .eq('type', 'PROCEDURE_USAGE')
      .gte('created_at', startDate.toISOString()),

    // Comissões do período corrente por profissional
    admin.from('commissions')
      .select('amount, professional_id, users(name)')
      .in('branch_id', branchIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),

    // Dados demográficos — todos os clientes da rede (tenant_id, não branch_id)
    admin.from('clients')
      .select('id, name, birth_date, city, zip_code')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true),

    // LTV all-time: transações pagas com client_id direto (sem join via appointment)
    admin.from('financial_transactions')
      .select('amount, client_id')
      .in('branch_id', branchIds)
      .eq('type', 'INCOME')
      .eq('is_paid', true)
      .not('client_id', 'is', null),

    // Novos clientes no período anterior (para delta de novos clientes)
    admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .in('branch_id', branchIds)
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', prevEnd.toISOString()),
  ])

  const txsCurr     = (txsCurrRaw     ?? []) as any[]
  const txsPrev     = (txsPrevRaw     ?? []) as any[]
  const apptsCurr   = (apptsCurrRaw   ?? []) as any[]
  const apptsPrev   = (apptsPrevRaw   ?? []) as any[]
  const clientsCurr = (clientsCurrRaw ?? []) as any[]
  const todayAppts  = (todayApptsRaw  ?? []) as any[]

  // -- KPIs consolidados ---------------------------------------------
  const totalRevenue = txsCurr
    .filter(t => t.type === 'INCOME' && t.is_paid)
    .reduce((s, t) => s + Number(t.amount), 0)

  const prevRevenue = txsPrev
    .filter(t => t.type === 'INCOME' && t.is_paid)
    .reduce((s, t) => s + Number(t.amount), 0)

  const totalAppointments = apptsCurr.length
  const prevAppointments  = apptsPrev.length
  const newClients        = clientsCurr.length
  const ticketMedio       = totalAppointments > 0 ? totalRevenue / totalAppointments : 0

  // -- Por filial ----------------------------------------------------
  const branchStats: BranchStat[] = branches.map(branch => {
    const bTxs   = txsCurr.filter(t => t.branch_id === branch.id)
    const bAppts = apptsCurr.filter(a => a.branch_id === branch.id)
    const bNew   = clientsCurr.filter(c => c.branch_id === branch.id)
    const rev    = bTxs.filter(t => t.type === 'INCOME' && t.is_paid)
                       .reduce((s, t) => s + Number(t.amount), 0)
    return {
      id:           branch.id,
      name:         branch.name,
      slug:         branch.slug,
      revenue:      rev,
      appointments: bAppts.length,
      newClients:   bNew.length,
      ticketMedio:  bAppts.length > 0 ? rev / bAppts.length : 0,
    }
  })

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
  const stockTurnover = ((stockMovementsRaw ?? []) as any[])
    .reduce((s, m) => s + Math.abs(Number(m.quantity)) * Number(m.unit_cost ?? m.products?.cost_price ?? 0), 0)

  // totalCost = apenas despesas financeiras registradas (FinancialTransactions)
  // stockTurnover é métrica derivada de margem — não entra no total de despesas
  const totalCost = txsCurr
    .filter(t => t.type === 'EXPENSE')
    .reduce((s, t) => s + Number(t.amount), 0)

  // -- Gráfico de evolução -------------------------------------------
  const stockMoves  = (stockMovementsRaw ?? []) as any[]
  const granularity = period === 'today' ? 'hour' : 'day'

  function buildSlice(sliceStart: number, sliceEnd: number, idx: number) {
    const inSlice = (t: any) => {
      const ts = new Date(t.created_at).getTime()
      return ts >= sliceStart && ts <= sliceEnd
    }
    const dayRevenue = txsCurr
      .filter(t => inSlice(t) && t.type === 'INCOME' && t.is_paid)
      .reduce((s: number, t: any) => s + Number(t.amount), 0)
    const expenseCost = txsCurr
      .filter(t => inSlice(t) && t.type === 'EXPENSE')
      .reduce((s: number, t: any) => s + Number(t.amount), 0)
    return { day: idx, revenue: dayRevenue, cost: expenseCost, profit: dayRevenue - expenseCost }
  }

  const evolutionData = granularity === 'hour'
    ? Array.from({ length: 24 }, (_, i) => {
        const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), i).getTime()
        return buildSlice(s, s + 3_600_000 - 1, i)
      })
    : (() => {
        const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1)
        return Array.from({ length: days }, (_, i) => {
          const base = new Date(startDate); base.setDate(base.getDate() + i); base.setHours(0, 0, 0, 0)
          return buildSlice(base.getTime(), base.getTime() + msPerDay - 1, i + 1)
        })
      })()

  // -- Ocupação por filial -------------------------------------------
  // Numerador: slots que viraram atendimento (COMPLETED + IN_PROGRESS)
  // Denominador: todos os horários passados do mês (exceto futuros ainda agendados)
  const allMonthlyAppts = (allMonthlyApptsRaw ?? []) as any[]

  const branchOccupancy = branches.map(branch => {
    const bAppts    = allMonthlyAppts.filter(a => a.branch_id === branch.id)
    const completed = bAppts.filter(a => a.status === 'COMPLETED' || a.status === 'IN_PROGRESS').length
    const total     = bAppts.length
    return {
      name:          branch.name,
      slug:          branch.slug,
      completed,
      cancelled:     bAppts.filter(a => a.status === 'CANCELLED').length,
      noShow:        bAppts.filter(a => a.status === 'NO_SHOW').length,
      total,
      occupancyPct:  total > 0 ? (completed / total) * 100 : 0,
    }
  }).filter(b => b.total > 0).sort((a, b) => b.occupancyPct - a.occupancyPct)

  // -- Analytics avançados -------------------------------------------

  // 1. Top procedimentos por atendimentos
  const procCountMap: Record<string, { name: string; count: number }> = {}
  for (const a of apptsCurr) {
    if (!a.procedure_id) continue
    if (!procCountMap[a.procedure_id]) {
      procCountMap[a.procedure_id] = { name: (a.procedures as any)?.name ?? '—', count: 0 }
    }
    procCountMap[a.procedure_id]!.count++
  }
  const sortedProcs   = Object.values(procCountMap).sort((a, b) => b.count - a.count).slice(0, 5)
  const maxProcCount  = sortedProcs[0]?.count ?? 1
  const topProcedures = sortedProcs.map(p => ({ ...p, pct: (p.count / maxProcCount) * 100 }))

  // 1a. Top procedimentos por receita bruta
  const procRevenueMap: Record<string, { name: string; revenue: number }> = {}
  for (const a of apptsCurr) {
    if (!a.procedure_id) continue
    if (!procRevenueMap[a.procedure_id])
      procRevenueMap[a.procedure_id] = { name: (a.procedures as any)?.name ?? '—', revenue: 0 }
    procRevenueMap[a.procedure_id]!.revenue += Number(a.price ?? 0)
  }
  const sortedProcsByRev      = Object.values(procRevenueMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const maxProcRevenue        = sortedProcsByRev[0]?.revenue ?? 1
  const topProceduresByRevenue = sortedProcsByRev.map(p => ({ ...p, pct: (p.revenue / maxProcRevenue) * 100 }))

  // 1b. Top 5 procedimentos por recorrência (retornos do mesmo cliente no período)
  const procRecMap: Record<string, { name: string; clientCounts: Record<string, number> }> = {}
  for (const a of apptsCurr) {
    if (!a.procedure_id || !a.client_id) continue
    if (!procRecMap[a.procedure_id]) {
      procRecMap[a.procedure_id] = { name: (a.procedures as any)?.name ?? '—', clientCounts: {} }
    }
    const m = procRecMap[a.procedure_id]!
    m.clientCounts[a.client_id] = (m.clientCounts[a.client_id] ?? 0) + 1
  }
  const topRecurring = Object.values(procRecMap)
    .map(p => ({
      name:         p.name,
      repeatVisits: Object.values(p.clientCounts).reduce((s, c) => s + Math.max(0, c - 1), 0),
    }))
    .sort((a, b) => b.repeatVisits - a.repeatVisits)
    .slice(0, 5)

  // 2. Top profissionais por atendimentos
  const profCountMap: Record<string, { name: string; count: number }> = {}
  for (const a of apptsCurr) {
    if (!a.professional_id) continue
    if (!profCountMap[a.professional_id]) {
      profCountMap[a.professional_id] = { name: (a.users as any)?.name ?? '—', count: 0 }
    }
    profCountMap[a.professional_id]!.count++
  }
  const sortedProfs    = Object.values(profCountMap).sort((a, b) => b.count - a.count).slice(0, 5)
  const maxProfCount   = sortedProfs[0]?.count ?? 1
  const topProfessionals = sortedProfs.map(p => ({ ...p, pct: (p.count / maxProfCount) * 100 }))

  // Top 5 profissionais por receita gerada
  const profRevenueMap: Record<string, { name: string; revenue: number }> = {}
  for (const a of apptsCurr) {
    if (!a.professional_id) continue
    if (!profRevenueMap[a.professional_id])
      profRevenueMap[a.professional_id] = { name: (a.users as any)?.name ?? '—', revenue: 0 }
    profRevenueMap[a.professional_id]!.revenue += Number(a.price ?? 0)
  }
  const sortedProfsByRev    = Object.values(profRevenueMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const maxProfRevenue      = sortedProfsByRev[0]?.revenue ?? 1
  const topProfessionalsByRevenue = sortedProfsByRev.map(p => ({ ...p, pct: (p.revenue / maxProfRevenue) * 100 }))

  // Top 5 profissionais por comissão
  const commissionsArr = (commissionsRaw ?? []) as any[]
  const profCommMap: Record<string, { name: string; amount: number }> = {}
  for (const c of commissionsArr) {
    if (!c.professional_id) continue
    if (!profCommMap[c.professional_id])
      profCommMap[c.professional_id] = { name: (c.users as any)?.name ?? '—', amount: 0 }
    profCommMap[c.professional_id]!.amount += Number(c.amount ?? 0)
  }
  const sortedProfsByComm   = Object.values(profCommMap).sort((a, b) => b.amount - a.amount).slice(0, 5)
  const maxProfComm         = sortedProfsByComm[0]?.amount ?? 1
  const topProfessionalsByCommission = sortedProfsByComm.map(p => ({ ...p, pct: (p.amount / maxProfComm) * 100 }))

  // 3. Top 5 procedimentos por margem de lucro bruta
  const procedureMargins = ((proceduresRaw ?? []) as any[])
    .map(proc => {
      const cost = ((proc.procedure_products as any[]) ?? []).reduce((s: number, pp: any) => {
        return s + (Number(pp.quantity) * Number(pp.products?.cost_price ?? 0))
      }, 0)
      const price    = Number(proc.price ?? 0)
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0
      return { name: proc.name as string, price, cost, marginPct }
    })
    .filter(p => p.price > 0)
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, 5)

  // 4. Tempo médio de atendimento (entre started_at e completed_at)
  const durations = apptsCurr
    .filter(a => a.started_at && a.completed_at)
    .map(a => (new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()) / 60000)
    .filter(d => d > 0 && d < 480) // exclui outliers > 8h
  const avgDurationMinutes = durations.length > 0
    ? durations.reduce((s, d) => s + d, 0) / durations.length
    : 0

  // 5. Avaliações de profissionais (campo client_rating em appointments)
  const ratingMap: Record<string, { name: string; total: number; count: number }> = {}
  for (const a of apptsCurr) {
    if (!a.professional_id || a.client_rating == null) continue
    if (!ratingMap[a.professional_id]) {
      ratingMap[a.professional_id] = { name: (a.users as any)?.name ?? '—', total: 0, count: 0 }
    }
    ratingMap[a.professional_id]!.total += Number(a.client_rating)
    ratingMap[a.professional_id]!.count++
  }
  const ratedProfessionals = Object.values(ratingMap)
    .filter(p => p.count >= 1)
    .map(p => ({ name: p.name, avgRating: p.total / p.count, count: p.count }))

  const bestRatedPros  = [...ratedProfessionals].sort((a, b) => b.avgRating - a.avgRating).slice(0, 5)
  const worstRatedPros = [...ratedProfessionals].sort((a, b) => a.avgRating - b.avgRating).slice(0, 5)

  // 5b. Avaliações de procedimentos (campo procedure_rating em appointments)
  const procRatingMap: Record<string, { name: string; total: number; count: number }> = {}
  for (const a of apptsCurr) {
    if (!a.procedure_id || a.procedure_rating == null) continue
    if (!procRatingMap[a.procedure_id]) {
      procRatingMap[a.procedure_id] = { name: (a.procedures as any)?.name ?? '—', total: 0, count: 0 }
    }
    procRatingMap[a.procedure_id]!.total += Number(a.procedure_rating)
    procRatingMap[a.procedure_id]!.count++
  }
  const ratedProcedures = Object.values(procRatingMap)
    .filter(p => p.count >= 1)
    .map(p => ({ name: p.name, avgRating: p.total / p.count, count: p.count }))

  const bestRatedProcedures  = [...ratedProcedures].sort((a, b) => b.avgRating - a.avgRating).slice(0, 5)
  const worstRatedProcedures = [...ratedProcedures].sort((a, b) => a.avgRating - b.avgRating).slice(0, 5)

  // 6. Top 10 clientes por valor gasto no período
  const clientNameMap: Record<string, string> = {}
  for (const c of (clientsDemoRaw ?? []) as any[]) {
    clientNameMap[c.id as string] = (c.name as string) ?? 'Cliente'
  }
  const clientSpendMap: Record<string, { name: string; total: number; count: number }> = {}
  for (const tx of (txWithClientRaw ?? []) as any[]) {
    const clientId = tx.client_id as string | null
    if (!clientId) continue
    if (!clientSpendMap[clientId]) {
      clientSpendMap[clientId] = { name: clientNameMap[clientId] ?? 'Cliente', total: 0, count: 0 }
    }
    clientSpendMap[clientId].total += Number(tx.amount)
    clientSpendMap[clientId].count++
  }
  const topClients = Object.entries(clientSpendMap)
    .map(([id, v]) => ({ id, name: v.name, totalSpent: v.total, appointmentCount: v.count }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5)

  // 7. Top 5 clientes por recorrência (nº de atendimentos no mês)
  const clientApptCountMap: Record<string, { name: string; count: number }> = {}
  for (const a of apptsCurr) {
    if (!a.client_id) continue
    if (!clientApptCountMap[a.client_id])
      clientApptCountMap[a.client_id] = { name: (a.clients as any)?.name ?? '—', count: 0 }
    clientApptCountMap[a.client_id]!.count++
  }
  const sortedClientsByRec  = Object.values(clientApptCountMap).sort((a, b) => b.count - a.count).slice(0, 5)
  const maxClientCount      = sortedClientsByRec[0]?.count ?? 1
  const topClientsByRecurrence = sortedClientsByRec.map(c => ({ ...c, pct: (c.count / maxClientCount) * 100 }))

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
  const maxAgeCount  = sortedAgeGroups[0]?.[1] ?? 1
  const clientAgeGroups = sortedAgeGroups.map(([label, count]) => ({ label, count, pct: (count / maxAgeCount) * 100 }))

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

  const clientLtvMap: Record<string, number> = {}
  for (const tx of (ltvTxsRaw ?? []) as any[]) {
    const clientId = tx.client_id as string | null
    if (!clientId) continue
    clientLtvMap[clientId] = (clientLtvMap[clientId] ?? 0) + Number(tx.amount)
  }

  const hotmapRawCepLtv: Record<string, number> = {}
  for (const c of clientsDemo) {
    const digits = ((c.zip_code as string | null) ?? '').replace(/\D/g, '')
    if (digits.length !== 8) continue
    const ltv = clientLtvMap[c.id as string] ?? 0
    if (ltv === 0) continue
    hotmapRawCepLtv[digits] = (hotmapRawCepLtv[digits] ?? 0) + ltv
  }

  return (
    <>
      <RealtimeRefresher
        tables={['appointments', 'financial_transactions', 'treatment_plans', 'branch_product_stock']}
      />
      <AdminDashboardView
        monthLabel={periodLabel}
        currentPeriod={period}
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
        avgDurationMinutes={avgDurationMinutes}
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
