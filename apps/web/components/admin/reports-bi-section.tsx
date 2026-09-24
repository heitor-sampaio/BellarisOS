import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantContext } from '@/lib/auth'
import type { ChartPoint } from '@/components/admin/evolution-chart'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ReportsBiDynamic as ReportsBiView } from '@/components/admin/reports-bi-dynamic'
import { addDaysTZ, startOfDayTZ, dayKeyTZ, partsInTZ } from '@/lib/datetime'
import {
  resolvePeriod, getRetention, getNewClientsSeries, getLeadFunnel, percent,
  getCore, getSeries,
} from '@/lib/metrics'
import { seedDefaultFunnel } from '@/actions/crm-funnels'
import type { DadosComerciais } from '@/components/admin/reports-bi-view'

export type ReportsTab    = 'overview' | 'financeiro' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque' | 'comercial'
export type ReportsPeriod = 'today' | '7d' | '15d' | 'month' | 'all' | 'custom'

type Tab    = ReportsTab
type Period = ReportsPeriod

/**
 * Corpo dos relatórios, compartilhado pelos dois portais.
 *
 * A tela existia só em /admin/reports, e o portal da rede barra quem tem
 * unidade fixa — uma gerente de unidade com acesso a relatórios não alcançava
 * relatório nenhum. Aqui o conjunto de unidades vem de fora: a rede manda
 * todas, a unidade manda só a dela.
 */
