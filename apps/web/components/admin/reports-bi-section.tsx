import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { nomeDaLinhaDoPlano } from '@/lib/financeiro/nome-da-parcela'
import { procedimentosDosPlanos } from '@/lib/financeiro/procedimentos-do-plano'
import { comAsTags, selectComAsTags } from '@/lib/financeiro/filtro-de-tags'
import { getTenantContext, podeVerRelatorio, can, alcancaUnidade } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import type { ChartPoint } from '@/components/admin/evolution-chart'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ReportsBiDynamic as ReportsBiView } from '@/components/admin/reports-bi-dynamic'
import { pontosDaEvolucao } from '@/lib/metrics/evolucao'
import { fusoDoRecorte } from '@/lib/unidades/fuso-da-unidade'
import { lotesVencendoDoRecorte, type LoteVencendo } from '@/lib/estoque/lotes'
import { getRelatorioDosModulos, getCoreDosModulos } from '@/lib/metrics/dos-modulos'
import { getAtendimentosSemReceita } from '@/lib/metrics/fechamento-extra'
import { SEM_ESTOQUE_NO_RESULTADO } from '@/lib/metrics/resultado'
import { getPerdas } from '@/lib/metrics/perdas'
import { getTotalDosAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { getTransferenciasDeEstoque } from '@/lib/metrics/transferencias'
import { getMovimentosDeEstoque, MOVIMENTOS_POR_PAGINA, type MovimentosDoRelatorio } from '@/lib/metrics/movimentos-de-estoque'
import { getEntradasDeEstoque } from '@/lib/metrics/contadora'
import { getQuemAtende } from '@/lib/metrics/relatorio'
import {
  resolvePeriod, getRetention, getNewClientsSeries,
  getSeries, getTicketMedio, getResultadoDoEstoque, getSeriesDoResultado, getTaxasDoPeriodo,
} from '@/lib/metrics'
import { painelComercial } from '@/lib/metrics/painel-comercial'
import { funilLembrado } from '@/lib/crm/funil-lembrado-no-servidor'
import type { LinhaLote, LinhaParcela } from '@/components/admin/reports-linhas'
import {
  getVendas, getResumoDeVendas, ehTipoDeVenda, POR_PAGINA, type Venda, type ResumoDeVendas, type TipoDeVenda,
} from '@/lib/metrics/vendas'
import { tagsAtivasDaRede, comAsArquivadasEmUso } from '@/lib/tags/vocabulario'
import { tagsDaAba, tagsDaUrl } from '@/lib/metrics/tags-do-relatorio'
import { cartoesDaVisaoGeral, veOCaixaNosRelatorios } from '@/lib/metrics/visao-geral'
import { quemCadastraATaxa } from '@/lib/financeiro/quem-cadastra-a-taxa-no-servidor'


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
  tab, period, rawFrom, rawTo, rawFunil, rawTipo, rawPagina, rawTags, scopeLabel, umaUnidade = false,
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
  /** O filtro de Tags (`?tags=a,b`), nas abas de pessoas. */
  rawTags?:   string
  /** Overline do cabeçalho: 'Rede' ou o nome da unidade. */
  scopeLabel: string
  /** A rede tem UMA unidade ativa (D-19): os quadros por unidade somem. */
  umaUnidade?: boolean
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
  // A abrangência vale (SM4): só as unidades ao alcance da pessoa.
  if (branchIds.some(id => !alcancaUnidade(ctxDoCargo, id))) throw semAcesso()
  // Só as abas que VALEM: a Financeiro marcada sem o Financeiro em Ver não abre
  // (o Heitor, 2026-11-23: "financeiro é uma coisa, vendas é outra").
  const abasPermitidas = ctxDoCargo.reportTabs.filter(t => podeVerRelatorio(ctxDoCargo, t))
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

  // -- Sem recorte por dono (SM4, 2026-11-23) ---------------------------------
  // Os Relatórios mostram os números de todos, nas unidades que a página manda
  // (as ao alcance da pessoa); o cargo escolhe só as abas.
  const recorte = { agenda: null, financeiro: null }

  // -- Período -------------------------------------------------------
  // Janela no fuso do RECORTE (F62: a unidade, o dela; a rede, o comum), com
  // período anterior de mesma duração decorrida.
  const fuso = await fusoDoRecorte(ctx.tenantId, branchIds)
  const periodInfo  = resolvePeriod(period, rawFrom, rawTo, now, fuso)
  const startDate   = periodInfo.from
  const endDate     = periodInfo.to
  const prevStart   = periodInfo.prevFrom
  const prevEnd     = periodInfo.prevTo
  const periodLabel = periodInfo.label

  // -- Tags (CLAUDE.md §1: a tag é o filtro personalizado da rede) ----------
  // Nas abas com o filtro (`tagsDaAba`): a linha entra se a cliente dela — na
  // aba Comercial, a pessoa da oportunidade — tem TODAS as marcadas. No Estoque
  // a tag da URL não chega à conta (não há pessoa); a Visão geral e o Financeiro
  // têm o filtro desde a revisão de 24/11 (Q05). As opções são o vocabulário da
  // rede, lido aqui; sem tag nenhuma, a tela nem mostra o filtro.
  const tagsDaRede = await comAsArquivadasEmUso(tenantId, tagsAtivasDaRede(tenantId))
  const tags = tagsDaAba(tab, tagsDaUrl(rawTags))
  // Com tag, o que não é de uma cliente (a compra de estoque, as perdas) sai da
  // conta (TF-02) — na Visão geral e no Financeiro também (Q05, revisão de 24/11).
  const semPessoa = tags.length > 0

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
  const needBatches = tab === 'estoque'
  const needInstall = tab === 'financeiro'
  const needClientes = tab === 'clientes'
  // A entrada, a saída e o lucro são do Financeiro (o Heitor, 2026-11-23): sem
  // ele em Ver, a Visão geral fica sem esses cartões e o valor nem sai daqui
  // (lib/metrics/visao-geral — a lista de cada cartão).
  const veCaixa  = veOCaixaNosRelatorios(ctxDoCargo.permissions)
  const cartoes  = cartoesDaVisaoGeral(ctxDoCargo.permissions)
  const comLucro = (tab === 'overview' && veCaixa) || tab === 'financeiro'

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
    perdas,
    agendaDoPeriodo,
    transferencias,
  ] = await Promise.all([
    getRelatorioDosModulos({
      tenantId: ctx.tenantId!, branchIds,
      from: startDate, to: fimDaJanela, prevFrom: prevStart, prevTo: prevEnd,
      aba: tab, granularidade: granularity, recorte, tags,
    }),

    // Lotes vencendo em ≤ 30 dias: a MESMA conta do cartão "Validade em 30
    // dias" do Estoque e do dashboard (`lotesVencendoDoRecorte`) — nas
    // unidades do RECORTE, pelo dia da unidade, só produto ativo (C19 do
    // levantamento, F66: lia os lotes da rede inteira, também os da outra
    // unidade, com 30 dias contados em UTC).
    needBatches
      ? lotesVencendoDoRecorte(ctx.tenantId!, branchIds, 30, now)
      : Promise.resolve([] as LoteVencendo[]),

    // Parcelas a receber (aba financeiro): cada parcela é um lançamento desde
    // 2026-09-30. Lia `installments`, que não sabia de baixa nem de estorno — a
    // parcela quitada pelo "Pagar" continuava na lista.
    needInstall
      // Com tag, as parcelas das clientes com as tags (a régua da lista do
      // Financeiro, na consulta — Q05 do catálogo, revisão de 24/11).
      ? ler(comAsTags(admin.from('financial_transactions')
          // A18 da 30ª: com o procedimento, para o nome da linha (nomeDaLinhaDoLancamento).
          .select(selectComAsTags('id, amount, due_date, description, branch_id, parcela_numero, parcela_total, clients(name), appointment:appointments!financial_transactions_appointment_id_fkey(procedures(name))', tags))
          .in('branch_id', branchIds), tags)
          .eq('type', 'INCOME')
          .eq('is_paid', false)
          // A25 da 32ª: a régua do cartão "A receber · em aberto" (FN-11,
          // `metrics_a_receber_em_aberto`) — as parcelas E o "A receber", fora o estorno.
          .or('notes.is.null,notes.neq.Estornada')
          .or('category.is.null,category.neq.Estorno')
          .gt('amount', 0)
          .order('due_date', { ascending: true })
          .limit(50), 'carregar as parcelas a receber')
      : Promise.resolve([] as unknown[]),

    // Retenção real (quem já era cliente antes do período e voltou)
    needClientes
      ? getRetention({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, tags })
      : Promise.resolve({ clientsServed: 0, returningClients: 0, firstTimeClients: 0 }),

    // Novos clientes por dia, dentro da janela e no fuso do negócio
    needClientes
      ? getNewClientsSeries({
          tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
          granularity: period === 'all' ? 'month' : 'day', tags,
        })
      : Promise.resolve([]),

    // O dinheiro e as contagens do período, agregados no Postgres — a mesma
    // conta do dashboard. Atendimentos, novos clientes, ticket, agenda e
    // comissões também saem daqui: recontar na tela era a segunda cópia.
    getCoreDosModulos({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: fimDaJanela, recorte, tags }),
    getCoreDosModulos({ tenantId: ctx.tenantId!, branchIds, from: prevStart, to: prevEnd, recorte, tags }),
    veCaixa
      ? getSeries({
          tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate,
          granularity, tags,
        })
      : Promise.resolve([]),

    // Ticket médio = o pago pelas clientes ÷ as que pagaram (2026-10-29): a
    // Visão geral, Clientes e Procedimentos mostram o MESMO número.
    ['overview', 'clientes', 'procedimentos'].includes(tab)
      ? getTicketMedio({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, tags })
      : Promise.resolve(null),

    // O lucro desconta o insumo consumido e deixa a compra de estoque no
    // caixa (2026-10-29): as duas parcelas, no período, no anterior e por fatia.
    // Com tag, das mesmas linhas que os cartões (Q05, revisão de 24/11; TF-02):
    // a compra de estoque, sem cliente, sai; o insumo e a taxa vão pela cliente.
    comLucro ? getResultadoDoEstoque({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, tags }) : Promise.resolve(null),
    comLucro ? getResultadoDoEstoque({ tenantId: ctx.tenantId!, branchIds, from: prevStart, to: prevEnd, tags }) : Promise.resolve(null),
    comLucro ? getSeriesDoResultado({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, granularity, tags }) : Promise.resolve([]),
    // As perdas do período (D-7): do estoque da unidade, como o saldo.
    // A31 da 10ª: a aba Financeiro também (o "fora do resultado" do DRE que a contadora exporta).
    // Com tag, as perdas não são de uma cliente: saem (TF-02), como as compras.
    needBatches || (needInstall && !semPessoa) ? getPerdas({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: periodInfo.fullTo }) : Promise.resolve(undefined),
    // O "Status dos agendamentos" da Visão geral conta o PERÍODO inteiro, com
    // os que ainda vão acontecer (J-57): o núcleo até o fim dele, a janela da
    // aba Agenda. As outras contas da Visão geral seguem o dinheiro (até agora).
    tab === 'overview'
      ? getCoreDosModulos({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: periodInfo.fullTo, recorte, tags })
      : Promise.resolve(null),
    // As transferências entre unidades (A33 da 20ª): o que saiu e o que entrou
    // em cada unidade do recorte, com o custo — como as perdas, do estoque da
    // unidade. A rede de uma unidade só não transfere: nem se consulta.
    needBatches && !umaUnidade
      ? getTransferenciasDeEstoque({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: periodInfo.fullTo })
      : Promise.resolve(undefined),
  ])

  // Quanto cada um ganha é do FINANCEIRO de todos: a aba Profissionais é de
  // relatórios, e mostrava a comissão da equipe inteira a quem não vê o
  // Financeiro. O dado nem sai do servidor.
  const verComissoes = can(ctxDoCargo, 'financial', 'VIEW')
  if (!verComissoes) {
    relatorio.comissoesPorProfissional = []
    for (const nucleo of [core, corePrev]) { nucleo.commissionsOpen = 0; nucleo.commissionsPaid = 0 }
  }

  // Sem o Financeiro, a entrada e a saída não chegam ao navegador: nem os
  // cartões da Visão geral, nem a ponte do caixa na aba Vendas.
  if (!veCaixa) {
    for (const nucleo of [core, corePrev]) { nucleo.revenueCash = 0; nucleo.revenuePending = 0; nucleo.expensesCash = 0 }
    relatorio.receitaPorUnidade = []
    relatorio.receitaPorForma = []
    relatorio.receitaPorCategoria = []
  }

  // Quem atende (D14): o "Profissionais ativos" e as linhas da tabela da aba.
  const quemAtende = tab === 'profissionais'
    ? await getQuemAtende({ tenantId, branchIds })
    : undefined

  const productBatches: LinhaLote[] = (productBatchesRaw as LoteVencendo[]).map(l => ({
    id: l.id, product_id: l.produtoId, batch_number: l.numero, expires_at: l.validade ?? '',
    quantity: l.quantidade, saldo: l.saldo, products: { name: l.produto, tenant_id: ctx.tenantId! },
  }))
  // A12 da 35ª: os concluídos sem pagamento do recorte, a nota do "A receber em
  // aberto" — a mesma conta do Financeiro: a rede inteira de uma vez; a unidade,
  // a dela; as unidades de quem tem mais de uma, uma por unidade.
  const daRedeInteira = !selectedBranchId && ctxDoCargo.unidades == null && branchIds.length !== 1
  const concluidosSemPagamento = !needInstall ? undefined
    : daRedeInteira || branchIds.length === 1
      ? await getTotalDosAtendimentosAReceber({ tenantId: ctx.tenantId!, unidadeId: daRedeInteira ? null : branchIds[0]! })
      : (await Promise.all(branchIds.map(id => getTotalDosAtendimentosAReceber({ tenantId: ctx.tenantId!, unidadeId: id }))))
          .reduce((t, c) => ({ n: t.n + c.n, valor: Math.round((t.valor + c.valor) * 100) / 100 }), { n: 0, valor: 0 })
  const parcelasLidas = ((installmentsRaw  ?? []) as unknown as LinhaParcela[])
    .filter(i => branchIds.includes(i.branch_id))
  // A5 da 31ª (princípio 3): a parcela do plano diz os procedimentos dele, como
  // na ficha e no PDV. O plano de cada linha numa leitura à parte (as linhas
  // são no máximo 50), e a descrição chega à tabela já com o nome.
  const planosDasParcelas = parcelasLidas.length
    ? ((await ler(admin.from('financial_transactions').select('id, treatment_plan_id').in('id', parcelasLidas.map(i => i.id))
        .in('branch_id', branchIds).not('treatment_plan_id', 'is', null), 'ler o plano das parcelas a receber')) ?? []) as { id: string; treatment_plan_id: string }[]
    : []
  const planoDa = new Map(planosDasParcelas.map(p => [p.id, p.treatment_plan_id]))
  const dosPlanos = planoDa.size ? await procedimentosDosPlanos([...planoDa.values()]) : new Map<string, string[]>()
  const installments: LinhaParcela[] = parcelasLidas.map(i => ({
    ...i,
    description: (planoDa.get(i.id) ? nomeDaLinhaDoPlano(dosPlanos.get(planoDa.get(i.id)!) ?? [], i.description) : null) ?? i.description,
  }))

  // -- Aba Comercial -------------------------------------------------
  // Vive aqui desde que deixou de ser tela própria (/admin/comercial): o funil
  // e a conversão são relatório, e estavam numa entrada de menu só deles.
  const comercial = tab === 'comercial'
    ? await painelComercial({ tenantId, branchIds, from: startDate, to: periodInfo.fullTo, rawFunil, funilLembrado: await funilLembrado(), tags })
    : undefined

  // -- Aba Vendas ----------------------------------------------------
  // Uma linha por venda, da mais recente para a mais antiga, paginada no
  // banco; o total vem do resumo (a tela não soma). Lista: fecha no FIM do
  // período (fullTo), e o resumo no mesmo recorte, para os dois baterem.
  const vendas = tab === 'vendas'
    ? await (async (): Promise<DadosDeVendas> => {
        const tipo   = ehTipoDeVenda(rawTipo) ? rawTipo : null
        const doPeriodo = { tenantId, branchIds, from: startDate, to: periodInfo.fullTo, tags }
        const resumo = await getResumoDeVendas(doPeriodo)
        // Sem filtro, a lista tem TODAS as linhas — o crédito também (RL1),
        // que o "Total vendido" não soma.
        const totalDoFiltro = tipo ? resumo.porTipo[tipo].quantidade : resumo.linhas
        const paginas = Math.max(1, Math.ceil(totalDoFiltro / POR_PAGINA))
        const pagina  = Math.min(paginas, Math.max(1, Number.parseInt(rawPagina ?? '1', 10) || 1))
        const linhas  = await getVendas({ ...doPeriodo, tipo, offset: (pagina - 1) * POR_PAGINA })
        return { tipo, pagina, paginas, linhas, resumo }
      })()
    : undefined

  // -- Aba Estoque: as movimentações do período --------------------
  // Item 6 do escopo de 18/11 (o Heitor: "ok"): cada entrada e saída, uma
  // linha, da mais recente para a mais antiga, paginada no banco — como as
  // perdas, do estoque da unidade (o Estoque na aba). Fecha
  // no FIM do período (fullTo), como as perdas e as transferências.
  const movimentos = needBatches
    ? await (async (): Promise<DadosDosMovimentos> => {
        const doPeriodo = { tenantId: ctx.tenantId!, branchIds, from: startDate, to: periodInfo.fullTo }
        const pedida = Math.max(1, Number.parseInt(rawPagina ?? '1', 10) || 1)
        const daPedida = await getMovimentosDeEstoque({ ...doPeriodo, offset: (pedida - 1) * MOVIMENTOS_POR_PAGINA })
        // A página pedida passou do fim (o período mudou): volta à primeira.
        const vazia = daPedida.linhas.length === 0 && pedida > 1
        const lida = vazia ? await getMovimentosDeEstoque(doPeriodo) : daPedida
        const paginas = Math.max(1, Math.ceil(lida.total / MOVIMENTOS_POR_PAGINA))
        return { ...lida, pagina: vazia ? 1 : pedida, paginas }
      })()
    : undefined

  // -- Gráfico de evolução (mesmo padrão do dashboard) ---------------

  // Os pontos vêm prontos de lib/metrics, com a MESMA regra do KPI: só pago,
  // estorno fora dos dois lados, eixo em `paid_at`, fuso do negócio. O custo
  // é o do LUCRO (2026-10-29): a despesa paga sem a compra de estoque, mais o
  // insumo consumido — a linha do lucro soma o cartão de lucro.
  const evolutionData: ChartPoint[] = veCaixa ? pontosDaEvolucao(seriesData, {
    granularidade: granularity, de: startDate, ate: endDate,
  }, seriesDoResultado, fuso) : []

  // -- Render --------------------------------------------------------
  return (
    <>
      <RealtimeRefresher
        tables={['financeiro_sinais', 'comissoes_sinais']}
        topicos={['agenda', 'clientes', 'estoque', 'procedimentos', 'pacotes', 'planos']}
      />
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
        concluidosSemPagamento={concluidosSemPagamento}
        productBatches={productBatches}
        retention={retention}
        newClientsSeries={newClientsSeries}
        evolutionData={evolutionData}
        core={core}
        agendaDoPeriodo={agendaDoPeriodo}
        corePrev={corePrev}
        ticketMedio={ticket?.total.valor ?? null}
        estoqueNoResultado={{ atual: estoque?.total ?? SEM_ESTOQUE_NO_RESULTADO, anterior: estoqueAnterior?.total ?? SEM_ESTOQUE_NO_RESULTADO }}
        verComissoes={verComissoes}
        veCaixa={veCaixa}
        cartoes={cartoes}
        umaUnidade={umaUnidade}
        comercial={comercial}
        vendas={vendas}
        perdas={perdas}
        transferencias={transferencias}
        movimentos={movimentos}
        // A31 da 10ª: a compra (as entradas de estoque, com fornecedor e nota) fica fora do
        // resultado, e a contadora não a via (não abre o Estoque).
        comprasNoEstoque={!needInstall ? undefined : semPessoa ? { linhas: [], total: 0 } : await getEntradasDeEstoque({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: periodInfo.fullTo })}
        // A14 da 29ª (princípio 4): as vendas no cartão sem taxa cadastrada (vale 0%), o aviso do DRE.
        // Com tag, não sai: a conta das formas sem taxa não tem o filtro, e o aviso não bateria com o DRE.
        vendasSemTaxa={needInstall && !semPessoa ? (await getTaxasDoPeriodo({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate })).total.vendasSemTaxa : undefined}
        // D6 da 34ª (MQ-10): a quem não cadastra a taxa, o aviso do DRE diz quem cadastra.
        quemCadastraATaxa={needInstall && !semPessoa ? await quemCadastraATaxa(ctxDoCargo) : null}
        quemAtende={quemAtende}
        tagsDaRede={tagsDaRede}
        tagsEscolhidas={tags}
        semReceita={tab === 'procedimentos' || tab === 'profissionais' || tab === 'overview'
          ? await getAtendimentosSemReceita({ tenantId: ctx.tenantId!, branchIds, from: startDate, to: endDate, tags })
          : null}
      />
    </>
  )
}

/** A aba Estoque: a página das movimentações do período (item 6 do escopo de 18/11). */
export interface DadosDosMovimentos extends MovimentosDoRelatorio {
  pagina:  number
  paginas: number
}

/** A aba Vendas, pronta para desenhar. */
export interface DadosDeVendas {
  tipo:    TipoDeVenda | null
  pagina:  number
  paginas: number
  linhas:  Venda[]
  resumo:  ResumoDeVendas
}
