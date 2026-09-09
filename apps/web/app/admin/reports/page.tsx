import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantContext, assertPermission } from '@/lib/auth'
import type { ChartPoint } from '@/components/admin/evolution-chart'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ReportsBiDynamic as ReportsBiView } from '@/components/admin/reports-bi-dynamic'
import { addDaysTZ, startOfDayTZ } from '@/lib/datetime'
import { resolvePeriod } from '@/lib/metrics'

type Tab    = 'overview' | 'financeiro' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque'
type Period = 'today' | '7d' | '15d' | 'month' | 'all' | 'custom'

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>
}) {
  const { tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams

  const ctx   = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')

  const admin = createAdminClient()
  const now   = new Date()

  const tab    = (rawTab    ?? 'overview') as Tab
  const period = (rawPeriod ?? 'month')   as Period

  // -- Período -------------------------------------------------------
  // Janela no fuso do negócio, com período anterior de mesma duração decorrida.
  // Antes o mês parcial era comparado com o mês anterior inteiro (todo delta
  // nascia negativo), "7d" cobria 8 dias e "all" comparava contra 1999.
  const periodInfo  = resolvePeriod(period, rawFrom, rawTo, now)
  const startDate   = periodInfo.from
  const endDate     = periodInfo.to
  const prevStart   = periodInfo.prevFrom
  const prevEnd     = periodInfo.prevTo
  const periodLabel = periodInfo.label

  // -- Filiais -------------------------------------------------------
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

  // -- Flags condicionais --------------------------------------------
  const needAllAppts    = tab === 'overview' || tab === 'agenda'
  const needCommissions = tab === 'overview' || tab === 'profissionais'
  const needStockMoves  = tab === 'overview' || tab === 'estoque' || tab === 'financeiro'
  const needClientsAll  = tab === 'clientes'
  const needBps         = tab === 'estoque'
  const needBatches     = tab === 'estoque'
  const needInstall     = tab === 'financeiro'
  const needProcCosts   = tab === 'procedimentos'

  // -- Queries paralelas ---------------------------------------------
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

    // 0 — Transações do período (ricas: todas as colunas usadas nos tabs).
    // `client_id` é lido pela view para "Gasto médio" e "Top 10 clientes" mas
    // não vinha no select: os dois indicadores ficavam zerados/vazios.
    admin.from('financial_transactions')
      .select('id, amount, type, is_paid, branch_id, client_id, payment_method, category, notes, created_at, paid_at')
      .in('branch_id', branchIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .limit(5000),

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

    // 8 — Comissões — overview + profissionais.
    // `commissions` não tem created_at: a consulta antiga falhava com 42703,
    // o erro era descartado e "Comissões em aberto/pagas" ficava sempre R$ 0.
    // O período agora é o do atendimento que originou a comissão.
    needCommissions
      ? admin.from('commissions')
          .select('amount, professional_id, status, branch_id, users(name), appointments!inner(scheduled_at)')
          .in('branch_id', branchIds)
          .gte('appointments.scheduled_at', startDate.toISOString())
          .lte('appointments.scheduled_at', endDate.toISOString())
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

    // 11 — Lotes vencendo em ≤ 30 dias.
    // O filtro por tenant vem do produto: sem ele esta consulta rodava com o
    // service role (RLS desligada) e trazia lotes de OUTROS tenants.
    needBatches
      ? admin.from('product_batches')
          .select('id, product_id, batch_number, expires_at, quantity, products!inner(name, tenant_id)')
          .eq('products.tenant_id', ctx.tenantId!)
          .lte('expires_at', addDaysTZ(now, 30).toISOString())
          .gt('quantity', 0)
          .order('expires_at', { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),

    // 12 — Parcelas pendentes (aba financeiro).
    // Mesmo problema: sem o vínculo com as filiais do tenant, as 50 vagas do
    // limite podiam ser ocupadas por parcelas de outros clientes da plataforma
    // — e a tabela aparecia vazia mesmo havendo parcelas desta rede.
    needInstall
      ? admin.from('installments')
          .select('id, amount, due_date, financial_transactions!inner(branch_id, clients(name))')
          .in('financial_transactions.branch_id', branchIds)
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

  // -- Cast + filter -------------------------------------------------
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

  // -- Gráfico de evolução (mesmo padrão do dashboard) ---------------
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
          // Fatias horárias a partir do início do dia no fuso do negócio.
          const s = startDate.getTime() + i * 3_600_000
          return buildSlice(s, s + 3_600_000 - 1, i)
        })
      : (() => {
          const MS_DAY = 86_400_000
          const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / MS_DAY) + 1)
          return Array.from({ length: days }, (_, i) => {
            // addDaysTZ respeita o calendário local; setHours() usava o fuso do
            // processo e deslocava as barras em 3h, fazendo a soma do gráfico
            // divergir do KPI do período.
            const base = startOfDayTZ(addDaysTZ(startDate, i))
            return buildSlice(base.getTime(), base.getTime() + MS_DAY - 1, i + 1)
          })
        })()

  // -- Render --------------------------------------------------------
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
