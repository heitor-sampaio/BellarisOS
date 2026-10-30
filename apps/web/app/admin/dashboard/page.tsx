import { getTenantContext, temRecurso } from '@/lib/auth'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'
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
import { startOfDayTZ, endOfDayTZ } from '@/lib/datetime'
import {
  resolvePeriod, percent, EMPTY_CORE,
  getByBranch, getSeries, getTopProcedures, getTopProfessionals,
  getTopClients, getLeadFunnel, getRankingDeComissao, getMargemPorProcedimento, getTicketMedio, getSeriesDoResultado,
} from '@/lib/metrics'
import { getDemografia, getGiroDeEstoque, type Demografia } from '@/lib/metrics/demografia'
import { seedDefaultFunnel } from '@/lib/crm/funis'
import { ler, contar } from '@/lib/db'
import { resumoDoFunil } from '@/lib/metrics/resultado'
import { pontosDaEvolucao } from '@/lib/metrics/evolucao'
import { recorteDosModulos } from '@/lib/metrics/escopo'
import { getCoreDosModulos } from '@/lib/metrics/dos-modulos'
import { situacaoDoEstoque, estoqueBaixo, saldoParaMostrar, minimoParaMostrar, formatarQuantidadeComUnidade, ROTULO_DA_SITUACAO } from '@/lib/estoque/situacao'




