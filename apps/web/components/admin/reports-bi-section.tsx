import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getTenantContext, podeVerRelatorio, can } from '@/lib/auth'
import type { ChartPoint } from '@/components/admin/evolution-chart'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ReportsBiDynamic as ReportsBiView } from '@/components/admin/reports-bi-dynamic'
import { pontosDaEvolucao } from '@/lib/metrics/evolucao'
import { addDaysTZ } from '@/lib/datetime'
import { getRelatorioDosModulos, getCoreDosModulos } from '@/lib/metrics/dos-modulos'
import { recorteDosModulos } from '@/lib/metrics/escopo'
import { SEM_ESTOQUE_NO_RESULTADO } from '@/lib/metrics/resultado'
import {
  resolvePeriod, getRetention, getNewClientsSeries, getLeadFunnel, getMotivosDePerda, getPainelComercial, percent,
  getSeries, getTicketMedio, getResultadoDoEstoque, getSeriesDoResultado,
} from '@/lib/metrics'
import { seedDefaultFunnel } from '@/lib/crm/funis'
import type { DadosComerciais } from '@/components/admin/reports-bi-view'
import type { LinhaLote, LinhaParcela } from '@/components/admin/reports-linhas'
import {
  getVendas, getResumoDeVendas, ehTipoDeVenda, POR_PAGINA, type Venda, type ResumoDeVendas, type TipoDeVenda,
} from '@/lib/metrics/vendas'


