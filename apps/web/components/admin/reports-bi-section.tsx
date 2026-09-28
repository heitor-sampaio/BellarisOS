import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getTenantContext } from '@/lib/auth'
import type { ChartPoint } from '@/components/admin/evolution-chart'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ReportsBiDynamic as ReportsBiView } from '@/components/admin/reports-bi-dynamic'
import { addDaysTZ, startOfDayTZ, dayKeyTZ, partsInTZ } from '@/lib/datetime'
import { getRelatorio } from '@/lib/metrics/relatorio'
import {
  resolvePeriod, getRetention, getNewClientsSeries, getLeadFunnel, percent,
  getCore, getSeries,
} from '@/lib/metrics'
import { seedDefaultFunnel } from '@/actions/crm-funnels'
import type { DadosComerciais } from '@/components/admin/reports-bi-view'
import type { LinhaLote, LinhaParcela } from '@/components/admin/reports-linhas'

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

  // -- O que a aba precisa ----------------------------------------------
  // Os NÚMEROS vêm agregados do Postgres (`metrics_relatorio`, só a aba
  // aberta) e do núcleo (`metrics_core`). Antes esta seção trazia as linhas do
  // período — transações, atendimentos, agendamentos, comissões, movimentos,
  // saldos e a base de clientes — e a tela fazia ~40 contas em JS: cortava em
  // 1000 linhas e tinha uma segunda regra de faturamento ao lado do KPI
  // (§13.1). Aqui só sobram LISTAS curtas e com limite: lotes e parcelas.
  const granularity = period === 'today' ? 'hour' : 'day'
  const needBatches = tab === 'estoque'
  const needInstall = tab === 'financeiro'
  const needClientes = tab === 'clientes'

  const [
    relatorio,
    productBatchesRaw,
    installmentsRaw,
    retention,
    newClientsSeries,
    core,
    corePrev,
    seriesData,
  ] = await Promise.all([
    getRelatorio({
      tenantId: ctx.tenantId!, branchIds,
      from: startDate, to: endDate, prevFrom: prevStart, prevTo: prevEnd,
      aba: tab, granularidade: granularity,
    }),

    // Lotes vencendo em ≤ 30 dias.
    // O filtro por tenant vem do produto: sem ele esta consulta rodava com o
    // service role (RLS desligada) e trazia lotes de OUTROS tenants.
    needBatches
      ? ler(admin.from('product_batches')
          .select('id, product_id, batch_number, expires_at, quantity, products!inner(name, tenant_id)')
          .eq('products.tenant_id', ctx.tenantId!)
          .lte('expires_at', addDaysTZ(now, 30).toISOString())
          .gt('quantity', 0)
          .order('expires_at', { ascending: true })
          .limit(20), 'carregar os lotes vencendo')
      : Promise.resolve([] as unknown[]),

    // Parcelas pendentes (aba financeiro).
    // Sem o vínculo com as filiais do tenant, as 50 vagas do limite podiam ser
    // ocupadas por parcelas de outros clientes da plataforma.
    needInstall
      ? ler(admin.from('installments')
          .select('id, amount, due_date, financial_transactions!inner(branch_id, clients(name))')
          .in('financial_transactions.branch_id', branchIds)
          .eq('is_paid', false)
          .order('due_date', { ascending: true })
          .limit(50), 'carregar as parcelas pendentes')
      : Promise.resolve([] as unknown[]),

    // Retenção real (quem já era cliente antes do período e voltou)
    needClientes
      ? getRetention({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate })
      : Promise.resolve({ clientsServed: 0, returningClients: 0, firstTimeClients: 0 }),

    // Novos clientes por dia, dentro da janela e no fuso do negócio
    needClientes
      ? getNewClientsSeries({
          tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
          granularity: period === 'all' ? 'month' : 'day',
        })
      : Promise.resolve([]),

    // O dinheiro e as contagens do período, agregados no Postgres — a mesma
    // conta do dashboard. Atendimentos, novos clientes, ticket, agenda e
    // comissões também saem daqui: recontar na tela era a segunda cópia.
    getCore({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate }),
    getCore({ tenantId: ctx.tenantId!, branchIds, from: prevStart, to: prevEnd }),
    getSeries({
      tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
      granularity,
    }),
  ])

  const productBatches = (productBatchesRaw ?? []) as unknown as LinhaLote[]
  const installments   = ((installmentsRaw  ?? []) as unknown as LinhaParcela[])
    .filter(i => branchIds.includes(i.financial_transactions?.branch_id ?? ''))

  // -- Aba Comercial -------------------------------------------------
  // Vive aqui desde que deixou de ser tela própria (/admin/comercial): o funil
  // e a conversão são relatório, e estavam numa entrada de menu só deles.
  const comercial = tab === 'comercial'
    ? await painelComercial({ tenantId, branchIds, from: startDate, to: periodInfo.fullTo, rawFunil })
    : undefined

  // -- Gráfico de evolução (mesmo padrão do dashboard) ---------------

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

  // O consumo de cada fatia vem somado do banco, com a chave da fatia
  // ('0'…'23' por hora, 'YYYY-MM-DD' por dia, no fuso da clínica).
  function pontoDoGrafico(chave: string, idx: number): ChartPoint {
    const ponto   = seriesPorBucket.get(chave)
    const revenue = ponto?.revenue ?? 0
    const cost    = (ponto?.expenses ?? 0) + (relatorio.consumoPorFatia.get(chave) ?? 0)
    return { day: idx, revenue, cost, profit: revenue - cost }
  }

  const evolutionData: ChartPoint[] =
    granularity === 'hour'
      ? Array.from({ length: 24 }, (_, i) => pontoDoGrafico(String(i), i))
      : (() => {
          const MS_DAY = 86_400_000
          const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / MS_DAY) + 1)
          return Array.from({ length: days }, (_, i) => {
            const base = startOfDayTZ(addDaysTZ(startDate, i))
            return pontoDoGrafico(dayKeyTZ(base), i + 1)
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
        relatorio={relatorio}
        installments={installments}
        productBatches={productBatches}
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

  const [etapasRaw, leadsRaw, apptsRaw, usersRaw] = await Promise.all([
    getLeadFunnel({
      tenantId, branchIds: null, from, to, funnelId: funilAtivo?.id ?? null,
    }),

    ler(admin.from('leads')
      .select('id, client_id, owner_id')
      .eq('tenant_id', tenantId)
      .gte('created_at', fromISO).lte('created_at', toISO), 'carregar os leads do período'),

    ler(admin.from('appointments')
      .select('id, status, source, created_by_id')
      .in('branch_id', branchIds)
      .gte('scheduled_at', fromISO).lte('scheduled_at', toISO), 'carregar os agendamentos do funil'),

    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId), 'carregar a equipe'),
  ])

  const leads = (leadsRaw ?? []) as { client_id: string | null; owner_id: string | null }[]
  const appts = (apptsRaw ?? []) as { status: string; source: string; created_by_id: string | null }[]
  const nomeDe = new Map((usersRaw ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))

  const totalLeads  = leads.length
  const convertidos = leads.filter(l => l.client_id).length

  const comerciais = appts.filter(a => a.source === 'COMMERCIAL')

  // Comparecimento exclui as canceladas do denominador: com elas dentro a
  // métrica misturava "não cancelou" com "compareceu" e ficava sempre baixa.
  //
  // A base eram as AVALIAÇÕES (`is_evaluation`), que deixaram de existir em
  // 2026-09-25 — a avaliação virou um procedimento como outro qualquer e não
  // há mais o que a distinga na tabela. O que a métrica sempre quis saber é do
  // funil do time comercial: quantos primeiros atendimentos foram marcados e
  // quantos aconteceram. Isso o `source` responde, e o rótulo mudou junto.
  const comerciaisConsiderados = comerciais.filter(a => a.status !== 'CANCELLED').length
  const comerciaisRealizados   = comerciais.filter(a => a.status === 'COMPLETED').length

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
    comerciaisAgendados: comerciais.length,
    comerciaisConsiderados,
    comerciaisRealizados,
    comparecimento: percent(comerciaisRealizados, comerciaisConsiderados) ?? 0,
    ranking: [...vendedores.values()]
      .sort((a, b) => (b.leads + b.agendamentos) - (a.leads + a.agendamentos)),
  }
}