// -- Linhas como os selects as pedem ---------------------------------
type Num = number | string | null
type AgendamentoDeHoje = { id: string; status: string; branch_id: string }
type PlanoPendente = {
  id: string; branch_id: string; created_at: string
  clients: { name: string } | null; branches: { name: string; slug: string } | null
}
type SaldoLido = {
  current_stock: Num; min_stock: Num; current_rendimento: Num | null; branch_id: string
  products: { name: string; is_active: boolean; unit: string; consumption_unit: string | null; units_per_package: Num | null } | null
  branches: { name: string; slug: string } | null
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
  if (ctx.isClient) redirect('/auth/redirect') // a cliente volta à home dela (A43), não ao login
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

  // Cada número segue o escopo do SEU módulo (decisão do Heitor, 2026-10-29;
  // lib/metrics/escopo). Com a agenda "só os meus", a agenda e as clientes
  // são as DELA — atendimentos, novos clientes, hoje, os rankings que contam
  // (procedimentos, recorrência, profissionais, clientes por recorrência), a
  // demografia e os planos aguardando checkout. Com o financeiro "só os meus",
  // o dinheiro é o DELA — a receita, a evolução (só a receita), o ticket, os
  // rankings de valor, o gasto das clientes, o LTV por CEP e o giro (o insumo
  // é custo). O que não se atribui a ela não é consultado nem mostrado: com o
  // financeiro dela, o custo, o lucro, a margem do catálogo e a comissão das
  // outras; com a agenda dela, a ocupação por filial; com qualquer dos dois, o
  // ranking de filiais (que mistura o dinheiro e a agenda de cada unidade).
  // Até aqui qualquer "só os meus" recortava tudo (D7 de 2026-10-28).
  const recorte        = recorteDosModulos(ctx)
  const agendaDela     = recorte.agenda
  const dinheiroDela   = recorte.financeiro
  const recorteProprio = dinheiroDela !== null
  const mesmoRecorte   = agendaDela === dinheiroDela

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
  // D-19: a clínica de uma unidade só não vê ranking nem "por filial".
  const umaUnidade = await redeTemUmaUnidade(ctx.tenantId!)
  const branchIds = branches.map(b => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // -- Queries paralelas ---------------------------------------------
  const janela       = { tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate }
  const daAgenda     = { ...janela, professionalId: agendaDela }
  const doDinheiro   = { ...janela, professionalId: dinheiroDela }
  /** O ranking pedido no recorte do dinheiro — o mesmo da agenda quando os dois são iguais. */
  const noDinheiro = <T,>(daAgendaJa: Promise<T>, pedir: () => Promise<T>) => (mesmoRecorte ? daAgendaJa : pedir())

  const topProceduresDaAgenda     = needsCore ? getTopProcedures({ ...daAgenda, limit: 5 }) : Promise.resolve([])
  const topProfessionalsDaAgenda  = needsCore ? getTopProfessionals({ ...daAgenda, limit: 5 }) : Promise.resolve([])
  const topClientsDaAgenda        = needsCore ? getTopClients({ ...daAgenda, limit: 10 }) : Promise.resolve([])
  // O lucro da evolução desconta o insumo consumido e deixa a compra de
  // estoque no caixa (2026-10-29). Só existe sem o financeiro "só os meus"
  // (com ele, a evolução é só a receita dela).
  const seriesDoResultadoP = needsCore && !recorteProprio
    ? getSeriesDoResultado({ ...janela, granularity: period === 'today' ? 'hour' : 'day' })
    : Promise.resolve([])
  const demografiaDaAgenda        = needsCore ? getDemografia({ tenantId: ctx.tenantId!, branchIds, to: endDate, professionalId: agendaDela }) : Promise.resolve({ total: 0, idades: [], cidades: [], ceps: [] } as Demografia)

  const [
    core,
    prevCore,
    branchMetrics,
    seriesData,
    procedureStats,
    procedureStatsDoDinheiro,
    professionalStats,
    professionalStatsDoDinheiro,
    clientStatsDaAgenda,
    clientStats,
    todayApptsRaw,
    pendingPlansRaw,
    bpsRaw,
    margensDosProcedimentos,
    stockTurnover,
    demografia,
    demografiaDoDinheiro,
    ticket,
  ] = needsCore ? await Promise.all([

    // Núcleo agregado no Postgres: o dinheiro do recorte do financeiro e a
    // agenda (atendimentos, novos clientes, minutos) do recorte da agenda.
    getCoreDosModulos({ ...janela, recorte }),
    getCoreDosModulos({ ...janela, from: prevStart, to: prevEnd, recorte }),
    // Por unidade: o ranking de filiais (dinheiro e agenda de cada unidade, só
    // sem "só os meus") e a ocupação por filial (a agenda: sem a agenda dela).
    agendaDela ? Promise.resolve([]) : getByBranch({ tenantId: ctx.tenantId!, from: startDate, to: endDate }),
    // A série é dinheiro: com o financeiro dela, a receita DELA (só a receita).
    getSeries({ ...doDinheiro, granularity: period === 'today' ? 'hour' : 'day' }),
    // Os rankings que CONTAM seguem a agenda; os de VALOR, o dinheiro.
    topProceduresDaAgenda,
    noDinheiro(topProceduresDaAgenda, () => getTopProcedures({ ...doDinheiro, limit: 5 })),
    topProfessionalsDaAgenda,
    noDinheiro(topProfessionalsDaAgenda, () => getTopProfessionals({ ...doDinheiro, limit: 5 })),
    topClientsDaAgenda,
    noDinheiro(topClientsDaAgenda, () => getTopClients({ ...doDinheiro, limit: 10 })),

    // Agendamentos de hoje (exceto cancelados e no-show) — com a agenda "só
    // os meus", os dela, como o "Meus agendamentos hoje" da unidade.
    (() => {
      let q = admin.from('appointments')
        .select('id, status, branch_id')
        .in('branch_id', branchIds)
        .gte('scheduled_at', startOfToday.toISOString())
        .lte('scheduled_at', endOfToday.toISOString())
        .neq('status', 'CANCELLED')
        .neq('status', 'NO_SHOW')
      if (agendaDela) q = q.eq('professional_id', agendaDela)
      return ler(q, 'carregar os agendamentos de hoje')
    })(),

    // Planos de tratamento aguardando checkout — com a agenda "só os meus", os dela.
    (() => {
      let q = admin.from('treatment_plans')
        .select('id, branch_id, created_at, clients(name), branches(name, slug)')
        .in('branch_id', branchIds)
        .eq('status', 'PROPOSED')
      if (agendaDela) q = q.eq('professional_id', agendaDela)
      return ler(q.order('created_at', { ascending: true }).limit(20), 'carregar os planos aguardando checkout')
    })(),

    // Estoque: produtos com min_stock configurado OU zerados (para indicador de saúde)
    ler(admin.from('branch_product_stock')
      .select('current_stock, min_stock, current_rendimento, branch_id, products(name, is_active, unit, consumption_unit, units_per_package), branches(name, slug)')
      .in('branch_id', branchIds)
      .or('min_stock.gt.0,current_stock.eq.0')
      .order('current_stock', { ascending: true }), 'carregar os saldos de estoque'),

    // Margem por procedimento — contada no banco, com o custo da unidade de
    // consumo do insumo (era o da embalagem, feito aqui na página).
    recorteProprio ? Promise.resolve([]) : getMargemPorProcedimento({ tenantId: ctx.tenantId!, limit: 5 }),

    // Giro do período: consumo em procedimentos, ao custo do MOVIMENTO (não
    // ao custo atual do produto, que mudaria o giro a cada compra). Fim do
    // PERÍODO e não "agora": o consumo que acabou de ser baixado nasce com o
    // relógio do Postgres, que está à frente do relógio do app. Somado no
    // banco: em JS, passando de 1000 movimentos, subcontava.
    // O insumo é CUSTO: segue o financeiro — com ele "só os meus", o gasto
    // nos atendimentos dela.
    getGiroDeEstoque({ branchIds, from: startDate, to: periodInfo.fullTo, professionalId: dinheiroDela }),

    // Demografia — os clientes da rede (com a agenda "só os meus", os que ela
    // atendeu), contada no banco: o total, idade, cidade e CEP. O LTV por CEP é
    // dinheiro: vem do recorte do financeiro. Antes vinha a base inteira e era
    // cortada em 1000.
    demografiaDaAgenda,
    noDinheiro(demografiaDaAgenda, () => getDemografia({ tenantId: ctx.tenantId!, branchIds, to: endDate, professionalId: dinheiroDela })),

    // Ticket médio = o pago pelas clientes ÷ as que pagaram (2026-10-29): o
    // total e o de cada unidade, numa chamada — dinheiro.
    getTicketMedio(doDinheiro),
  ]) : [
    { ...EMPTY_CORE }, { ...EMPTY_CORE }, [], [], [], [], [], [], [], [],
    [], [], [], [], 0, { total: 0, idades: [], cidades: [], ceps: [] } as Demografia,
    { total: 0, idades: [], cidades: [], ceps: [] } as Demografia, null,
  ]

  // Total de clientes (todo o período): o da demografia, a mesma contagem.
  const totalClientsEver = demografia.total

  const todayAppts = (todayApptsRaw ?? []) as AgendamentoDeHoje[]

  // -- KPIs consolidados ---------------------------------------------
  const totalRevenue      = core.revenueCash
  const prevRevenue       = prevCore.revenueCash
  const totalAppointments = core.appointmentsCompleted
  const prevAppointments  = prevCore.appointmentsCompleted
  const newClients        = core.newClients
  const prevClientsCount  = prevCore.newClients

  // Ticket médio = a média de quanto cada CLIENTE gasta (pago ÷ clientes que
  // pagaram; lib/metrics, 2026-10-29). 0 = nenhuma cliente pagou ("—").
  const ticketMedio = ticket?.total.valor ?? 0
  const clientesQuePagaram = ticket?.total.clientesQuePagaram ?? 0

  // -- Por filial ----------------------------------------------------
  // Unidade desativada só entra se teve movimento no período (simulação de 2026-10-20).
  const branchStats: BranchStat[] = branchMetrics.filter(b => b.isActive || b.revenueCash || b.revenuePending || b.expensesCash || b.appointmentsTotal).map(b => ({
    id:           b.branchId,
    name:         b.branchName,
    slug:         b.branchSlug,
    revenue:      b.revenueCash,
    appointments: b.appointmentsCompleted,
    newClients:   b.newClients,
    ticketMedio:  ticket?.porUnidade[b.branchId]?.valor ?? 0,
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
        confirmed:  bToday.filter(a => a.status === 'CONFIRMED' || a.status === 'ARRIVED').length,
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

  // A situação de cada saldo pela regra da tela de estoque (J-43): no
  // rendimento, com "No mínimo" separado de "Abaixo do mínimo".
  const comSituacao = allBps.map(b => {
    const saldo = { embalagens: Number(b.current_stock), rendimento: b.current_rendimento != null ? Number(b.current_rendimento) : null, minimo: Number(b.min_stock) }
    const medidas = { unit: b.products?.unit ?? '', consumption_unit: b.products?.consumption_unit ?? null, units_per_package: b.products?.units_per_package ?? null }
    return { b, saldo, medidas, situacao: situacaoDoEstoque(saldo, medidas) }
  })
  const lowStockItems: AlertLowStock[] = comSituacao
    .filter(s => Number(s.b.min_stock) > 0 && (s.situacao === 'SEM_ESTOQUE' || estoqueBaixo(s.situacao)))
    .slice(0, 20)
    .map(s => ({
      productName:  s.b.products?.name ?? '—',
      branchName:   s.b.branches?.name ?? '—',
      branchSlug:   s.b.branches?.slug ?? '',
      saldo:        formatarQuantidadeComUnidade(saldoParaMostrar(s.saldo, s.medidas)),
      minimo:       formatarQuantidadeComUnidade(minimoParaMostrar(s.saldo, s.medidas)),
      situacao:     ROTULO_DA_SITUACAO[s.situacao],
    }))

  // -- Indicador de saúde do estoque --------------------------------
  const zeroStockCount = allBps.filter(b =>
    Number(b.current_stock) === 0 && b.products?.is_active !== false
  ).length
  const lowStockCount = comSituacao.filter(s => estoqueBaixo(s.situacao)).length
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
  const granularity: 'hour' | 'day' = period === 'today' ? 'hour' : 'day'

  const evolutionData = pontosDaEvolucao(seriesData, { granularidade: granularity, de: startDate, ate: endDate }, await seriesDoResultadoP)

  // -- Aproveitamento da agenda por filial ---------------------------
  // Renomeado de "ocupação": o denominador é o total marcado, não a
  // capacidade instalada. É taxa de comparecimento, e o rótulo agora diz isso.
  const branchOccupancy = branchMetrics.filter(b => b.isActive || b.revenueCash || b.revenuePending || b.expensesCash || b.appointmentsTotal).map(b => ({
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
  const byProcRevenue    = [...procedureStatsDoDinheiro].sort((a, b) => b.revenue - a.revenue)
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

  const byProfRevenue  = [...professionalStatsDoDinheiro].sort((a, b) => b.revenue - a.revenue)
  const maxProfRevenue = byProfRevenue[0]?.revenue ?? 0
  const topProfessionalsByRevenue = byProfRevenue.map(p => ({
    name: p.name, revenue: p.revenue, pct: barPct(p.revenue, maxProfRevenue),
  }))

  // Comissões por profissional. Quanto cada um ganha é do FINANCEIRO, e de
  // todos: o ranking vivia dentro da seção de equipe, e quem só via a equipe
  // (ou só as próprias comissões) via o de todo mundo. E ordena pela comissão
  // de verdade — antes era o top 5 por atendimentos, reordenado.
  // Com qualquer "só os meus", a comissão das outras também não aparece.
  const verComissoesDaEquipe = canFinancial && !recorteProprio
  const rankingDeComissao = verComissoesDaEquipe && needsCore
    ? await getRankingDeComissao({ ...janela, limit: 5 })
    : []
  const maxProfComm = rankingDeComissao[0]?.commission ?? 0
  const topProfessionalsByCommission = rankingDeComissao.map(p => ({
    name: p.name, amount: p.commission, pct: barPct(p.commission, maxProfComm),
  }))

  // 3. Margem por procedimento (lib/metrics: insumos, mão de obra e outros custos).
  const procedureMargins = margensDosProcedimentos ?? []

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

  const byRecurrence   = [...clientStatsDaAgenda].sort((a, b) => b.appointments - a.appointments).slice(0, 5)
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
  // Quantas clientes por CEP: a agenda (as clientes); o LTV: o dinheiro — com o
  // financeiro "só os meus", o que as clientes pagaram pelos atendimentos dela.
  for (const c of demografia.ceps) hotmapRawCepCounts[c.cep] = c.n
  for (const c of demografiaDoDinheiro.ceps) if (c.ltv > 0) hotmapRawCepLtv[c.cep] = c.ltv

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
        // CRM "só os meus": os leads dela e os sem dono, o recorte do quadro.
        ownerId: recorte.crm,
      })
    : []

  const leadFunnel     = funnelStages.map(s => ({ name: s.name, count: s.leads }))
  // A conta da conversão é UMA (lib/metrics), a mesma do quadro de Oportunidades (D10).
  const resumoFunil    = resumoDoFunil(funnelStages)
  const leadsTotal     = resumoFunil.total
  const leadsGanhos    = resumoFunil.ganhos
  const conversionRate = resumoFunil.conversaoPct

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
        leadsGanhos={leadsGanhos}
        conversionRate={conversionRate}
        funilTemGanho={resumoFunil.temGanho}
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
        clientesQuePagaram={clientesQuePagaram}
        totalClientsEver={totalClientsEver ?? 0}
        branchCount={branches.length}
        umaUnidade={umaUnidade}
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
        recorteProprio={recorteProprio}
        agendaPropria={agendaDela !== null}
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
