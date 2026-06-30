import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantContext, assertRole } from '@/lib/auth'
import { ReportsBiView, type ReportsBiProps } from '@/components/admin/reports-bi-view'
import type { ChartPoint } from '@/components/admin/evolution-chart'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

type Tab    = 'overview' | 'financeiro' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque'
type Period = 'today' | '7d' | '15d' | 'month' | 'all' | 'custom'

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>
}) {
  const { tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams

  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'FINANCIAL', 'MARKETING'])

  const admin = createAdminClient()
  const now   = new Date()

  const tab    = (rawTab    ?? 'overview') as Tab
  const period = (rawPeriod ?? 'month')   as Period

  // ── Período ───────────────────────────────────────────────────────
  const msPerDay = 86_400_000
  let startDate: Date, endDate: Date, prevStart: Date, prevEnd: Date

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

  // ── Filiais ───────────────────────────────────────────────────────
  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug')
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

  // ── Flags condicionais ────────────────────────────────────────────
  const needAllAppts    = tab === 'overview' || tab === 'agenda'
  const needCommissions = tab === 'overview' || tab === 'profissionais'
  const needStockMoves  = tab === 'overview' || tab === 'estoque' || tab === 'financeiro'
  const needClientsAll  = tab === 'clientes'
  const needBps         = tab === 'estoque'
  const needBatches     = tab === 'estoque'
  const needInstall     = tab === 'financeiro'
  const needProcCosts   = tab === 'procedimentos'

  // ── Queries paralelas ─────────────────────────────────────────────
  const [
    { data: txsCurrRaw },
    { data: txsPrevRaw },
    { data: apptsCurrRaw },
    { data: clientsCurrRaw },
    { count: apptsPrevCount },
    { count: clientsPrevCount },
    { data: clientsAllRaw },
    { data: allApptsRaw },
    { data: commissionsRaw },
    { data: stockMovesRaw },
    { data: bpsRaw },
    { data: productBatchesRaw },
    { data: installmentsRaw },
    { data: procedureCostsRaw },
  ] = await Promise.all([

    // 0 — Transações do período (ricas: todas as colunas usadas nos tabs)
    admin.from('financial_transactions')
      .select('id, amount, type, is_paid, branch_id, payment_method, category, created_at')
      .in('branch_id', branchIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),

    // 1 — Transações do período anterior (só comparação de delta)
    admin.from('financial_transactions')
      .select('amount, type, is_paid, branch_id')
      .in('branch_id', branchIds)
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', prevEnd.toISOString()),

    // 2 — Atendimentos COMPLETED do período
    admin.from('appointments')
      .select('id, branch_id, procedure_id, professional_id, client_id, price, scheduled_at, source, procedures(name, category), users(name), clients(birth_date)')
      .in('branch_id', branchIds)
      .eq('status', 'COMPLETED')
      .gte('scheduled_at', startDate.toISOString())
      .lte('scheduled_at', endDate.toISOString()),

    // 3 — Novos clientes do período
    admin.from('clients')
      .select('id, branch_id')
      .in('branch_id', branchIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),

    // 4 — Contagem de atendimentos no período anterior (head)
    admin.from('appointments')
      .select('id', { count: 'exact', head: true })
      .in('branch_id', branchIds)
      .eq('status', 'COMPLETED')
      .gte('scheduled_at', prevStart.toISOString())
      .lte('scheduled_at', prevEnd.toISOString()),

    // 5 — Contagem de novos clientes no período anterior (head)
    admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .in('branch_id', branchIds)
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', prevEnd.toISOString()),

    // 6 — Todos os clientes com dados demográficos (clientes tab)
    needClientsAll
      ? admin.from('clients')
          .select('id, name, birth_date, gender, city, state, created_at')
          .eq('tenant_id', ctx.tenantId!)
          .eq('is_active', true)
      : Promise.resolve({ data: [] as any[] }),

    // 7 — Todos os agendamentos (qualquer status) — overview + agenda
    needAllAppts
      ? admin.from('appointments')
          .select('id, branch_id, status, source, scheduled_at')
          .in('branch_id', branchIds)
          .gte('scheduled_at', startDate.toISOString())
          .lte('scheduled_at', endDate.toISOString())
      : Promise.resolve({ data: [] as any[] }),

    // 8 — Comissões — overview + profissionais
    needCommissions
      ? admin.from('commissions')
          .select('amount, professional_id, status, branch_id, users(name)')
          .in('branch_id', branchIds)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
      : Promise.resolve({ data: [] as any[] }),

    // 9 — Movimentações de estoque (PROCEDURE_USAGE) — overview + estoque
    needStockMoves
      ? admin.from('stock_movements')
          .select('quantity, created_at, branch_id, product_id, products(name, cost_price, category)')
          .in('branch_id', branchIds)
          .eq('type', 'PROCEDURE_USAGE')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
      : Promise.resolve({ data: [] as any[] }),

    // 10 — Estoque por filial × produto
    needBps
      ? admin.from('branch_product_stock')
          .select('current_stock, current_rendimento, min_stock, branch_id, product_id, products(name, category, cost_price, is_active), branches(name)')
          .in('branch_id', branchIds)
      : Promise.resolve({ data: [] as any[] }),

    // 11 — Lotes vencendo em ≤ 30 dias
    needBatches
      ? admin.from('product_batches')
          .select('id, product_id, batch_number, expires_at, quantity, products(name)')
          .lte('expires_at', new Date(now.getTime() + 30 * msPerDay).toISOString())
          .gte('expires_at', now.toISOString())
          .gt('quantity', 0)
          .order('expires_at', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),

    // 12 — Parcelas pendentes (financeiro tab)
    needInstall
      ? admin.from('installments')
          .select('id, amount, due_date, financial_transactions(branch_id, clients(name))')
          .eq('is_paid', false)
          .order('due_date', { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),

    // 13 — Custo de insumos por procedimento (aba procedimentos — margem por faixa etária)
    needProcCosts
      ? admin.from('procedure_products')
          .select('procedure_id, quantity, products(cost_price), procedures!inner(tenant_id)')
          .eq('procedures.tenant_id', ctx.tenantId!)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // ── Cast + filter ─────────────────────────────────────────────────
  const txsCurr        = (txsCurrRaw        ?? []) as any[]
  const txsPrev        = (txsPrevRaw        ?? []) as any[]
  const apptsCurr      = (apptsCurrRaw      ?? []) as any[]
  const clientsCurr    = (clientsCurrRaw    ?? []) as any[]
  const clientsAll     = (clientsAllRaw     ?? []) as any[]
  const allAppts       = (allApptsRaw       ?? []) as any[]
  const commissions    = (commissionsRaw    ?? []) as any[]
  const stockMoves     = (stockMovesRaw     ?? []) as any[]
  const bps            = (bpsRaw            ?? []) as any[]
  const productBatches = (productBatchesRaw ?? []) as any[]
  const procedureCosts = (procedureCostsRaw ?? []) as any[]
  const installments   = ((installmentsRaw  ?? []) as any[])
    .filter(i => branchIds.includes(i.financial_transactions?.branch_id))

  // ── Gráfico de evolução (mesmo padrão do dashboard) ───────────────
  const granularity = period === 'today' ? 'hour' : 'day'

  function buildSlice(sliceStart: number, sliceEnd: number, idx: number): ChartPoint {
    const inSlice = (ts: number) => ts >= sliceStart && ts <= sliceEnd
    const dayRevenue = txsCurr
      .filter(t => inSlice(new Date(t.created_at).getTime()) && t.type === 'INCOME' && t.is_paid)
      .reduce((s: number, t: any) => s + Number(t.amount), 0)
    const opEx = txsCurr
      .filter(t => inSlice(new Date(t.created_at).getTime()) && t.type === 'EXPENSE')
      .reduce((s: number, t: any) => s + Number(t.amount), 0)
    const supplyCost = stockMoves
      .filter((m: any) => inSlice(new Date(m.created_at).getTime()))
      .reduce((s: number, m: any) => s + Math.abs(Number(m.quantity)) * Number(m.products?.cost_price ?? 0), 0)
    const dayCost = opEx + supplyCost
    return { day: idx, revenue: dayRevenue, cost: dayCost, profit: dayRevenue - dayCost }
  }

  const evolutionData: ChartPoint[] =
    granularity === 'hour'
      ? Array.from({ length: 24 }, (_, i) => {
          const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), i).getTime()
          return buildSlice(s, s + 3_600_000 - 1, i)
        })
      : (() => {
          const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay) + 1)
          return Array.from({ length: days }, (_, i) => {
            const base = new Date(startDate)
            base.setDate(base.getDate() + i)
            base.setHours(0, 0, 0, 0)
            return buildSlice(base.getTime(), base.getTime() + msPerDay - 1, i + 1)
          })
        })()

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <RealtimeRefresher tables={[
        'appointments',
        'financial_transactions',
        'clients',
        'commissions',
        'stock_movements',
        'branch_product_stock',
        'installments',
        'product_batches',
        'procedure_products',
      ]} />
      <ReportsBiView
        tab={tab}
        period={period}
        periodLabel={periodLabel}
        customFrom={rawFrom}
        customTo={rawTo}
        granularity={granularity}
        branches={branches}
        txsCurr={txsCurr}
        txsPrev={txsPrev}
        installments={installments}
        apptsCurr={apptsCurr}
        apptsPrevCount={apptsPrevCount ?? 0}
        allAppts={allAppts}
        clientsCurr={clientsCurr}
        clientsPrevCount={clientsPrevCount ?? 0}
        clientsAll={clientsAll}
        commissions={commissions}
        stockMoves={stockMoves}
        bps={bps}
        productBatches={productBatches}
        procedureCosts={procedureCosts}
        evolutionData={evolutionData}
      />
    </>
  )
}