export type ReportsTab    = 'overview' | 'financeiro' | 'vendas' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque' | 'comercial'
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
  tab, period, rawFrom, rawTo, rawFunil, rawTipo, rawPagina, scopeLabel,
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
  /** Aba Vendas: o tipo escolhido e a página da lista. */
  rawTipo?:   string
  rawPagina?: string
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
  const ctxDoCargo     = await getTenantContext()
  const abasPermitidas = ctxDoCargo.reportTabs
  if (abasPermitidas.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Nenhum relatório liberado para o seu cargo.
      </div>
    )
  }
  // Aba pedida na URL só vale se o cargo tiver: senão cai na primeira liberada.
  // A regra é a de `podeVerRelatorio` (módulo E aba), a mesma testada em tests/auth.
  if (!podeVerRelatorio(ctxDoCargo, tab)) tab = abasPermitidas[0]!

  // -- "Só os meus": cada número no escopo do SEU módulo (decisão do Heitor,
  // 2026-10-29; lib/metrics/escopo) ------------------------------------------
  // A agenda e as clientes (atendimentos, agendamentos, retenção, novos
  // clientes, a base) seguem o escopo da agenda; o dinheiro (faturamento,
  // ticket, evolução, vendas, comissões, o consumo de insumo) segue o do
  // financeiro; o comercial, o do CRM (os leads dela e os sem dono). O que não
  // se atribui a ela quando o FINANCEIRO é "só os meus" (a despesa, o lucro, a
  // margem, o saldo do estoque, as parcelas a receber) nem é consultado: a tela
  // o esconde (`soOsMeus`). Até aqui qualquer "só os meus" recortava tudo.
  const recorte = recorteDosModulos(ctxDoCargo)
  const soOsMeus = recorte.financeiro !== null
  const profAgenda = recorte.agenda
  const profDinheiro = recorte.financeiro
  const donoNoCrm = recorte.crm

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
  // A aba Agenda é uma LISTA do período: fecha no FIM dele (fullTo), com os
  // agendamentos futuros e o cancelamento de amanhã. Fechar em "agora" deixava
  // metade do mês de fora, sem aviso (A38). As outras abas seguem o dinheiro,
  // que só existe até agora.
  const fimDaJanela = tab === 'agenda' ? periodInfo.fullTo : endDate
  const needBatches = tab === 'estoque' && !soOsMeus
  const needInstall = tab === 'financeiro' && !soOsMeus
  const needClientes = tab === 'clientes'
  const comLucro = tab === 'overview' || tab === 'financeiro'

  const [
    relatorio,
    productBatchesRaw,
    installmentsRaw,
    retention,
    newClientsSeries,
    core,
    corePrev,
    seriesData,
    ticket,
    estoque,
    estoqueAnterior,
    seriesDoResultado,
  ] = await Promise.all([
    getRelatorioDosModulos({
      tenantId: ctx.tenantId!, branchIds,
      from: startDate, to: fimDaJanela, prevFrom: prevStart, prevTo: prevEnd,
      aba: tab, granularidade: granularity, recorte,
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

    // Parcelas a receber (aba financeiro): cada parcela é um lançamento desde
    // 2026-09-30. Lia `installments`, que não sabia de baixa nem de estorno — a
    // parcela quitada pelo "Pagar" continuava na lista.
    needInstall
      ? ler(admin.from('financial_transactions')
          .select('id, amount, due_date, description, branch_id, parcela_numero, parcela_total, clients(name)')
          .in('branch_id', branchIds)
          .eq('type', 'INCOME')
          .eq('is_paid', false)
          .not('parcela_total', 'is', null)
          .or('notes.is.null,notes.neq.Estornada')
          .gt('amount', 0)
          .order('due_date', { ascending: true })
          .limit(50), 'carregar as parcelas a receber')
      : Promise.resolve([] as unknown[]),

    // Retenção real (quem já era cliente antes do período e voltou)
    needClientes
      ? getRetention({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, professionalId: profAgenda })
      : Promise.resolve({ clientsServed: 0, returningClients: 0, firstTimeClients: 0 }),

    // Novos clientes por dia, dentro da janela e no fuso do negócio
    needClientes
      ? getNewClientsSeries({
          tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
          granularity: period === 'all' ? 'month' : 'day', professionalId: profAgenda,
        })
      : Promise.resolve([]),

    // O dinheiro e as contagens do período, agregados no Postgres — a mesma
    // conta do dashboard. Atendimentos, novos clientes, ticket, agenda e
    // comissões também saem daqui: recontar na tela era a segunda cópia.
    getCoreDosModulos({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: fimDaJanela, recorte }),
    getCoreDosModulos({ tenantId: ctx.tenantId!, branchIds, from: prevStart, to: prevEnd, recorte }),
    getSeries({
      tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
      granularity, professionalId: profDinheiro,
    }),

    // Ticket médio = o pago pelas clientes ÷ as que pagaram (2026-10-29): a
    // Visão geral, Clientes e Procedimentos mostram o MESMO número.
    ['overview', 'clientes', 'procedimentos'].includes(tab)
      ? getTicketMedio({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, professionalId: profDinheiro })
      : Promise.resolve(null),

    // O lucro desconta o insumo consumido e deixa a compra de estoque no
    // caixa (2026-10-29): as duas parcelas, no período, no anterior e por fatia.
    comLucro ? getResultadoDoEstoque({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, professionalId: profDinheiro }) : Promise.resolve(null),
    comLucro ? getResultadoDoEstoque({ tenantId: ctx.tenantId!, branchIds, from: prevStart, to: prevEnd, professionalId: profDinheiro }) : Promise.resolve(null),
    comLucro ? getSeriesDoResultado({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, granularity, professionalId: profDinheiro }) : Promise.resolve([]),
  ])

  // Quanto cada um ganha é do FINANCEIRO de todos: a aba Profissionais é de
  // relatórios, e mostrava a comissão da equipe inteira a quem não vê o
  // financeiro (ou só vê as próprias). O dado nem sai do servidor.
  // Com o financeiro "só os meus", a comissão que chega já é a DELA (o recorte
  // do dinheiro, no banco).
  const verComissoes = can(ctxDoCargo, 'financial', 'VIEW')
  if (!verComissoes) {
    relatorio.comissoesPorProfissional = []
    for (const nucleo of [core, corePrev]) { nucleo.commissionsOpen = 0; nucleo.commissionsPaid = 0 }
  }

  const productBatches = (productBatchesRaw ?? []) as unknown as LinhaLote[]
  const installments   = ((installmentsRaw  ?? []) as unknown as LinhaParcela[])
    .filter(i => branchIds.includes(i.branch_id))

  // -- Aba Comercial -------------------------------------------------
  // Vive aqui desde que deixou de ser tela própria (/admin/comercial): o funil
  // e a conversão são relatório, e estavam numa entrada de menu só deles.
  const comercial = tab === 'comercial'
    ? await painelComercial({ tenantId, branchIds, from: startDate, to: periodInfo.fullTo, rawFunil, ownerId: donoNoCrm })
    : undefined

  // -- Aba Vendas ----------------------------------------------------
  // Uma linha por venda, da mais recente para a mais antiga, paginada no
  // banco; o total vem do resumo (a tela não soma). Lista: fecha no FIM do
  // período (fullTo), e o resumo no mesmo recorte, para os dois baterem.
  const vendas = tab === 'vendas'
    ? await (async (): Promise<DadosDeVendas> => {
        const tipo   = ehTipoDeVenda(rawTipo) ? rawTipo : null
        // A venda é dinheiro: segue o financeiro (com ele "só os meus", as dela).
        const doPeriodo = { tenantId, branchIds, from: startDate, to: periodInfo.fullTo, professionalId: profDinheiro }
        const resumo = await getResumoDeVendas(doPeriodo)
        const totalDoFiltro = tipo ? resumo.porTipo[tipo].quantidade : resumo.geral.quantidade
        const paginas = Math.max(1, Math.ceil(totalDoFiltro / POR_PAGINA))
        const pagina  = Math.min(paginas, Math.max(1, Number.parseInt(rawPagina ?? '1', 10) || 1))
        const linhas  = await getVendas({ ...doPeriodo, tipo, offset: (pagina - 1) * POR_PAGINA })
        return { tipo, pagina, paginas, linhas, resumo }
      })()
    : undefined

  // -- Gráfico de evolução (mesmo padrão do dashboard) ---------------

  // Os pontos vêm prontos de lib/metrics, com a MESMA regra do KPI: só pago,
  // estorno fora dos dois lados, eixo em `paid_at`, fuso do negócio. O custo
  // é o do LUCRO (2026-10-29): a despesa paga sem a compra de estoque, mais o
  // insumo consumido — a linha do lucro soma o cartão de lucro.
  const evolutionData: ChartPoint[] = pontosDaEvolucao(seriesData, {
    granularidade: granularity, de: startDate, ate: endDate,
  }, seriesDoResultado)

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
        'client_packages',
        'procedure_sales',
        'treatment_plans',
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
        ticketMedio={ticket?.total.valor ?? null}
        estoqueNoResultado={{ atual: estoque?.total ?? SEM_ESTOQUE_NO_RESULTADO, anterior: estoqueAnterior?.total ?? SEM_ESTOQUE_NO_RESULTADO }}
        verComissoes={verComissoes}
        soOsMeus={soOsMeus}
        comercial={comercial}
        vendas={vendas}
      />
    </>
  )
}