export async function ReportsBiSection({
  tenantId, branches, todasAsUnidades, selectedBranchId, allowNetwork, showBranchFilter,
  tab, period, rawFrom, rawTo, rawFunil, scopeLabel,
}: {
  tenantId:   string
  /** Unidades que entram no cálculo. Uma só quando há recorte. */
  branches:   { id: string; name: string; slug: string }[]
  /** Todas as unidades da rede — alimenta o seletor, não o cálculo. */
  todasAsUnidades?: { id: string; name: string; slug: string }[]
  selectedBranchId?: string | null
  allowNetwork?:     boolean
  showBranchFilter?: boolean
  tab:        Tab
  period:     Period
  rawFrom?:   string
  rawTo?:     string
  /** Funil escolhido na aba Comercial. A rede pode ter mais de um. */
  rawFunil?:  string
  /** Overline do cabeçalho: 'Rede' ou o nome da unidade. */
  scopeLabel: string
}) {
  const admin = createAdminClient()
  const now   = new Date()
  const ctx   = { tenantId }

  const branchIds = branches.map(b => b.id)

  // -- Abas liberadas para o cargo -----------------------------------
  // `reports: VIEW` abre a tela; QUAIS relatórios ela mostra é escolhido aba a
  // aba na tela de Cargos. Resolver aqui — e não em cada página — garante que
  // os dois portais obedecem à mesma regra, e que ninguém carrega dado de uma
  // aba que não pode ver só porque digitou `?tab=` na URL.
  const abasPermitidas = (await getTenantContext()).reportTabs
  if (abasPermitidas.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Nenhum relatório liberado para o seu cargo.
      </div>
    )
  }
  // Aba pedida na URL só vale se o cargo tiver: senão cai na primeira liberada.
  if (!abasPermitidas.includes(tab)) tab = abasPermitidas[0]!

  // -- Período -------------------------------------------------------
  // Janela no fuso do negócio, com período anterior de mesma duração decorrida.
  const periodInfo  = resolvePeriod(period, rawFrom, rawTo, now)
  const startDate   = periodInfo.from
  const endDate     = periodInfo.to
  const prevStart   = periodInfo.prevFrom
  const prevEnd     = periodInfo.prevTo
  const periodLabel = periodInfo.label

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
    retention,
    newClientsSeries,
    core,
    corePrev,
    seriesData,
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
      .select('id, branch_id, procedure_id, professional_id, client_id, price, scheduled_at, source, procedures(name, category), users!appointments_professional_id_fkey(name), clients(birth_date)')
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

    // 13 — Custo por procedimento (aba procedimentos — margem por faixa etária).
    // Traz também mão de obra e outros custos: a margem considerava só os
    // insumos e por isso saía sistematicamente otimista.
    needProcCosts
      ? admin.from('procedure_products')
          .select('procedure_id, quantity, products(cost_price), procedures!inner(tenant_id, labor_cost, other_costs)')
          .eq('procedures.tenant_id', ctx.tenantId!)
      : Promise.resolve({ data: [] as any[] }),

    // 14 — Retenção real (quem já era cliente antes do período e voltou)
    needClientsAll
      ? getRetention({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate })
      : Promise.resolve({ clientsServed: 0, returningClients: 0, firstTimeClients: 0 }),

    // 15 — Novos clientes por dia, dentro da janela e no fuso do negócio
    needClientsAll
      ? getNewClientsSeries({
          tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
          granularity: period === 'all' ? 'month' : 'day',
        })
      : Promise.resolve([]),

    // 16, 17 e 18 — O DINHEIRO, agregado no Postgres.
    //
    // Estes três existem porque a tela tinha DOIS faturamentos: o KPI somava
    // `txsCurr` em JS excluindo o estorno, e o gráfico somava o mesmo array
    // sem excluir — R$ 5.200 no cartão e R$ 5.450 na legenda, na mesma tela.
    // Somar à mão o resultado de um select repete a definição do indicador em
    // cada lugar que precisa dele, e duas cópias de uma definição divergem;
    // é só questão de quando.
    //
    // `metrics_core` e `metrics_series` são a mesma conta, feita uma vez, no
    // banco: só pago, estorno fora dos dois lados, eixo em `paid_at` e fuso do
    // negócio. É o que o dashboard já fazia desde 2026-09-09.
    getCore({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate }),
    getCore({ tenantId: ctx.tenantId!, branchIds, from: prevStart, to: prevEnd }),
    getSeries({
      tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
      granularity: period === 'today' ? 'hour' : 'day',
    }),
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

  // -- Aba Comercial -------------------------------------------------
  // Vive aqui desde que deixou de ser tela própria (/admin/comercial): o funil
  // e a conversão são relatório, e estavam numa entrada de menu só deles.
  const comercial = tab === 'comercial'
    ? await painelComercial({ tenantId, branchIds, from: startDate, to: periodInfo.fullTo, rawFunil })
    : undefined

  // -- Gráfico de evolução (mesmo padrão do dashboard) ---------------
  const granularity = period === 'today' ? 'hour' : 'day'

  // Os buckets vêm prontos do Postgres, com a MESMA regra do KPI: só pago,
  // estorno fora dos dois lados, eixo em `paid_at`, fuso do negócio. Remontar
  // as fatias aqui era o que fazia a legenda do gráfico dizer R$ 5.450 embaixo
  // de um cartão escrito R$ 5.200 — a soma à mão não excluía o estorno.
  //
  // O custo do gráfico soma o consumo de insumos à despesa do período, que é a
  // leitura de "custo" desta tela e não existe no núcleo. O que vinha do banco
  // não se recalcula; só se acrescenta.
  const seriesPorBucket = new Map(
    seriesData.map(ponto => [
      granularity === 'hour'
        ? String(partsInTZ(new Date(ponto.bucket)).hour)
        : dayKeyTZ(ponto.bucket),
      ponto,
    ]),
  )

  const insumosNaFatia = (inicio: number, fim: number) => stockMoves
    .filter((m: any) => {
      const ts = new Date(m.created_at).getTime()
      return ts >= inicio && ts <= fim
    })
    .reduce((s: number, m: any) => s + Math.abs(Number(m.quantity)) * Number(m.products?.cost_price ?? 0), 0)

  function pontoDoGrafico(chave: string, idx: number, inicio: number, fim: number): ChartPoint {
    const ponto   = seriesPorBucket.get(chave)
    const revenue = ponto?.revenue ?? 0
    const cost    = (ponto?.expenses ?? 0) + insumosNaFatia(inicio, fim)
    return { day: idx, revenue, cost, profit: revenue - cost }
  }

  const evolutionData: ChartPoint[] =
    granularity === 'hour'
      ? Array.from({ length: 24 }, (_, i) => {
          const inicio = startDate.getTime() + i * 3_600_000
          return pontoDoGrafico(String(i), i, inicio, inicio + 3_600_000 - 1)
        })
      : (() => {
          const MS_DAY = 86_400_000
          const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / MS_DAY) + 1)
          return Array.from({ length: days }, (_, i) => {
            const base = startOfDayTZ(addDaysTZ(startDate, i))
            return pontoDoGrafico(dayKeyTZ(base), i + 1, base.getTime(), base.getTime() + MS_DAY - 1)
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
        scopeLabel={scopeLabel}
        selectedBranchId={selectedBranchId ?? null}
        allBranches={todasAsUnidades ?? branches}
        allowNetwork={allowNetwork}
        showBranchFilter={showBranchFilter}
        tab={tab}
        abasPermitidas={abasPermitidas}
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
        retention={retention}
        newClientsSeries={newClientsSeries}
        evolutionData={evolutionData}
        core={core}
        corePrev={corePrev}
        comercial={comercial}
      />
    </>
  )
}