/** A aba Vendas, pronta para desenhar. */
export interface DadosDeVendas {
  tipo:    TipoDeVenda | null
  pagina:  number
  paginas: number
  linhas:  Venda[]
  resumo:  ResumoDeVendas
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
  tenantId, branchIds, from, to, rawFunil, ownerId,
}: {
  tenantId:  string
  branchIds: string[]
  from:      Date
  /** Fim natural do período, não "agora": avaliação marcada para amanhã conta. */
  to:        Date
  rawFunil?: string
  /** CRM "só os meus": os leads dela e os sem dono (o recorte do quadro). */
  ownerId?:  string | null
}): Promise<DadosComerciais> {
  const admin    = createAdminClient()

  // A rede pode ter vários funis; o painel mostra um. Empilhar todos somaria
  // etapas que não se sucedem.
  const funis       = await seedDefaultFunnel(tenantId)
  const funisAtivos = funis.filter(f => f.archived_at === null)
  const funilAtivo  = funisAtivos.find(f => f.id === rawFunil)
    ?? funisAtivos.find(f => f.is_default)
    ?? funisAtivos[0]

  // Os números vêm agregados do banco (getPainelComercial, 2026-10-22): a tela
  // contava sobre as listas de leads e de atendimentos, e o PostgREST cortava
  // cada uma em 1000.
  const [etapasRaw, painel, usersRaw, motivosDePerda] = await Promise.all([
    getLeadFunnel({
      tenantId, branchIds: null, from, to, funnelId: funilAtivo?.id ?? null, ownerId,
    }),

    getPainelComercial({ tenantId, branchIds, from, to, ownerId }),

    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId), 'carregar a equipe'),

    getMotivosDePerda({ tenantId, from, to, ownerId }),
  ])

  const nomeDe = new Map((usersRaw ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))

  // Comparecimento exclui as canceladas do denominador: com elas dentro a
  // métrica misturava "não cancelou" com "compareceu" e ficava sempre baixa.
  //
  // A base eram as AVALIAÇÕES (`is_evaluation`), que deixaram de existir em
  // 2026-09-25 — a avaliação virou um procedimento como outro qualquer e não
  // há mais o que a distinga na tabela. O que a métrica sempre quis saber é do
  // funil do time comercial: quantos primeiros atendimentos foram marcados e
  // quantos aconteceram. Isso o `source` responde, e o rótulo mudou junto.
  const comerciaisConsiderados = painel.considerados
  const comerciaisRealizados   = painel.realizados

  // Leads sem dono entram numa linha própria em vez de sumirem: antes o
  // ranking somava menos leads que o KPI de leads recebidos, sem explicação.
  // Uma linha por dono já vem do banco, com a conversão de lib/metrics
  // (ganhas ÷ oportunidades dele); aqui só o nome.
  const ranking = painel.porDono.map(d => ({
    id:   d.dono ?? '__sem_responsavel__',
    name: d.dono ? (nomeDe.get(d.dono) ?? 'Sem nome') : 'Sem responsável',
    leads: d.leads, ganhos: d.ganhos, conversaoPct: d.conversaoPct, agendamentos: d.agendamentos,
  }))

  return {
    funis:      funisAtivos.map(f => ({ id: f.id, name: f.name })),
    funilAtivo: funilAtivo?.id ?? '',
    etapas:     etapasRaw.map(s => ({ name: s.name, count: s.leads })),
    // A conversão é da OPORTUNIDADE, somando os funis (2026-10-29): ganhas ÷ todas.
    totalLeads: painel.totalLeads,
    ganhos:     painel.ganhos,
    temGanho:   painel.temGanho,
    conversao:  painel.conversaoPct,
    comerciaisAgendados: painel.agendados,
    comerciaisConsiderados,
    comerciaisRealizados,
    comparecimento: percent(comerciaisRealizados, comerciaisConsiderados) ?? 0,
    ranking: ranking.sort((a, b) => (b.leads + b.agendamentos) - (a.leads + a.agendamentos)),
    motivosDePerda,
  }
}