/**
 * Funil, conversão e ranking do time comercial.
 *
 * Duas fronteiras diferentes de propósito: os **leads são da rede**
 * (`leads.branch_id` é nulo — é assim que o inbox os cria, e filtrar por filial
 * esvaziava o painel inteiro), enquanto os **atendimentos respeitam o recorte**
 * de unidade escolhido no topo da tela.
 */
async function painelComercial({
  tenantId, branchIds, from, to, rawFunil,
}: {
  tenantId:  string
  branchIds: string[]
  from:      Date
  /** Fim natural do período, não "agora": avaliação marcada para amanhã conta. */
  to:        Date
  rawFunil?: string
}): Promise<DadosComerciais> {
  const admin    = createAdminClient()
  const fromISO  = from.toISOString()
  const toISO    = to.toISOString()

  // A rede pode ter vários funis; o painel mostra um. Empilhar todos somaria
  // etapas que não se sucedem.
  const funis       = await seedDefaultFunnel(tenantId)
  const funisAtivos = funis.filter(f => f.archived_at === null)
  const funilAtivo  = funisAtivos.find(f => f.id === rawFunil)
    ?? funisAtivos.find(f => f.is_default)
    ?? funisAtivos[0]

  const [etapasRaw, { data: leadsRaw }, { data: apptsRaw }, { data: usersRaw }] = await Promise.all([
    getLeadFunnel({
      tenantId, branchIds: null, from, to, funnelId: funilAtivo?.id ?? null,
    }),

    admin.from('leads')
      .select('id, client_id, owner_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', fromISO).lte('created_at', toISO),

    admin.from('appointments')
      .select('id, status, source, is_evaluation, created_by_id')
      .in('branch_id', branchIds)
      .gte('scheduled_at', fromISO).lte('scheduled_at', toISO),

    admin.from('users').select('id, name').eq('tenant_id', tenantId),
  ])

  const leads = (leadsRaw ?? []) as { client_id: string | null; owner_id: string | null }[]
  const appts = (apptsRaw ?? []) as { status: string; source: string; is_evaluation: boolean; created_by_id: string | null }[]
  const nomeDe = new Map((usersRaw ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))

  const totalLeads  = leads.length
  const convertidos = leads.filter(l => l.client_id).length

  // Comparecimento exclui as canceladas do denominador: com elas dentro a
  // métrica misturava "não cancelou" com "compareceu" e ficava sempre baixa.
  const evals            = appts.filter(a => a.is_evaluation)
  const evalConsideradas = evals.filter(a => a.status !== 'CANCELLED').length
  const evalRealizadas   = evals.filter(a => a.status === 'COMPLETED').length

  const comerciais = appts.filter(a => a.source === 'COMMERCIAL')

  // Leads sem dono entram numa linha própria em vez de sumirem: antes o
  // ranking somava menos leads que o KPI de leads recebidos, sem explicação.
  type Vendedor = { id: string; name: string; leads: number; convertidos: number; agendamentos: number }
  const vendedores = new Map<string, Vendedor>()
  const SEM_DONO = '__sem_responsavel__'
  const bump = (id: string | null): Vendedor => {
    const chave = id ?? SEM_DONO
    let v = vendedores.get(chave)
    if (!v) {
      v = {
        id: chave,
        name: id ? (nomeDe.get(id) ?? 'Sem nome') : 'Sem responsável',
        leads: 0, convertidos: 0, agendamentos: 0,
      }
      vendedores.set(chave, v)
    }
    return v
  }
  for (const l of leads) {
    const v = bump(l.owner_id)
    v.leads++
    if (l.client_id) v.convertidos++
  }
  for (const a of comerciais) bump(a.created_by_id).agendamentos++

  return {
    funis:      funisAtivos.map(f => ({ id: f.id, name: f.name })),
    funilAtivo: funilAtivo?.id ?? '',
    etapas:     etapasRaw.map(s => ({ name: s.name, count: s.leads })),
    totalLeads,
    convertidos,
    conversao:      percent(convertidos, totalLeads) ?? 0,
    evalAgendadas:  evals.length,
    evalConsideradas,
    evalRealizadas,
    comparecimento: percent(evalRealizadas, evalConsideradas) ?? 0,
    agendamentosComerciais: comerciais.length,
    ranking: [...vendedores.values()]
      .sort((a, b) => (b.leads + b.agendamentos) - (a.leads + a.agendamentos)),
  }
}
