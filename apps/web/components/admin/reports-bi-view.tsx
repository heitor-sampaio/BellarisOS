'use client'

import { REPORT_TAB_LABELS } from '@/lib/permissions'
import { Dica } from '@/components/shared/dica'
import { DEFINICOES, type DefinicaoDoNumero } from '@/lib/metrics/definicoes'
import { type ReactNode, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { mesclarParams } from '@/lib/query-params'
import { EvolutionChart, type ChartPoint } from './evolution-chart'
import { PeriodSelector, type Period } from './period-selector'
import { SegSelect } from '@/components/shared/seg-select'
import { FiltroDeTags } from '@/components/shared/filtro-de-tags'
import { abaTemFiltroDeTags, tagsNaUrl } from '@/lib/metrics/tags-do-relatorio'
import { FunnelSelect } from '@/components/shared/funnel-select'
import { validadeDoLote, type LinhaLote, type LinhaParcela } from './reports-linhas'
import { nomeDaLinhaDoLancamento, prazoDaParcela } from '@/lib/financeiro/nome-da-parcela'
import type { Relatorio } from '@/lib/metrics/relatorio'
import type { MetricsCore } from '@/lib/metrics'
import type { DadosDeVendas, DadosDosMovimentos } from './reports-bi-section'
import type { RelatorioDePerdas } from '@/lib/metrics/perdas'
import type { RelatorioDeTransferencias } from '@/lib/metrics/transferencias'
import type { EntradaDeEstoqueDoPeriodo } from '@/lib/metrics/contadora'
import { csvDoDre } from '@/lib/financeiro/csv-da-contadora'
import { avisoDoDreSemTaxa, type VendaSemTaxa } from '@/lib/financeiro/vendas-sem-taxa'
import { baixarCsv } from '@/lib/financeiro/csv-dos-lancamentos'
import { rotuloDoMotivo, perdasComOMotivo } from '@/lib/estoque/perda'
import { medidaNoPlural } from '@/lib/estoque/medidas'
import { validadeNaTela } from '@/lib/estoque/validade'
import { textoDasPartes } from '@/lib/estoque/lotes-do-movimento'
import { MOVIMENTOS_POR_PAGINA } from '@/lib/metrics/movimentos-de-estoque-comum'
import type { TipoDoMovimento } from '@/lib/estoque/tipo-do-movimento'
import { DETALHE_DO_GIRO } from '@/lib/estoque/situacao'
import {
  TIPOS_DE_VENDA, ROTULO_DO_TIPO, POR_PAGINA, descricaoDaVenda, comandaDaVenda, marcaDoCancelamento, quemDaVenda,
} from '@/lib/metrics/vendas-comum'
import type { SemReceita } from '@/lib/metrics/fechamento-extra'
import { notasDoTop5 } from '@/lib/relatorios/nota-do-top5'
import { AlertTriangle, Download } from 'lucide-react'
import {
  HBarChart, WeekBarChart, DonutChart, MiniAreaChart,
  DreWaterfall, SimpleTable, Badge,
  CHART_COLORS, fmtBRLShort, fmtBRLFull,
  type TableColumn,
} from './reports-charts'
import {
  resultadoDoPeriodo, variacaoDaMargemPp, variacaoPercentual, mediaPorExecucao, participacaoPct, taxaDeConclusao, taxaDeRetencao, giroDoEstoque, statusDosAgendamentos, maisRealizado, consumoComPerdas,
  type EstoqueNoResultado,
} from '@/lib/metrics/resultado'
import { useFuso } from '@/components/shared/fuso'
import { diasAteOVencimento } from '@/lib/financeiro/vencimentos'

// -- Types ---------------------------------------------------------------------
type Tab = 'overview' | 'financeiro' | 'vendas' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque' | 'comercial'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',       label: 'Visão Geral'    },
  { key: 'financeiro',     label: 'Financeiro'     },
  { key: 'vendas',         label: 'Vendas'         },
  { key: 'agenda',         label: 'Agenda'         },
  { key: 'clientes',       label: 'Clientes'       },
  { key: 'procedimentos',  label: 'Procedimentos'  },
  { key: 'profissionais',  label: 'Profissionais'  },
  { key: 'estoque',        label: 'Estoque'        },
  // Era a tela /admin/comercial, com entrada própria no menu. O assunto é
  // relatório — funil, conversão e ranking — e o módulo que a governa já era
  // `reports`, então virou aba em vez de destino separado.
  { key: 'comercial',      label: REPORT_TAB_LABELS.comercial },
]

/** Painel comercial (lib/metrics/painel-comercial): o tipo mora lá. */
export type { DadosComerciais } from '@/lib/metrics/painel-comercial'
import type { DadosComerciais } from '@/lib/metrics/painel-comercial'
import type { CartaoDaVisaoGeral } from '@/lib/metrics/visao-geral'

export interface ReportsBiProps {
  /** 'Rede' no portal da rede, nome da unidade no portal dela. */
  scopeLabel: string
  /** Unidade escolhida no filtro; `null` = rede inteira. Só no portal da rede. */
  selectedBranchId?: string | null
  /** `false` quando o cargo não pode ver o consolidado — aí escolher é obrigatório. */
  allowNetwork?: boolean
  /** Mostra o filtro de unidade. No portal da unidade não faz sentido. */
  showBranchFilter?: boolean
  /**
   * Opções do seletor. Precisa ser separado de `branches`, que é o conjunto que
   * ENTRA NO CÁLCULO: com uma unidade recortada, `branches` tem um item só e o
   * seletor ficaria sem para onde voltar.
   */
  allBranches?: { id: string; name: string; slug: string }[]
  tab: Tab
  /** Abas que o cargo enxerga — a barra só mostra estas. */
  abasPermitidas: Tab[]
  period: Period
  periodLabel: string
  customFrom?: string
  customTo?: string
  granularity: 'hour' | 'day'
  branches: { id: string; name: string; slug: string }[]
  /**
   * Os agregados da aba, calculados no Postgres (`metrics_relatorio`). A tela
   * NÃO soma nem conta: só ordena, rotula e desenha. Antes ela recebia as
   * linhas do período e fazia ~40 contas — cortando em 1000 linhas e com uma
   * segunda regra de faturamento ao lado do KPI (§13.1).
   */
  relatorio: Relatorio
  /**
   * A47 e A43 da 8ª: por procedimento e por profissional (pelo nome), o que
   * ficou FORA da receita dos atendimentos — o concluído sem pagamento e o
   * pago com crédito na clínica (`getAtendimentosSemReceita`). A regra F18 fica.
   */
  semReceita?: { porProcedimento: Record<string, SemReceita>; porProfissional: Record<string, SemReceita> } | null
  /** Quem ATENDE no recorte (D14, lib/metrics `getQuemAtende`): o "Profissionais ativos" e as linhas da tabela. Só na aba Profissionais. */
  quemAtende?: { total: number; nomes: string[] }
  /** Vê a comissão da equipe (financeiro com escopo de todos). Sem, a aba Profissionais não a mostra. */
  verComissoes: boolean
  /**
   * Vê a entrada, a saída e o lucro: o Financeiro em Ver (o Heitor, 2026-11-23:
   * "financeiro é uma coisa, vendas é outra"). Sem ele, o valor nem chega aqui.
   */
  veCaixa: boolean
  /** Os cartões da Visão geral que a permissão vê (`cartoesDaVisaoGeral`, lib/metrics/visao-geral). */
  cartoes: CartaoDaVisaoGeral[]
  /** A rede tem UMA unidade ativa (D-19): "Faturamento por Unidade" e "Saúde do Estoque por Unidade" somem. */
  umaUnidade?: boolean
  installments: LinhaParcela[]
  productBatches: LinhaLote[]
  retention: { clientsServed: number; returningClients: number; firstTimeClients: number }
  newClientsSeries: { bucket: string; count: number }[]
  evolutionData: ChartPoint[]
  /**
   * O dinheiro do período, agregado no Postgres — a mesma conta que alimenta
   * o gráfico. Some daqui e a tela volta a ter duas definições de faturamento:
   * era isso que punha R$ 5.200 no cartão e R$ 5.450 na legenda logo abaixo.
   */
  core:     MetricsCore
  corePrev: MetricsCore
  /** Visão geral: o núcleo até o FIM do período, para o status dos agendamentos (J-57). */
  agendaDoPeriodo?: MetricsCore | null
  /** Ticket médio do período: o pago pelas clientes ÷ as que pagaram (lib/metrics, 2026-10-29). Nulo = "—". */
  ticketMedio: number | null
  /** A compra de estoque paga e o insumo consumido, no período e no anterior: o lucro desconta o insumo, não a compra (2026-10-29). */
  estoqueNoResultado: { atual: EstoqueNoResultado; anterior: EstoqueNoResultado }
  /** Só vem preenchido quando a aba Comercial está aberta. */
  comercial?: DadosComerciais
  /** Só vem preenchido quando a aba Vendas está aberta. */
  vendas?: DadosDeVendas
  /** As perdas do período (D-7) — nas abas Estoque e Financeiro. */
  perdas?: RelatorioDePerdas
  /** As transferências entre unidades no período (A33 da 20ª) — na aba Estoque, com mais de uma unidade. */
  transferencias?: RelatorioDeTransferencias
  /** As movimentações do período, a página aberta (item 6 do escopo de 18/11) — na aba Estoque. */
  movimentos?: DadosDosMovimentos
  /** A31 da 10ª: as entradas de estoque do período (ao custo, com fornecedor e nota) — aba Financeiro. */
  comprasNoEstoque?: { linhas: EntradaDeEstoqueDoPeriodo[]; total: number }
  /** A14 da 29ª: as vendas no cartão sem taxa cadastrada no período (lib/metrics) — o aviso do DRE. */
  vendasSemTaxa?: VendaSemTaxa[]
  /** D6 da 34ª (MQ-10): quem cadastra a taxa, a quem não cadastra (nulo: a pessoa cadastra). */
  quemCadastraATaxa?: string[] | null
  /** O vocabulário de tags da rede (as opções do filtro). Vazio: o filtro não aparece. */
  tagsDaRede?: string[]
  /** As tags que valem na aba aberta (`?tags=`; nas abas sem o filtro, nenhuma). */
  tagsEscolhidas?: string[]
}

// -- O número ------------------------------------------------------------------
/**
 * O número com o valor da conta, desde o primeiro quadro (D3 da 31ª; princípio
 * 3): contava de 0 até o valor, e quem olhava no meio lia um número que não
 * existe. O design system não tem animação de entrada (lumiere-design).
 */
function AnimatedNum({ value, format = 'brl' }: {
  value: number
  format?: 'brl' | 'brl-short' | 'int' | 'pct'
}) {
  const n = value
  if (format === 'brl')       return <>{n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</>
  if (format === 'brl-short') return <>{fmtBRLShort(n)}</>
  if (format === 'pct')       return <>{n.toFixed(1).replace('.', ',')}%</>
  return <>{Math.round(n).toLocaleString('pt-BR')}</>
}

// -- KPI card ------------------------------------------------------------------
function KpiCard({
  label, value, format = 'brl', delta, accent, showDelta = false, deltaUnit = '%', hero = false, detalhe, dica, sobre, rotuloDoSobre,
}: {
  /** O que o número conta e qual data usa (J-55/J-56). */
  dica?: DefinicaoDoNumero
  /**
   * O "como se lê" do cartão (a base, o que fica fora): mora na dica ao lado do
   * rótulo, junto da definição, nunca embaixo do número (o Heitor, 2026-11-16 —
   * docs/regras/design.md, "A explicação mora na dica").
   */
  sobre?: ReactNode
  /** O nome da dica quando só há o `sobre` (sem a definição). */
  rotuloDoSobre?: string
  label: string
  /** Nulo = não há o número (ticket sem atendimento cobrado, margem sem receita): "—". */
  value: number | null
  format?: 'brl' | 'brl-short' | 'int' | 'pct'
  delta?: number | null
  accent?: string
  showDelta?: boolean
  /** Unidade da variação. Métricas que já são percentuais variam em "p.p.". */
  deltaUnit?: '%' | 'p.p.'
  /**
   * O número que a tela existe para mostrar, preenchido em rosé.
   *
   * É a regra de hierarquia do design system — o mais importante de um grupo é
   * o único preenchido, todo o resto fica branco com borda. O dashboard e o
   * financeiro já faziam isso; aqui os seis cards eram iguais, e seis cards
   * iguais não têm hierarquia nenhuma: o olho não sabe onde pousar.
   */
  hero?: boolean
  /** Um DADO embaixo do número, no lugar da variação ("12 vendas"); a explicação vai em `sobre`. */
  detalhe?: string
}) {
  const hasDelta = delta != null
  const temDica = dica != null || sobre != null
  return (
    <div className="card" style={{
      padding: '16px 20px', flex: '1 1 160px',
      ...(hero && {
        background: 'var(--brand)',
        borderColor: 'transparent',
        boxShadow: 'var(--shadow-brand-card)',
      }),
    }}>
      <p style={{
        fontSize: 'var(--text-overline)', fontWeight: 700,
        color: hero ? 'color-mix(in srgb, var(--on-brand) 78%, transparent)' : 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span>{label}</span>
        {temDica && (
          <Dica rotulo={dica?.rotulo ?? rotuloDoSobre ?? `Sobre: ${label}`}>
            {dica?.texto}
            {dica && sobre != null ? <span style={{ display: 'block', marginTop: 6 }}>{sobre}</span> : sobre}
          </Dica>
        )}
      </p>
      <p style={{
        fontSize: 'var(--text-name)', fontWeight: 800,
        color: hero ? 'var(--on-brand)' : accent ?? 'var(--brand)',
        // A25 da 10ª: o valor numa linha só (o "-" do negativo ficava sozinho em cima).
        margin: 0, letterSpacing: '-0.02em', whiteSpace: 'nowrap',
      }}>
        {value == null ? '—' : <AnimatedNum value={value} format={format} />}
      </p>
      {hasDelta ? (
        <p style={{
          fontSize: 'var(--text-2xs)', margin: '4px 0 0',
          color: hero
            ? 'color-mix(in srgb, var(--on-brand) 82%, transparent)'
            : delta! >= 0 ? 'var(--success)' : 'var(--danger)',
          fontWeight: 600,
        }}>
          {delta! >= 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1).replace('.', ',')}{deltaUnit} vs anterior
        </p>
      ) : showDelta ? (
        <p style={{
          fontSize: 'var(--text-2xs)', margin: '4px 0 0', fontWeight: 500,
          color: hero ? 'color-mix(in srgb, var(--on-brand) 65%, transparent)' : 'var(--text-faint)',
        }}>
          — sem dados anteriores
        </p>
      ) : detalhe ? (
        <p style={{
          fontSize: 'var(--text-2xs)', margin: '4px 0 0', fontWeight: 600,
          color: hero ? 'color-mix(in srgb, var(--on-brand) 82%, transparent)' : 'var(--text-muted)',
        }}>
          {detalhe}
        </p>
      ) : null}
    </div>
  )
}

// -- Section card --------------------------------------------------------------
/** A30 da 24ª: a base do valor da aba, curta, com a explicação na dica. */
function BaseDaAba({ texto, dica }: { texto: string; dica: DefinicaoDoNumero }) {
  return (
    <p data-base-da-aba style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
      {texto}
      <Dica rotulo={dica.rotulo}>{dica.texto}</Dica>
    </p>
  )
}

function SCard({
  title, children, style, dica, sobre, rotuloDoSobre,
}: {
  title: string
  /** O que o gráfico conta (J-57). */
  dica?: DefinicaoDoNumero
  /** A explicação do quadro (o que fica fora, a legenda): na dica do título (2026-11-16). */
  sobre?: ReactNode
  /** O nome da dica quando só há o `sobre`. */
  rotuloDoSobre?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', ...style }}>
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: 'var(--brand)', fontSize: 'var(--text-2xs)' }}>✦</span>
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {(dica != null || sobre != null) && (
          <Dica rotulo={dica?.rotulo ?? rotuloDoSobre ?? `Sobre: ${title}`}>
            {dica?.texto}
            {dica && sobre != null ? <span style={{ display: 'block', marginTop: 6 }}>{sobre}</span> : sobre}
          </Dica>
        )}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

// -- Delta helper --------------------------------------------------------------
// A variação é a de lib/metrics (`variacaoPercentual`, §13.1): sem base, nula.
function pctDelta(curr: number, prev: number): number | null {
  const v = variacaoPercentual(curr, prev)
  return v === null ? null : (v.up ? v.pct : -v.pct)
}

// -- Formatters ----------------------------------------------------------------
const PAY_LABELS: Record<string, string> = {
  CASH: 'Dinheiro', PIX: 'Pix',
  DEBIT_CARD: 'Débito', CREDIT_CARD: 'Crédito', INTERNAL_CREDIT: 'Crédito Interno',
}

/*
 * `sumRevenue` e `sumExpenses` viviam aqui e foram removidas em 2026-09-24.
 *
 * Elas repetiam, em JavaScript, a definição que `metrics_core` já faz no
 * banco — e uma definição repetida diverge: o gráfico desta mesma tela somava
 * o mesmo array SEM excluir o estorno, e a legenda dizia R$ 5.450 embaixo de
 * um cartão escrito R$ 5.200. Nenhum dos dois números estava errado por
 * descuido de conta; erradas eram as duas cópias da regra.
 *
 * Receita e despesa do período chegam prontas em `core` / `corePrev`. Se
 * precisar de um recorte que o núcleo não tem, o lugar de acrescentá-lo é
 * `lib/metrics/` — nunca uma soma nova aqui.
 */

const SRC_LABELS: Record<string, string> = {
  INTERNAL: 'Interno', ONLINE: 'Online', CLIENT_APP: 'App do Cliente', COMMERCIAL: 'Comercial',
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não Compareceu', ABERTO: 'Em aberto',
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', ARRIVED: 'Chegou', IN_PROGRESS: 'Em Andamento',
}

/** Nome da unidade pelo id — os agregados vêm por `branch_id`. */
function nomesDasUnidades(branches: { id: string; name: string }[]) {
  const m = new Map(branches.map(b => [b.id, b.name]))
  return (id: string) => m.get(id) ?? '—'
}

const porValor = <T extends { value: number }>(a: T, b: T) => b.value - a.value

// -----------------------------------------------------------------------------
// TAB: VISÃO GERAL
// -----------------------------------------------------------------------------
function TabOverview(p: ReportsBiProps) {
  const { relatorio: r, core, corePrev, branches, evolutionData, granularity } = p
  const nomeDaUnidade = nomesDasUnidades(branches)
  // A entrada, a saída e o lucro só com o Financeiro (lib/metrics/visao-geral).
  const ve = (c: CartaoDaVisaoGeral) => p.cartoes.includes(c)

  const revenue      = core.revenueCash
  const prevRevenue  = corePrev.revenueCash
  // Despesa simétrica à receita: só o que foi pago. Antes a receita exigia
  // is_paid e a despesa não, então uma conta com vencimento futuro derrubava
  // o lucro do mês corrente — e esta tela discordava de /admin/financeiro.
  const expenses     = core.expensesCash
  const prevExpenses = corePrev.expensesCash
  // Lucro e ticket vêm de lib/metrics (§13.1) — a tela não faz conta. O
  // ticket é a média por CLIENTE: o pago pelas clientes ÷ as que pagaram.
  const profit       = resultadoDoPeriodo({ ...core, ...p.estoqueNoResultado.atual }).lucro
  const prevProfit   = resultadoDoPeriodo({ ...corePrev, ...p.estoqueNoResultado.anterior }).lucro
  const avgTicket    = p.ticketMedio

  const byBranch = r.receitaPorUnidade
    .map(u => ({ name: nomeDaUnidade(u.branchId), value: u.atual }))
    .sort(porValor)
  const byPayment = r.receitaPorForma.map(f => ({ name: PAY_LABELS[f.forma] ?? f.forma, value: f.valor }))
  const topProcs = r.porProcedimento
    .map(x => ({ name: x.nome, value: x.receita })).sort(porValor).slice(0, 5)
  const topProfs = r.porProfissional
    .map(x => ({ name: x.nome, value: x.receita })).sort(porValor).slice(0, 5)
  // O período inteiro, com os ainda em aberto (J-57): era só até agora, e os 2
  // marcados para mais tarde sumiam do gráfico (80% / 20% com 7 no mês).
  const agendaDoPeriodo = p.agendaDoPeriodo ?? core
  const byStatus = statusDosAgendamentos({
    total: agendaDoPeriodo.appointmentsTotal, concluidos: agendaDoPeriodo.appointmentsCompleted,
    cancelados: agendaDoPeriodo.appointmentsCancelled, faltas: agendaDoPeriodo.appointmentsNoShow,
  }).map(x => ({ name: STATUS_LABELS[x.status] ?? x.status, value: x.n }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {ve('faturamento') && <KpiCard label="Faturamento"    value={revenue}           format="brl" delta={pctDelta(revenue, prevRevenue)}           showDelta hero dica={DEFINICOES.receita} />}
        {/* A24 da 10ª: o cartão é o caixa; o gráfico e o lucro usam o "Custo do lucro". */}
        {ve('despesas') && <KpiCard label="Despesas pagas (caixa)" value={expenses} format="brl" accent="var(--danger)" delta={pctDelta(expenses, prevExpenses)}   showDelta dica={DEFINICOES.despesa}
          sobre={<span data-base-das-despesas>Com a compra de estoque e o pagamento das comissões; o lucro e o gráfico usam o Custo do lucro.</span>} />}
        {ve('lucro') && <KpiCard label="Lucro"          value={profit}            format="brl" accent={profit >= 0 ? 'var(--success)' : 'var(--danger)'} delta={pctDelta(profit, prevProfit)}     showDelta />}
        {/* Sem o Financeiro, o primeiro cartão é o destaque (hierarquia por preenchimento). */}
        <KpiCard label="Atendimentos"   value={core.appointmentsCompleted} format="int" delta={pctDelta(core.appointmentsCompleted, corePrev.appointmentsCompleted)} showDelta hero={!ve('faturamento')} dica={DEFINICOES.atendimentos} />
        {/* "Novos clientes" só na rede (o Heitor, 18/11): numa unidade o número não existe (nulo). */}
        {core.newClients !== null && <KpiCard label="Novos Clientes" value={core.newClients} format="int" delta={pctDelta(core.newClients, corePrev.newClients ?? 0)} showDelta />}
        {/* Sem delta: o ticket do período anterior não é carregado. */}
        <KpiCard label="Ticket médio"   value={avgTicket}         format="brl" dica={DEFINICOES.ticket} />
      </div>
      {/* Charts grid */}
      <div className="rg-2" style={{ gap: 16 }}>
        {ve('evolucao') && (
        <SCard title="Evolução do Período" style={{ gridColumn: '1 / -1' }}>
          <EvolutionChart data={evolutionData} monthLabel={p.periodLabel} granularity={granularity} />
        </SCard>
        )}
        {!p.umaUnidade && ve('faturamentoPorUnidade') && (
        <SCard title="Faturamento por Unidade">
          <HBarChart data={byBranch} />
        </SCard>
        )}
        <SCard title="Top 5 Procedimentos por receita dos atendimentos" dica={DEFINICOES.receitaDosAtendimentos}>
          <HBarChart data={topProcs} />
          <NotasDoTop5 notas={notasDoTop5(topProcs.map(x => x.name), p.semReceita?.porProcedimento)} />
        </SCard>
        <SCard title="Top 5 Profissionais por receita dos atendimentos" dica={DEFINICOES.receitaDosAtendimentos}>
          <HBarChart data={topProfs} color={CHART_COLORS[1]} />
          <NotasDoTop5 notas={notasDoTop5(topProfs.map(x => x.name), p.semReceita?.porProfissional)} />
        </SCard>
        {ve('formaDePagamento') && (
        <SCard title="Forma de Pagamento">
          <DonutChart data={byPayment} />
        </SCard>
        )}
        <SCard title="Status dos agendamentos do período" dica={DEFINICOES.statusDoPeriodo}>
          <DonutChart
            data={byStatus}
            colors={[CHART_COLORS[3]!, CHART_COLORS[4]!, 'var(--danger)', CHART_COLORS[5]!]}
            formatLabel={(v, t) => `${v} (${((v / t) * 100).toFixed(0)}%)`}
          />
        </SCard>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: FINANCEIRO
// -----------------------------------------------------------------------------
function TabFinanceiro(p: ReportsBiProps) {
  const { relatorio: r, core, corePrev, branches, installments } = p
  const fuso = useFuso()
  const nomeDaUnidade = nomesDasUnidades(branches)

  const revenue     = core.revenueCash
  const prevRevenue = corePrev.revenueCash
  // O consumo de insumos ENTRA no lucro (decisão do Heitor, 2026-10-29), ao
  // custo do MOVIMENTO — a mesma conta do giro do dashboard. A compra de
  // estoque fica nas despesas (o caixa) e fora do lucro: senão o produto seria
  // descontado duas vezes.
  // "Reforça", item 2: o cartão é o MESMO número do DRE logo abaixo — os
  // insumos consumidos E o custo dos produtos vendidos (metrics_resultado).
  // Era o consumo só dos insumos (R$ 380 ao lado do DRE de R$ 445).
  const stockCOGS   = p.estoqueNoResultado.atual.consumoDeInsumo
  const opEx        = core.expensesCash
  const prevOpEx    = corePrev.expensesCash
  // Lucro, margem e a variação dela (em p.p.) vêm de lib/metrics
  // (resultadoDoPeriodo): a tela fazia a conta. Sem receita, a margem é "—".
  const resultado     = resultadoDoPeriodo({ ...core, ...p.estoqueNoResultado.atual })
  const anterior      = resultadoDoPeriodo({ ...corePrev, ...p.estoqueNoResultado.anterior })
  const profit        = resultado.lucro
  const prevProfit    = anterior.lucro
  const margin        = resultado.margemPct
  const marginDeltaPp = variacaoDaMargemPp(resultado, anterior)

  // Forma, categoria e unidade saem do MESMO conjunto do KPI (pago, sem
  // estorno, eixo em paid_at). Antes somavam por created_at e com estorno —
  // dois faturamentos na mesma tela.
  const byPayment  = r.receitaPorForma.map(f => ({ name: PAY_LABELS[f.forma] ?? f.forma, value: f.valor }))
  const byCategory = r.receitaPorCategoria.map(c => ({ name: c.categoria, value: c.valor }))
  const branchCompareCurr = r.receitaPorUnidade.map(u => ({ name: nomeDaUnidade(u.branchId), value: u.atual }))
  const branchComparePrev = r.receitaPorUnidade.map(u => ({ name: nomeDaUnidade(u.branchId), value: u.anterior }))

  // Pending installments table
  const installCols: TableColumn[] = [
    { key: 'client',    label: 'Cliente'    },
    { key: 'what',      label: 'Descrição'  },
    { key: 'value',     label: 'Valor',      align: 'right',  render: (v) => fmtBRLFull(Number(v)) },
    { key: 'due',       label: 'Vencimento', align: 'center' },
    { key: 'branch',    label: 'Unidade'     },
    {
      key: 'daysLeft', label: 'Prazo', align: 'center',
      // IND-08: a vencida diz há quantos dias (era "0d" para sempre). A18 da
      // 30ª: em palavras, atraso ou prazo ("vence em 61 dias", "3 dias de atraso").
      render: (v) => v === '' ? '—' : (
        <Badge label={prazoDaParcela(Number(v))}
          color={Number(v) <= 3 ? 'red' : Number(v) <= 7 ? 'amber' : 'gray'} />
      ),
    },
  ]
  const today = new Date()
  const installRows = installments.map(i => ({
    client:   i.clients?.name ?? '—',
    // A18 da 30ª: o procedimento e a parcela ("Microagulhamento — parcela 2/3"), não "Atendimento concluído — …".
    what:     nomeDaLinhaDoLancamento(i.appointment?.procedures?.name, { numero: i.parcela_numero, total: i.parcela_total, descricao: i.description }) ?? i.description,
    value:    Number(i.amount),
    due:      i.due_date ? new Date(i.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—',
    branch:   branches.find(b => b.id === i.branch_id)?.name ?? '—',
    // Dia a dia, no dia da unidade (lib/financeiro/vencimentos; IND-08 da varredura de 18/11).
    daysLeft: i.due_date ? diasAteOVencimento(i.due_date, today, fuso) : '',
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Receita Bruta"   value={revenue}   format="brl" delta={pctDelta(revenue, prevRevenue)}   showDelta hero />
        {/* O consumo entra no lucro (2026-10-29). Movimentação de estoque
            nunca gera despesa (D13 revisto, 2026-10-28): a compra paga entra no
            financeiro por um lançamento ("Compra de estoque"), que fica no caixa. */}
        {/* O "Desconta do lucro" que vinha embaixo do número já é a definição da dica (2026-11-16). */}
        <KpiCard label="Insumos e produtos vendidos" value={stockCOGS} format="brl" accent="var(--danger)"
          dica={DEFINICOES.insumosEProdutos} />
        {<>
          {/* A31 da 9ª: a base é o caixa (o que se pagou), outra conta que a despesa operacional do DRE. */}
          <KpiCard label="Despesas pagas (caixa)"  value={opEx}      format="brl" accent="var(--warning)"  delta={pctDelta(opEx, prevOpEx)}     showDelta
            dica={DEFINICOES.despesa}
            sobre={<span data-base-das-despesas>Com a compra de estoque e o pagamento das comissões — o DRE abaixo usa só a despesa operacional.</span>} />
          <KpiCard label="Lucro"           value={profit}    format="brl" accent={profit >= 0 ? 'var(--success)' : 'var(--danger)'} delta={pctDelta(profit, prevProfit)}   showDelta />
          <KpiCard label="Margem"          value={margin}    format="pct" accent={margin == null ? undefined : margin >= 20 ? 'var(--success)' : margin >= 0 ? 'var(--warning)' : 'var(--danger)'} delta={marginDeltaPp} showDelta deltaUnit="p.p." />
        </>}
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        {(
          // A50 da 7ª simulação: a perda de R$ 380 fora do lucro parecia erro (é a regra F7) — a
          // tela diz, na dica do título (2026-11-16: a explicação mora na dica).
          <SCard title="DRE Simplificado" style={{ gridColumn: '1 / -1' }} rotuloDoSobre="O que fica fora do lucro" sobre={
            <span data-fora-do-lucro>
              {/* D8 da 10ª: "já foi pago na compra" era falso — a compra também fica fora do lucro. */}
              A perda e o ajuste de estoque ficam fora do lucro: são métrica e não entram no resultado, nem quando a
              compra é paga (a compra de estoque fica no caixa). Estão em Relatórios → Estoque (“Perdas no período”).
            </span>
          }>
            {/* As despesas operacionais (sem a compra de estoque e sem o fechamento das comissões, que ficam no
                caixa), os insumos, as taxas da maquininha e as comissões lançadas: todos descontam do lucro. */}
            <DreWaterfall receita={revenue} despesas={resultado.despesaOperacional} insumos={resultado.insumoConsumido}
              taxas={resultado.taxasDaMaquininha} comissoes={resultado.comissoes} lucro={profit} />
            {/* A14 da 29ª (princípio 4): a venda no cartão sem taxa cadastrada entrou com 0% — o DRE diz, como o PDV. */}
            {avisoDoDreSemTaxa(p.vendasSemTaxa, p.quemCadastraATaxa) && (
              <p data-dre-sem-taxa role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', margin: '14px 0 0' }}>
                <AlertTriangle size={14} aria-hidden style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
                <span>{avisoDoDreSemTaxa(p.vendasSemTaxa, p.quemCadastraATaxa)}</span>
              </p>
            )}
            {/* A31 da 10ª: o que fica fora do resultado chega a quem não abre o Estoque (a contadora), e o DRE se exporta. */}
            <div data-fora-do-resultado style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', margin: 0 }}>
                Fora do resultado no período: compras no estoque (as entradas, ao custo) <strong style={{ color: 'var(--text)' }}>{fmtBRLFull(p.comprasNoEstoque?.total ?? 0)}</strong>
                {p.perdas && p.perdas.total.custo > 0 ? <> · perdas <strong style={{ color: 'var(--text)' }}>{fmtBRLFull(p.perdas.total.custo)}</strong> ({perdasComOMotivo(p.perdas.motivos)})</> : null}.
              </p>
              <button type="button" className="btn-secondary" onClick={() => baixarCsv(`dre-${p.period}.csv`, csvDoDre({
                periodo: p.periodLabel, receita: revenue, despesaOperacional: resultado.despesaOperacional, insumos: resultado.insumoConsumido,
                taxas: resultado.taxasDaMaquininha, comissoes: resultado.comissoes, lucro: profit,
                compras: p.comprasNoEstoque ?? { linhas: [], total: 0 }, perdas: p.perdas?.total.custo ?? null, perdasPorMotivo: p.perdas?.motivos ?? null,
                semTaxa: p.vendasSemTaxa,
              }))}>
                <Download size={15} aria-hidden /> Exportar o DRE (CSV)
              </button>
            </div>
          </SCard>
        )}
        <SCard title="Receita por Forma de Pagamento">
          <HBarChart data={byPayment} />
        </SCard>
        <SCard title="Receita por Categoria">
          <HBarChart
            data={byCategory}
            color={CHART_COLORS[1]}
            emptyMsg="Sem categorias registradas."
          />
        </SCard>
        {/* D5 da 34ª (UU-01, D-19): com uma unidade, o "por unidade" some. */}
        {!p.umaUnidade && (
        <SCard title="Faturamento por Unidade — Período Atual">
          <HBarChart data={branchCompareCurr} />
        </SCard>
        )}
        {!p.umaUnidade && (
        <SCard title="Faturamento por Unidade — Período Anterior">
          <HBarChart data={branchComparePrev} color={CHART_COLORS[5]} />
        </SCard>
        )}
        {/* As parcelas a receber são da unidade, não dos atendimentos dela. */}
        {(
          <SCard title="A receber em aberto" style={{ gridColumn: '1 / -1' }}>
            <SimpleTable
              columns={installCols}
              rows={installRows}
              emptyMsg="Nada a receber em aberto."
            />
          </SCard>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: VENDAS
// -----------------------------------------------------------------------------
const vendasNoPlural = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'venda' : 'vendas'}`

const PLURAL_DO_TIPO = {
  PROCEDIMENTO: 'Atendimentos avulsos', PACOTE: 'Pacotes', PRE_PAGO: 'Pré-pagos', PLANO: 'Planos', PRODUTO: 'Produtos',
  CREDITO: 'Créditos',
} as const

const COR_DO_TIPO = { PROCEDIMENTO: 'gray', PACOTE: 'blue', PRE_PAGO: 'blue', PLANO: 'green', PRODUTO: 'blue', CREDITO: 'amber' } as const

/**
 * Cada venda do período, uma linha (pedido do Heitor, 2026-10-14) — as
 * COMANDAS do PDV, com o número de cada uma (RL1, 2026-11-14). A lista e o
 * total vêm do banco (`metrics_vendas`): a tela não soma — o total do rodapé
 * é o do resumo, no mesmo recorte da lista.
 */
function TabVendas(p: ReportsBiProps) {
  const fuso = useFuso()
  const router = useRouter()
  const searchParams = useSearchParams()
  const v = p.vendas
  if (!v) return null
  const { resumo } = v
  const nomeDaUnidade = nomesDasUnidades(p.branches)
  const comUnidade = p.branches.length > 1
  const doFiltro = v.tipo ? resumo.porTipo[v.tipo] : resumo.geral
  // Sem filtro a lista tem todas as linhas (a paginação).
  const linhasDoFiltro = v.tipo ? doFiltro.quantidade : resumo.linhas
  const inicio = linhasDoFiltro === 0 ? 0 : (v.pagina - 1) * POR_PAGINA + 1
  const fim = (v.pagina - 1) * POR_PAGINA + v.linhas.length

  const ir = (mudar: Record<string, string | null>) => router.push(mesclarParams(searchParams, mudar))

  // A exportação leva o MESMO recorte da tela (período, unidade, tipo e tags), sem
  // página: todas as vendas.
  const exportar = new URLSearchParams()
  for (const chave of ['period', 'from', 'to'] as const) {
    const valor = searchParams.get(chave)
    if (valor) exportar.set(chave, valor)
  }
  if (!searchParams.get('period')) exportar.set('period', p.period)
  const unidade = p.selectedBranchId ?? (p.showBranchFilter ? null : p.branches[0]?.id ?? null)
  if (unidade) exportar.set('branch', unidade)
  if (v.tipo) exportar.set('tipo', v.tipo)
  // O filtro de Tags vai junto: o CSV é o que a tela mostra.
  const tagsDoFiltro = tagsNaUrl(p.tagsEscolhidas ?? [])
  if (tagsDoFiltro) exportar.set('tags', tagsDoFiltro)

  const th = (align: 'left' | 'right' = 'left'): CSSProperties => ({
    padding: '8px 12px', textAlign: align,
    fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  })
  const td = (align: 'left' | 'right' = 'left'): CSSProperties => ({
    padding: '10px 12px', textAlign: align, color: 'var(--text)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BaseDaAba texto="Valores da venda, com o voucher e os pontos" dica={DEFINICOES.baseDasVendas} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* A30 da 10ª: dois "totais" sem ponte — o caixa e o vendido. A diferença é a regra
            (princípio 5: o caixa no dia em que o dinheiro entrou), e a tela a diz — na dica do
            cartão (2026-11-16: a explicação mora na dica). */}
        <KpiCard label="Total vendido" value={resumo.geral.total} hero detalhe={vendasNoPlural(resumo.geral.quantidade)}
          rotuloDoSobre="Como o Total vendido se liga ao caixa" sobre={
            <span data-ponte-vendas-caixa>
              O Total vendido é a venda, no dia do primeiro pagamento dela (o que não foi pago não é venda); o caixa do período é o dinheiro, no dia em que entrou
              {/* O valor do caixa só com o Financeiro (o Heitor, 23/11: "financeiro é uma coisa, vendas é outra"). */}
              {p.veCaixa
                ? <>:{' '}<strong style={{ color: 'var(--text)' }}>{fmtBRLFull(p.core.revenueCash)}</strong> (Financeiro).</>
                : <> (no Financeiro, que pede o Financeiro em Ver).</>}{' '}A diferença é a regra: o crédito
              interno vendido é venda e conta aqui, e o que a cliente paga com ele não conta de novo (a venda paga só com crédito não entra, e a
              parte paga com crédito sai do valor da linha); o pacote, o pré-pago e o plano parcelados entram aqui
              inteiros, no dia da primeira parcela paga, e no caixa só o que já foi recebido; a sessão de pacote, de plano e a unidade pré-paga não são venda de novo;
              o voucher e os pontos da fidelidade pagam parte da venda (contam aqui) e não entram no caixa; o desconto da venda fica fora dos dois.
            </span>
          } />
        {TIPOS_DE_VENDA.map(t => (
          <KpiCard key={t} label={PLURAL_DO_TIPO[t]} value={resumo.porTipo[t].total}
            detalhe={vendasNoPlural(resumo.porTipo[t].quantidade)} />
        ))}
      </div>

      <SCard title="Vendas do período" rotuloDoSobre="Quem aparece em Profissional" sobre={
        <span data-legenda-das-vendas>
          Profissional: quem atendeu; no pacote, no pré-pago, no produto e no plano, quem vendeu (sem “Quem vendeu”, a venda fica sem nome); o crédito interno não tem. A sessão de pacote, de plano ou pré-paga não aparece de novo — já foi vendida. A venda de antes do PDV não tem comanda (—).
        </span>
      }>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <SegSelect
            ariaLabel="Tipo de venda"
            value={v.tipo ?? 'todas'}
            onSelect={k => ir({ tipo: k === 'todas' ? null : k, pagina: null })}
            options={[{ key: 'todas', label: 'Todas' }, ...TIPOS_DE_VENDA.map(t => ({ key: t, label: PLURAL_DO_TIPO[t] }))]}
          />
          <a className="btn-secondary" href={`/api/relatorios/vendas?${exportar.toString()}`} download>
            <Download size={15} aria-hidden /> Exportar CSV
          </a>
        </div>

        {v.linhas.length === 0 ? (
          <EmptyMsg texto="Nenhuma venda no período." />
        ) : (
          <div className="table-wrap">
            {/* Sete colunas não cabem em 390px: no celular cada venda vira um
                bloco de rótulo e valor, em vez de a tabela rolar no card. */}
            <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm-sz)' }}>
              <thead>
                <tr>
                  <th style={th()}>Data</th>
                  <th style={th()}>Comanda</th>
                  <th style={th()}>Tipo</th>
                  <th style={th()}>Descrição</th>
                  <th style={th()}>Cliente</th>
                  <th style={th()}>Profissional</th>
                  {comUnidade && <th style={th()}>Unidade</th>}
                  <th style={th('right')}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {v.linhas.map((l, i) => (
                  <tr key={`${l.tipo}-${l.id}`} data-venda={l.tipo}
                    style={{ borderBottom: i < v.linhas.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                    <td data-label="Data" data-par style={{ ...td(), whiteSpace: 'nowrap' }}>{new Date(l.data).toLocaleDateString('pt-BR', { timeZone: fuso })}</td>
                    <td data-label="Comanda" data-par data-comanda style={{ ...td(), whiteSpace: 'nowrap', color: l.comanda == null ? 'var(--text-faint)' : 'var(--text)' }}>{comandaDaVenda(l)}</td>
                    <td data-label="Tipo" data-par style={td()}><Badge label={ROTULO_DO_TIPO[l.tipo]} color={COR_DO_TIPO[l.tipo]} /></td>
                    <td data-label="" style={{ ...td(), fontWeight: 600, minWidth: 180 }}>
                      {descricaoDaVenda(l)}
                      {/* A10 da 28ª: o cancelado diz que foi (o valor já é o que a rede ficou). */}
                      {marcaDoCancelamento(l) && <span data-venda-cancelada style={{ marginLeft: 6 }}><Badge label={marcaDoCancelamento(l)!} color="amber" /></span>}
                    </td>
                    <td data-label="Cliente" style={td()}>{l.cliente ?? '—'}</td>
                    {/* Pendente 17 da 27ª: a linha diz se é quem atendeu ou quem vendeu. */}
                    <td data-label={quemDaVenda(l.tipo)} style={td()}>
                      {l.profissional ?? '—'}
                      {l.profissional && l.tipo !== 'CREDITO' && (
                        <span data-quem-da-venda style={{ display: 'block', fontSize: 'var(--text-overline)', color: 'var(--text-muted)' }}>{quemDaVenda(l.tipo)}</span>
                      )}
                    </td>
                    {comUnidade && <td data-label="Unidade" style={td()}>{nomeDaUnidade(l.branchId)}</td>}
                    <td data-label="Valor" style={{ ...td('right'), fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtBRLFull(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)',
        }}>
          <p data-total-vendas style={{ margin: 0, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            {vendasNoPlural(doFiltro.quantidade)} · <strong style={{ color: 'var(--text)' }}>{fmtBRLFull(doFiltro.total)}</strong>
          </p>
          {v.paginas > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                {inicio}–{fim} de {linhasDoFiltro.toLocaleString('pt-BR')}
              </span>
              <button type="button" className="btn-ghost" disabled={v.pagina <= 1}
                onClick={() => ir({ pagina: v.pagina - 1 > 1 ? String(v.pagina - 1) : null })}>Anterior</button>
              <button type="button" className="btn-ghost" disabled={v.pagina >= v.paginas}
                onClick={() => ir({ pagina: String(v.pagina + 1) })}>Próxima</button>
            </div>
          )}
        </div>
      </SCard>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: AGENDA
// -----------------------------------------------------------------------------
function TabAgenda(p: ReportsBiProps) {
  const { relatorio: r, core, corePrev, branches } = p
  const nomeDaUnidade = nomesDasUnidades(branches)

  // As contagens do período são as do núcleo (as mesmas do dashboard).
  const total      = core.appointmentsTotal
  const completed  = core.appointmentsCompleted
  const cancelled  = core.appointmentsCancelled
  const noShow     = core.appointmentsNoShow
  // A divisão mora em lib/metrics (§13.1, 2026-10-29); a tela só formata.
  // Sem agendamento não há taxa: "—", não 0% (ind-10 — 0% diz que foi ruim).
  const rate       = taxaDeConclusao({ concluidos: completed, total })

  // As fatias são as de lib/metrics (J-57) — a mesma conta da Visão geral.
  const byStatus = statusDosAgendamentos({ total, concluidos: completed, cancelados: cancelled, faltas: noShow })
    .map(x => ({ name: STATUS_LABELS[x.status] ?? x.status, value: x.n }))

  // Dia da semana no fuso do negócio (0 = domingo), contado no banco.
  const byWeekday = r.porDiaDaSemana.map(d => ({ day: d.dia, count: d.n }))
  const bySource  = r.porOrigem.map(o => ({ name: SRC_LABELS[o.origem] ?? o.origem, value: o.n }))

  // Branch comparison table
  const branchCols: TableColumn[] = [
    { key: 'name',       label: 'Unidade'    },
    { key: 'completed',  label: 'Realizados', align: 'center' },
    { key: 'cancelled',  label: 'Cancelados', align: 'center' },
    { key: 'noShow',     label: 'No-Show',    align: 'center' },
    {
      key: 'rate', label: 'Conclusão', align: 'center',
      render: (v) => v === '—' ? '—' : (
        <Badge label={`${Number(v).toFixed(1).replace('.', ',')}%`} color={Number(v) >= 70 ? 'green' : Number(v) >= 50 ? 'amber' : 'red'} />
      ),
    },
  ]
  const branchRows = r.agendaPorUnidade.map(u => ({
    name:      nomeDaUnidade(u.branchId),
    completed: u.concluidos,
    cancelled: u.cancelados,
    noShow:    u.faltas,
    rate:      taxaDeConclusao({ concluidos: u.concluidos, total: u.total }) ?? '—',
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* A38: a aba conta até o fim do período — dito na dica do total (2026-11-16). */}
        <KpiCard label="Total Agendamentos" value={total}     format="int" rotuloDoSobre="Quais agendamentos entram"
          sobre="Inclui os agendamentos até o fim do período, com os futuros e os cancelados." />
        <KpiCard label="Realizados"         value={completed} format="int" delta={pctDelta(completed, corePrev.appointmentsCompleted)} showDelta />
        <KpiCard label="Cancelados"         value={cancelled} format="int" accent="var(--warning)" />
        <KpiCard label="Não Compareceu"     value={noShow}    format="int" accent="var(--danger)" />
        <KpiCard label="Taxa de Conclusão"  value={rate}      format="pct" accent={rate == null ? undefined : rate >= 70 ? 'var(--success)' : 'var(--warning)'} dica={DEFINICOES.conclusao} />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Distribuição por Status">
          <DonutChart
            data={byStatus}
            colors={[CHART_COLORS[3]!, CHART_COLORS[4]!, 'var(--danger)', CHART_COLORS[5]!]}
            formatLabel={(v, t) => `${v} (${((v/t)*100).toFixed(0)}%)`}
          />
        </SCard>
        <SCard title="Volume por Dia da Semana">
          <WeekBarChart data={byWeekday} />
        </SCard>
        <SCard title="Origem dos Agendamentos">
          <HBarChart
            data={bySource}
            color={CHART_COLORS[2]}
            formatValue={(v) => String(v)}
          />
        </SCard>
        {!p.umaUnidade && (
        <SCard title="Comparativo por Unidade">
          <SimpleTable columns={branchCols} rows={branchRows} />
        </SCard>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: CLIENTES
// -----------------------------------------------------------------------------
function TabClientes(p: ReportsBiProps) {
  const fuso = useFuso()
  const { relatorio: r, core, corePrev, retention, newClientsSeries } = p
  const c = r.clientes

  const totalAtivos = c.totalAtivos
  // Novos clientes do núcleo, só na REDE (o Heitor, 18/11: "o cliente é da rede"):
  // numa unidade da rede de duas ou mais o número é nulo, e a aba não o mostra.
  const novos       = core.newClients

  // Retenção vem do banco: clientes atendidos no período que JÁ tinham sido
  // atendidos antes dele. O cálculo anterior — "2+ atendimentos dentro da
  // janela" — media recorrência, não retenção, e em janelas curtas dava zero
  // por construção.
  const { clientsServed, firstTimeClients } = retention
  const taxaRetencao = taxaDeRetencao(retention)

  // O ticket médio: a média do que as clientes que pagaram gastaram no período
  // (era o "Gasto médio" desta aba, o mesmo número; agora UM indicador com o
  // ticket de toda tela — decisão do Heitor, 2026-10-29).
  const gastoMedio = p.ticketMedio

  // Série de aquisição agregada no banco, dentro da janela e no fuso do
  // negócio.
  const acquisitionData = newClientsSeries.map(pt => ({
    label: new Date(pt.bucket).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', timeZone: fuso,
    }),
    value: pt.count,
  }))

  // Faixa etária pela mesma função da aba Procedimentos (metrics_faixa_etaria).
  const byAge = AGE_GROUP_ORDER
    .map(faixa => ({ name: faixa, value: c.porFaixa.find(f => f.faixa === faixa)?.n ?? 0 }))
    .filter(f => f.value > 0)
  const byGender = c.porGenero.map(g => ({ name: g.genero, value: g.n }))
  const byCities = c.cidades.map(x => ({ name: x.cidade, value: x.n }))
  const top10Rows = c.topClientes.map(x => ({
    name:  x.nome,
    total: fmtBRLFull(x.total),
    appts: String(x.atendimentos),
  }))

  const top10Cols: TableColumn[] = [
    { key: 'name',  label: 'Cliente'    },
    { key: 'total', label: 'Gasto Total', align: 'right' },
    { key: 'appts', label: 'Atendimentos', align: 'center' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Total Ativos"     value={totalAtivos}  format="int" />
        {novos !== null && <KpiCard label="Novos no Período" value={novos} format="int" delta={pctDelta(novos, corePrev.newClients ?? 0)} showDelta />}
        <KpiCard label="Atendidos no Período" value={clientsServed}    format="int" accent={CHART_COLORS[1]} />
        <KpiCard label="Primeira Vez"         value={firstTimeClients} format="int" accent={CHART_COLORS[2]} />
        <KpiCard label="Taxa de Retenção"     value={taxaRetencao}     format="pct" accent={taxaRetencao == null ? undefined : taxaRetencao >= 40 ? 'var(--success)' : 'var(--warning)'} />
        <KpiCard label="Ticket médio"     value={gastoMedio}   format="brl" />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        {novos !== null && (
        <SCard title="Novos Clientes ao Longo do Tempo" style={{ gridColumn: '1 / -1' }}>
          <MiniAreaChart data={acquisitionData} height={160} />
        </SCard>
        )}
        <SCard title="Faixa Etária">
          <DonutChart data={byAge} />
        </SCard>
        <SCard title="Gênero">
          <DonutChart data={byGender} colors={[CHART_COLORS[0]!, CHART_COLORS[2]!, CHART_COLORS[5]!]} />
        </SCard>
        <SCard title="Top 10 Cidades">
          <HBarChart data={byCities} formatValue={(v) => String(v)} color={CHART_COLORS[2]} />
        </SCard>
        <SCard title="Top 10 Clientes por Gasto">
          <SimpleTable columns={top10Cols} rows={top10Rows} />
        </SCard>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers — faixa etária e ranking por idade
// -----------------------------------------------------------------------------
const AGE_GROUP_ORDER = ['< 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+', 'Não informado']

function AgeRankCard({ data }: {
  data: { ageGroup: string; top3: { name: string; label: string }[] }[]
}) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', margin: 0 }}>Sem dados para exibir.</p>
  }
  const rankColors = ['var(--brand)', 'var(--text-muted)', 'var(--text-faint)']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {data.map(({ ageGroup, top3 }) => (
        <div key={ageGroup}>
          <div style={{
            fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            {ageGroup}
          </div>
          {top3.map((item, idx) => (
            <div key={item.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 0',
              borderBottom: idx < top3.length - 1 ? '1px solid var(--hairline)' : 'none',
            }}>
              <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 800, color: rankColors[idx], minWidth: 20 }}>
                #{idx + 1}
              </span>
              <span style={{
                flex: 1, fontSize: 'var(--text-base-sz)', color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.name}
              </span>
              <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: PROCEDIMENTOS
// -----------------------------------------------------------------------------
/** "R$ 160,00 concluídos sem pagamento (1)" e "R$ 450,00 pagos com crédito interno (não é receita)" — A47/A43 da 8ª. */
/** A11 da 13ª: o Top 5 da Visão geral diz o pago com crédito na clínica, como as tabelas. */
function NotasDoTop5({ notas }: { notas: string[] }) {
  if (notas.length === 0) return null
  return (
    <div data-top5-com-credito style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 500, marginTop: 6 }}>
      {notas.map(n => <p key={n}>{n}</p>)}
    </div>
  )
}

function NotaSemReceita({ s }: { s: SemReceita | undefined }) {
  if (!s || (s.semPagamento.n === 0 && s.comCredito.valor <= 0)) return null
  return (
    <span data-sem-receita style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>
      {s.semPagamento.n > 0 && <span style={{ display: 'block' }}>{fmtBRLFull(s.semPagamento.valor)} concluídos sem pagamento ({s.semPagamento.n})</span>}
      {s.comCredito.valor > 0 && <span style={{ display: 'block' }}>{fmtBRLFull(s.comCredito.valor)} pagos com crédito interno (não é receita)</span>}
    </span>
  )
}

function TabProcedimentos(p: ReportsBiProps) {
  const { relatorio: r } = p
  const faixas = r.procedimentosPorFaixa

  // Top 3 por faixa etária, na ordem das faixas. Vêm ranqueados do banco.
  const porFaixa = <T,>(linhas: (T & { faixa: string })[], rotulo: (l: T) => string, nome: (l: T) => string) =>
    AGE_GROUP_ORDER
      .filter(faixa => linhas.some(l => l.faixa === faixa))
      .map(faixa => ({
        ageGroup: faixa,
        top3: linhas.filter(l => l.faixa === faixa).map(l => ({ name: nome(l), label: rotulo(l) })),
      }))
  const topByAgeVolume = porFaixa(faixas.volume, l => `${l.n} exec.`, l => l.nome)
  const topByAgeMargin = porFaixa(faixas.margem, l => `${l.margem.toFixed(1).replace('.', ',')}%`, l => l.nome)

  // As EXECUÇÕES de procedimento (F16-1: a sessão de plano conta uma por
  // procedimento dela — o total fecha com a soma da tabela abaixo) e a
  // receita PAGA delas (D3 da 5ª: era o preço dos concluídos — o não pago e a
  // sessão de pacote entravam) — e o MESMO ticket médio do sistema inteiro
  // (§13.1, lib/metrics: o pago pelas clientes ÷ as que pagaram, 2026-10-29).
  // Os rankings abaixo são por procedimento, com a mesma receita paga.
  const totalExec   = r.execucoes.atual
  const totalRev    = r.receitaDosAtendimentos
  const avgTicket   = p.ticketMedio
  const topByName   = [...r.porProcedimento].sort((a, b) => b.receita - a.receita)
  const topRevenue  = topByName.slice(0, 10).map(d => ({ name: d.nome, value: d.receita }))
  const topVolume   = [...r.porProcedimento]
    .sort((a, b) => b.execucoes - a.execucoes).slice(0, 10)
    .map(d => ({ name: d.nome, value: d.execucoes }))
  // No empate em execuções, a receita desempata; empatando também nela, a
  // tela diz que houve empate (J-58 — era a ordem alfabética, calada).
  const oMaisRealizado = maisRealizado(r.porProcedimento)

  // Receita por categoria, somada no banco (nenhuma tela soma dinheiro).
  const byCategory = r.receitaPorCategoriaDeProcedimento.map(c => ({ name: c.categoria, value: c.receita }))

  const tableCols: TableColumn[] = [
    { key: 'name',     label: 'Procedimento'  },
    { key: 'category', label: 'Categoria'     },
    { key: 'count',    label: 'Execuções',    align: 'center' },
    { key: 'revenue',  label: 'Receita dos atendimentos', align: 'right',
      render: (v, row) => <>{fmtBRLFull(Number(v))}<NotaSemReceita s={p.semReceita?.porProcedimento[String(row.name)]} /></> },
    // Receita do procedimento ÷ as execuções dele: não é o ticket médio (que só
    // conta os cobrados), e o nome diz isso (D11).
    { key: 'ticket',   label: 'Média por execução', align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    { key: 'pct',      label: '% do Total',    align: 'center', render: (v) => `${v}%` },
  ]
  const tableRows = topByName.slice(0, 20).map(d => ({
    name:     d.nome,
    category: d.categoria,
    count:    d.execucoes,
    revenue:  d.receita,
    // As duas contas moram em lib/metrics (§13.1); a tela só formata.
    ticket:   mediaPorExecucao(d) ?? 0,
    pct:      (participacaoPct(d.receita, totalRev) ?? 0).toFixed(1),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BaseDaAba texto="Receita líquida do voucher e dos pontos" dica={DEFINICOES.baseDosProcedimentos} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* Só "Total Execuções" tem delta: o anterior da receita paga dos
            atendimentos não é carregado. O ticket é o do sistema (por
            cliente), sem o anterior carregado. */}
        <KpiCard label="Total Execuções" value={totalExec} format="int" delta={pctDelta(totalExec, r.execucoes.anterior)} showDelta />
        <KpiCard label="Receita dos atendimentos" value={totalRev} format="brl" dica={DEFINICOES.receitaDosAtendimentos} />
        {/* A55: o ticket é o do sistema (por CLIENTE) e o nome diz isso; a
            média por execução (a receita paga ÷ as execuções) vem ao lado. */}
        <KpiCard label="Ticket médio por cliente" value={avgTicket} format="brl" dica={DEFINICOES.ticket} />
        <KpiCard label="Média por execução" value={mediaPorExecucao({ receita: totalRev, execucoes: totalExec })} format="brl" />
        <div className="card" style={{ padding: '16px 20px', flex: '1 1 160px' }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
            Mais Realizado
          </p>
          <p data-mais-realizado style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--brand)', margin: 0, lineHeight: 1.3 }}>
            {oMaisRealizado ? oMaisRealizado.nomes.join(' e ') : '—'}
          </p>
          {oMaisRealizado && (
            <p data-mais-realizado-detalhe style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: '4px 0 0' }}>
              {oMaisRealizado.nomes.length > 1
                ? `Empate: ${oMaisRealizado.execucoes} ${oMaisRealizado.execucoes === 1 ? 'execução' : 'execuções'} cada, e a mesma receita`
                : oMaisRealizado.desempatePelaReceita
                  ? `${oMaisRealizado.execucoes} execuções — empatou em execuções; desempate pela receita`
                  : `${oMaisRealizado.execucoes} ${oMaisRealizado.execucoes === 1 ? 'execução' : 'execuções'}`}
            </p>
          )}
        </div>
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Top 10 por receita dos atendimentos" dica={DEFINICOES.receitaDosAtendimentos}>
          <HBarChart data={topRevenue} />
        </SCard>
        <SCard title="Top 10 por Volume">
          <HBarChart data={topVolume} color={CHART_COLORS[1]} formatValue={(v) => String(v)} />
        </SCard>
        <SCard title="Distribuição por Categoria">
          <DonutChart data={byCategory} />
        </SCard>
        <SCard title="Receita dos atendimentos por categoria" dica={DEFINICOES.receitaDosAtendimentos}>
          <HBarChart
            data={byCategory.sort((a, b) => b.value - a.value)}
            color={CHART_COLORS[2]}
          />
        </SCard>
        <SCard title="Top 3 por Faixa de Idade — Volume">
          <AgeRankCard data={topByAgeVolume} />
        </SCard>
        {(
          <SCard title="Top 3 por Faixa de Idade — Margem" rotuloDoSobre="Como a margem é contada"
            sobre="Pelo preço do agendamento (antes do voucher e dos pontos) menos o custo do catálogo.">

            {!faixas.temCustos
              ? <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', margin: 0 }}>
                  Configure o custo dos insumos em Procedimentos para visualizar a margem por faixa etária.
                </p>
              : <AgeRankCard data={topByAgeMargin} />
            }
          </SCard>
        )}
        <SCard title="Detalhamento por Procedimento" style={{ gridColumn: '1 / -1' }}>
          <SimpleTable columns={tableCols} rows={tableRows} />
        </SCard>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: PROFISSIONAIS
// -----------------------------------------------------------------------------
function TabProfissionais(p: ReportsBiProps) {
  const { relatorio: r, core, corePrev, verComissoes } = p

  // Quem ATENDE, contado em lib/metrics (D14): era quem teve produção no período.
  const profissionais = p.quemAtende?.total ?? 0
  const totalAppts    = core.appointmentsCompleted
  // Comissões do núcleo: o período é o do LANÇAMENTO (released_at).
  const commOpen      = core.commissionsOpen
  const commPaid      = core.commissionsPaid

  const byRevenue = r.porProfissional.map(x => ({ name: x.nome, value: x.receita })).sort(porValor)
  const byCount   = r.porProfissional.map(x => ({ name: x.nome, value: x.atendimentos })).sort(porValor)

  const commCols: TableColumn[] = [
    { key: 'name',    label: 'Profissional'   },
    { key: 'appts',   label: 'Atendimentos',   align: 'center' },
    { key: 'revenue', label: 'Receita dos atendimentos', align: 'right',
      render: (v, row) => <>{fmtBRLFull(Number(v))}<NotaSemReceita s={p.semReceita?.porProfissional[String(row.name)]} /></> },
    { key: 'open',    label: 'Comissão Aberta', align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    { key: 'paid',    label: 'Comissão Paga',   align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    {
      key: 'status', label: 'Status', align: 'center',
      render: (v) => <Badge label={String(v)} color={v === 'OK' ? 'green' : 'amber'} />,
    },
  ]
  const producao  = new Map(r.porProfissional.map(x => [x.nome, x]))
  const comissoes = new Map(r.comissoesPorProfissional.map(x => [x.nome, x]))
  // A tabela lista quem atende (e quem atendeu no período); a comissão de quem
  // NÃO atende (a recepção, pela venda do pacote) fica numa linha à parte (D14).
  const atendem = new Set([...(p.quemAtende?.nomes ?? []), ...producao.keys()])
  const semAtender = r.comissoesPorProfissional.filter(c => !atendem.has(c.nome))
  const commRows = [...atendem].map(name => {
    const open = comissoes.get(name)?.aberta ?? 0
    return {
      name,
      appts:   producao.get(name)?.atendimentos ?? 0,
      revenue: producao.get(name)?.receita ?? 0,
      open,
      paid:    comissoes.get(name)?.paga ?? 0,
      status:  open === 0 ? 'OK' : 'Pendente',
    }
  }).sort((a, b) => b.revenue - a.revenue)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Profissionais Ativos" value={profissionais} format="int" />
        <KpiCard label="Atendimentos"         value={totalAppts}    format="int" delta={pctDelta(totalAppts, corePrev.appointmentsCompleted)} showDelta />
        {verComissoes && <>
          <KpiCard label="Comissões em Aberto"  value={commOpen}      format="brl" accent="var(--warning)" />
          <KpiCard label="Comissões Pagas"      value={commPaid}      format="brl" accent="var(--success)" />
        </>}
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Receita dos atendimentos por profissional" dica={DEFINICOES.receitaDosAtendimentos}>
          <HBarChart data={byRevenue} />
        </SCard>
        <SCard title="Atendimentos por Profissional">
          <HBarChart data={byCount} color={CHART_COLORS[1]} formatValue={(v) => String(v)} />
        </SCard>
        {verComissoes && (
          <SCard title="Comissões por Profissional" style={{ gridColumn: '1 / -1' }}>
            <SimpleTable columns={commCols} rows={commRows} />
            {semAtender.length > 0 && (
              <p data-comissao-sem-atender style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', margin: '10px 0 0' }}>
                Também têm comissão, sem atender: {semAtender.map(c => `${c.nome} (${fmtBRLFull(c.aberta)} em aberto, ${fmtBRLFull(c.paga)} paga)`).join('; ')}
              </p>
            )}
          </SCard>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: ESTOQUE
// -----------------------------------------------------------------------------
function TabEstoque(p: ReportsBiProps) {
  const { relatorio: r, productBatches, branches } = p
  const fuso = useFuso()
  const e = r.estoque
  const nomeDaUnidade = nomesDasUnidades(branches)

  const totalStockValue = e.valorEmEstoque
  // Consumo ao custo do MOVIMENTO, a mesma conta do giro do dashboard.
  const consumoValue    = r.consumoTotal
  const giro            = giroDoEstoque({ consumo: consumoValue, valorEmEstoque: totalStockValue })
  const criticos        = e.criticos
  const zerados         = e.zerados
  const topConsumed     = e.maisConsumidos.map(x => ({ name: x.nome, value: x.valor }))
  const byCategory      = e.valorPorCategoria.map(x => ({ name: x.categoria, value: x.valor }))

  // Branch health table
  const branchHealthCols: TableColumn[] = [
    { key: 'name',     label: 'Unidade'        },
    { key: 'total',    label: 'Itens',  align: 'center' },
    { key: 'zerados',  label: 'Zerados', align: 'center',
      render: (v) => <Badge label={String(v)} color={Number(v) > 0 ? 'red' : 'green'} /> },
    { key: 'criticos', label: 'Críticos', align: 'center',
      render: (v) => <Badge label={String(v)} color={Number(v) > 0 ? 'amber' : 'green'} /> },
    { key: 'value',    label: 'Valor em Estoque', align: 'right', render: (v) => fmtBRLFull(Number(v)) },
  ]
  const branchHealthRows = e.porUnidade.map(u => ({
    name: nomeDaUnidade(u.branchId), total: u.itens, zerados: u.zerados, criticos: u.criticos, value: u.valor,
  }))

  // Expiring batches
  const today = new Date()
  const batchCols: TableColumn[] = [
    { key: 'product',    label: 'Produto'    },
    { key: 'batch',      label: 'Lote'       },
    { key: 'expires',    label: 'Validade'   },
    { key: 'qty',        label: 'Qtd', align: 'center' },
    {
      key: 'days', label: 'Dias Restantes', align: 'center',
      render: (v, row) => <Badge label={String(row.rotulo ?? `${v}d`)} color={Number(v) <= 7 ? 'red' : Number(v) <= 15 ? 'amber' : 'gray'} />,
    },
  ]
  const batchRows = productBatches.map(b => {
    const validade = validadeDoLote(b.expires_at, today, fuso)
    return {
      product: b.products?.name ?? '—',
      batch:   b.batch_number ?? '—',
      expires: validade.dia,
      qty:     b.saldo,
      days:    validade.dias,
      rotulo:  validade.rotulo,
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {<KpiCard label="Valor em Estoque" value={totalStockValue} format="brl" />}
        {/* A37 da 22ª (princípio 3): o mesmo detalhe da tela de Estoque — o produto vendido fica fora. */}
        <KpiCard label="Consumo no Período" value={consumoValue} format="brl" accent="var(--warning)" detalhe={DETALHE_DO_GIRO} />
        {/* est-04/est-05: a perda é MÉTRICA (não entra no lucro nem no caixa — D8
            da 10ª: nem quando a compra é paga), e o custo com perdas é para análise. */}
        {p.perdas && <>
          <KpiCard label="Perdas no período" value={p.perdas.total.custo} format="brl" accent="var(--danger)"
            rotuloDoSobre="Por que a perda fica fora do lucro" sobre="Métrica: não entra no lucro, nem quando a compra é paga" />
          <KpiCard label="Consumo com perdas" value={consumoComPerdas({ consumo: consumoValue, perdas: p.perdas.total.custo })} format="brl"
            rotuloDoSobre="O que o Consumo com perdas soma" sobre="Insumo consumido + perdas, ao custo do lote" />
        </>}
        {<>
          <KpiCard label="Giro (%)" value={giro} format="pct" accent={giro == null ? undefined : giro >= 50 ? 'var(--success)' : 'var(--warning)'} />
          {/* D22 da 31ª (princípio 3): conta PRODUTOS, como o "Produtos zerados" (D19 da 8ª) — a linha de cada
              unidade, na tabela abaixo, conta o produto NELA, e a soma das linhas não é este número. */}
          <KpiCard label="Produtos críticos" value={criticos} format="int" accent="var(--warning)"
            rotuloDoSobre="O que conta como produto crítico"
            sobre={e.porUnidade.length > 1
              ? 'Os produtos no mínimo ou abaixo dele em alguma unidade do recorte (o zerado que tem mínimo também). O mesmo produto em duas unidades conta uma vez.'
              : 'Os produtos no mínimo ou abaixo dele na unidade (o zerado que tem mínimo também).'} />
          {/* D19 da 8ª: produtos (não pares unidade × produto) — a conta do Estoque e do dashboard. */}
          <KpiCard label="Produtos zerados" value={zerados} format="int" accent="var(--danger)"
            rotuloDoSobre="O que conta como produto zerado"
            sobre={e.porUnidade.length > 1 ? 'Os produtos sem saldo em nenhuma unidade do recorte.' : 'Os produtos sem saldo na unidade.'} />
        </>}
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Top 10 Produtos Mais Consumidos (custo)">
          <HBarChart data={topConsumed} color="var(--warning)" />
        </SCard>
        {<>
          {/* A30 da 23ª (princípio 7): com uma categoria só, a pizza era 100% numa fatia — não diz nada. */}
          {byCategory.length > 1 && (
          <SCard title="Valor em Estoque por Categoria">
            <DonutChart data={byCategory} />
          </SCard>
          )}
          {/* A31 da 24ª (princípio 3): com uma categoria só, o quadro diz por que não há gráfico. */}
          {byCategory.length === 1 && (
          <SCard title="Valor em Estoque por Categoria"
            rotuloDoSobre="Por que não há gráfico" sobre="Com uma categoria só, o gráfico seria uma fatia inteira. Ele aparece quando os produtos tiverem duas ou mais categorias (no cadastro do produto).">
            <p data-categoria-unica style={{ margin: 0, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              Todo o valor está em <strong style={{ color: 'var(--text)' }}>{byCategory[0]!.name}</strong>.
            </p>
          </SCard>
          )}
          {/* D14 da 30ª: o "Zerados" de cada linha é o da unidade; o "Produtos zerados" de cima, o de nenhuma
              unidade (D19 da 8ª) — duas perguntas da mesma conta (metrics_relatorio), e a soma das linhas não é o de cima. */}
          {!p.umaUnidade && (
          <SCard title="Saúde do Estoque por Unidade" rotuloDoSobre="O que conta como zerado e crítico aqui"
            sobre="Zerados: os produtos sem saldo nesta unidade. Um produto zerado aqui e com saldo em outra unidade não entra em “Produtos zerados”, que conta os sem saldo em nenhuma. Críticos: os produtos no mínimo ou abaixo dele nesta unidade. O mesmo produto crítico em duas unidades conta nas duas linhas e uma vez em “Produtos críticos”."
            style={{ gridColumn: '1 / -1' }}>
            <SimpleTable columns={branchHealthCols} rows={branchHealthRows} />
          </SCard>
          )}
        </>}
        {batchRows.length > 0 && (
          <SCard title="Validades Próximas (≤ 30 dias)" style={{ gridColumn: '1 / -1' }}>
            <SimpleTable columns={batchCols} rows={batchRows} emptyMsg="Sem lotes vencendo em breve." />
          </SCard>
        )}
        {/* As perdas do período (D-7): por motivo e produto, com o custo — os
            números vêm prontos do banco (metrics_perdas). */}
        {p.perdas && (
          <div data-perdas style={{ gridColumn: '1 / -1' }}>
            <SCard title="Perdas no período">
              {p.perdas.total.movimentos === 0 ? (
                <EmptyMsg texto="Nenhuma perda registrada no período." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {p.perdas.motivos.map(m => (
                      <span key={m.motivo} style={{
                        fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                        background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text)',
                      }}>
                        {rotuloDoMotivo(m.motivo)} · {fmtBRLFull(m.custo)}
                      </span>
                    ))}
                    <span style={{
                      fontSize: 'var(--text-xs-sz)', fontWeight: 800, padding: '4px 10px', borderRadius: 99,
                      background: 'var(--danger-soft)', color: 'var(--danger)',
                    }}>
                      Total {fmtBRLFull(p.perdas.total.custo)}
                    </span>
                  </div>
                  <SimpleTable
                    columns={[
                      { key: 'motivo',  label: 'Motivo' },
                      { key: 'produto', label: 'Produto' },
                      { key: 'lote',    label: 'Lote' },
                      { key: 'qtd',     label: 'Quantidade', align: 'right' },
                      { key: 'custo',   label: 'Custo', align: 'right', render: v => fmtBRLFull(Number(v)) },
                    ]}
                    rows={p.perdas.linhas.map(l => ({
                      motivo:  rotuloDoMotivo(l.motivo),
                      produto: l.produto,
                      // Item 6 (18/11): de qual lote saiu (número e validade).
                      lote:    textoDosLotes(l.lotes),
                      qtd:     l.unidade !== l.embalagem
                        ? `${l.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${medidaNoPlural(l.unidade, l.quantidade)} (${l.embalagens.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${medidaNoPlural(l.embalagem, l.embalagens)})`
                        : `${l.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${medidaNoPlural(l.unidade, l.quantidade)}`,
                      custo:   l.custo,
                    }))}
                  />
                </div>
              )}
            </SCard>
          </div>
        )}
        {/* As transferências entre unidades (A33 da 20ª): o que saiu e o que
            entrou em cada unidade, com o custo — prontos do banco
            (metrics_transferencias_de_estoque). */}
        {p.transferencias && (
          <div data-transferencias style={{ gridColumn: '1 / -1' }}>
            <SCard title="Transferências entre unidades" rotuloDoSobre="Sobre as transferências"
              sobre="O custo é o do lote que saiu, nas duas pontas: a transferência não muda o valor do produto.">
              {p.transferencias.movimentos === 0 ? (
                <EmptyMsg texto="Nenhuma transferência no período." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {p.transferencias.porUnidade.map(u => (
                      <span key={u.branchId} data-transferencias-da-unidade style={{
                        fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                        background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text)',
                      }}>
                        {u.unidade} · saiu {fmtBRLFull(u.saiu)} · entrou {fmtBRLFull(u.entrou)}
                      </span>
                    ))}
                  </div>
                  <SimpleTable
                    columns={[
                      { key: 'unidade',   label: 'Unidade' },
                      { key: 'movimento', label: 'Movimento' },
                      { key: 'produto',   label: 'Produto' },
                      { key: 'qtd',       label: 'Quantidade', align: 'right' },
                      { key: 'custo',     label: 'Custo', align: 'right', render: v => fmtBRLFull(Number(v)) },
                    ]}
                    rows={p.transferencias.linhas.map(l => ({
                      unidade:   l.unidade,
                      movimento: l.direcao === 'SAIU' ? `Saiu para ${l.outra ?? '—'}` : `Entrou de ${l.outra ?? '—'}`,
                      produto:   l.produto,
                      qtd:       l.medida && l.medida !== l.embalagem
                        ? `${l.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${medidaNoPlural(l.medida, l.quantidade)} (${l.embalagens.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${medidaNoPlural(l.embalagem, l.embalagens)})`
                        : `${l.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${medidaNoPlural(l.embalagem, l.quantidade)}`,
                      custo:     l.custo,
                    }))}
                  />
                </div>
              )}
            </SCard>
          </div>
        )}
        {/* Item 6 do escopo de 18/11: as entradas e saídas do período, uma linha
            cada, paginadas no banco (metrics_movimentos_de_estoque). */}
        {p.movimentos && <MovimentosDoEstoque m={p.movimentos} comUnidade={branches.length > 1} />}
      </div>
    </div>
  )
}

/** O lote de cada linha: "TX-1 · val. 15/11/2026", vários separados por vírgula; sem lote, "—". */
function textoDosLotes(lotes: { numero: string | null; validade: string | null }[]): string {
  if (!lotes.length) return '—'
  return lotes.map(l => {
    const dia = validadeNaTela(l.validade)
    return [l.numero ?? 'Sem número', dia ? `val. ${dia}` : null].filter(Boolean).join(' · ')
  }).join(', ')
}

const COR_DO_MOVIMENTO: Record<TipoDoMovimento, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
  ENTRADA: 'green', CONSUMO: 'gray', VENDA: 'blue', PERDA: 'red', AJUSTE: 'amber', TRANSFERENCIA: 'blue',
}

/**
 * As movimentações do período (item 6 do escopo de 18/11, o Heitor: "ok"): a
 * data e a hora no fuso da UNIDADE do movimento, o produto, o tipo, a
 * quantidade (na unidade do movimento e em embalagens), o lote e a validade, a
 * unidade, quem fez e o custo. A página e o total vêm do banco: a tela não soma.
 */
function MovimentosDoEstoque({ m, comUnidade }: { m: DadosDosMovimentos; comUnidade: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ir = (pagina: number) => router.push(mesclarParams(searchParams, { pagina: pagina > 1 ? String(pagina) : null }))
  const inicio = m.total === 0 ? 0 : (m.pagina - 1) * MOVIMENTOS_POR_PAGINA + 1
  const fim = (m.pagina - 1) * MOVIMENTOS_POR_PAGINA + m.linhas.length
  const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const quantidade = (l: DadosDosMovimentos['linhas'][number]) => {
    const sinal = l.quantidade > 0 ? '+' : ''
    const principal = `${sinal}${num(l.quantidade)} ${medidaNoPlural(l.medida, Math.abs(l.quantidade))}`
    return l.medida && l.medida !== l.embalagem
      ? `${principal} (${sinal}${num(l.embalagens)} ${medidaNoPlural(l.embalagem, Math.abs(l.embalagens))})`
      : principal
  }
  const th = (align: 'left' | 'right' = 'left'): CSSProperties => ({
    padding: '8px 12px', textAlign: align,
    fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  })
  const td = (align: 'left' | 'right' = 'left'): CSSProperties => ({ padding: '10px 12px', textAlign: align, color: 'var(--text)' })

  return (
    <div data-movimentos-do-estoque style={{ gridColumn: '1 / -1' }}>
      <SCard title="Movimentações do período" rotuloDoSobre="O que esta lista mostra" sobre={
        <span>
          Cada entrada e saída do estoque no período, da mais recente para a mais antiga: a entrada, o consumo nos atendimentos, a venda e a
          devolução, a perda (com o motivo), o ajuste e a transferência. A quantidade está na unidade do movimento (e em embalagens, quando o
          produto conta em ml, UI…), o lote é o de onde saiu (ou o que a entrada criou) e o custo é o do movimento, ao custo do lote.
          A data e a hora são as do relógio da unidade.
        </span>
      }>
        {m.linhas.length === 0 ? (
          <EmptyMsg texto="Nenhuma movimentação no período." />
        ) : (
          <div className="table-wrap">
            {/* Oito colunas não cabem em 390px: no celular cada movimento vira um bloco de rótulo e valor. */}
            <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm-sz)' }}>
              <thead>
                <tr>
                  <th style={th()}>Data</th>
                  <th style={th()}>Produto</th>
                  <th style={th()}>Tipo</th>
                  <th style={th('right')}>Quantidade</th>
                  <th style={th()}>Lote</th>
                  {comUnidade && <th style={th()}>Unidade</th>}
                  <th style={th()}>Quem fez</th>
                  <th style={th('right')}>Custo</th>
                </tr>
              </thead>
              <tbody>
                {m.linhas.map((l, i) => (
                  <tr key={l.id} data-movimento={l.tipo}
                    style={{ borderBottom: i < m.linhas.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                    <td data-label="Data" data-par style={{ ...td(), whiteSpace: 'nowrap' }}>
                      {new Date(l.data).toLocaleString('pt-BR', { timeZone: l.fuso, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td data-label="" style={{ ...td(), fontWeight: 600, minWidth: 160 }}>{l.produto}</td>
                    <td data-label="Tipo" style={td()}>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                        <Badge label={l.rotulo} color={COR_DO_MOVIMENTO[l.tipo]} />
                        {l.desfeita && <span data-movimento-desfeito style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>desfeito</span>}
                      </span>
                    </td>
                    <td data-label="Quantidade" style={{ ...td('right'), whiteSpace: 'nowrap', fontWeight: 700 }}>{quantidade(l)}</td>
                    <td data-label="Lote" data-lote style={td()}>{(l.partes && textoDasPartes(l.partes, l.medida)) || textoDosLotes(l.lotes)}</td>
                    {comUnidade && <td data-label="Unidade" style={td()}>{l.unidade}</td>}
                    <td data-label="Quem fez" style={td()}>{l.quem ?? '—'}</td>
                    <td data-label="Custo" style={{ ...td('right'), whiteSpace: 'nowrap' }}>{fmtBRLFull(l.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {m.paginas > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap',
            marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)',
          }}>
            <span data-movimentos-pagina style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              {inicio}–{fim} de {m.total.toLocaleString('pt-BR')}
            </span>
            <button type="button" className="btn-ghost" disabled={m.pagina <= 1} onClick={() => ir(m.pagina - 1)}>Anterior</button>
            <button type="button" className="btn-ghost" disabled={m.pagina >= m.paginas} onClick={() => ir(m.pagina + 1)}>Próxima</button>
          </div>
        )}
      </SCard>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: COMERCIAL
// -----------------------------------------------------------------------------
function TabComercial(p: ReportsBiProps) {
  const c = p.comercial
  if (!c) return <SCard title={REPORT_TAB_LABELS.comercial}><EmptyMsg /></SCard>
  // A oportunidade é da rede (a cliente é da rede): com uma unidade escolhida, o
  // rótulo dos dois cartões que não seguem o recorte diz "(rede)".
  const daRede = p.selectedBranchId && (p.allBranches ?? p.branches).length > 1 ? ' (rede)' : ''

  const fmtInt = (n: number) => new Intl.NumberFormat('pt-BR').format(n)
  const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  // A barra mais cheia é a maior etapa, não o total: com o total, um funil de
  // topo largo deixava todas as outras etapas invisíveis.
  const maiorEtapa = Math.max(1, ...c.etapas.map(e => e.count))
  const maiorMotivo = Math.max(1, ...c.motivosDePerda.map(m => m.total))

  const colunas: TableColumn[] = [
    { key: 'name',         label: 'Vendedor' },
    { key: 'leads',        label: 'Oportunidades', align: 'right', width: 110, render: v => fmtInt(Number(v)) },
    { key: 'conversao',    label: 'Conv.',   align: 'right', width: 80,
      // A conta vem de lib/metrics (ganhas ÷ oportunidades do vendedor): a tela só formata.
      render: (_v, row) => row.conversaoPct !== '' && row.conversaoPct != null
        ? <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{fmtPct(Number(row.conversaoPct))}</span>
        : '—' },
    { key: 'agendamentos', label: 'Agend.',  align: 'right', width: 90, render: v => fmtInt(Number(v)) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <KpiCard label={`Conversão${daRede}`} value={c.conversao} format="pct" />
        <KpiCard label={`Oportunidades recebidas${daRede}`} value={c.totalLeads} format="int" accent="var(--text)" />
        <KpiCard label="Agendados pelo comercial" value={c.comerciaisAgendados} format="int" accent="var(--text)" />
        <KpiCard label="Comparecimento"           value={c.comparecimento} format="pct" accent="var(--text)" />
      </div>

      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', margin: 0 }}>
        {c.temGanho
          ? `${fmtInt(c.ganhos)} de ${fmtInt(c.totalLeads)} oportunidades ganhas, somando os funis`
          : 'Nenhum funil tem etapa de ganho: sem conversão'} ·
        {' '}{fmtInt(c.comerciaisRealizados)} de {fmtInt(c.comerciaisConsiderados)} agendamentos
        do comercial não cancelados aconteceram.
      </p>

      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Funil de oportunidades">
          {c.funis.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <FunnelSelect funnels={c.funis} activeId={c.funilAtivo} />
            </div>
          )}
          {c.etapas.length === 0 ? (
            <EmptyMsg texto="Nenhuma etapa configurada." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.etapas.map(e => (
                <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 120, fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                    {e.name}
                  </div>
                  <div style={{ flex: 1, height: 10, background: 'var(--track, var(--border))', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${(e.count / maiorEtapa) * 100}%`, height: '100%', background: 'var(--brand)', borderRadius: 99 }} />
                  </div>
                  <div style={{ width: 40, textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', fontVariant: 'tabular-nums' }}>
                    {fmtInt(e.count)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SCard>

        <SCard title="Ranking por vendedor">
          <SimpleTable
            columns={colunas}
            rows={c.ranking.map(r => ({ ...r, conversaoPct: r.conversaoPct ?? '' }))}
            emptyMsg="Nenhuma atividade comercial atribuída neste período."
          />
        </SCard>
      </div>

      {/* A20 da 7ª simulação: onde investir em anúncio — a conversão de cada origem. */}
      <SCard title="Conversão por origem">
        <div data-conversao-por-origem>
          <SimpleTable
            columns={[
              { key: 'origem',  label: 'Origem' },
              { key: 'leads',   label: 'Oportunidades', align: 'right', width: 110, render: v => fmtInt(Number(v)) },
              { key: 'ganhos',  label: 'Ganhas', align: 'right', width: 80, render: v => fmtInt(Number(v)) },
              { key: 'conversao', label: 'Conv.', align: 'right', width: 80,
                render: (_v, row) => row.conversaoPct !== '' && row.conversaoPct != null
                  ? <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{fmtPct(Number(row.conversaoPct))}</span>
                  : '—' },
            ]}
            rows={c.conversaoPorOrigem.map(o => ({ id: o.origem, ...o, conversaoPct: o.conversaoPct ?? '' }))}
            emptyMsg="Nenhuma oportunidade no período."
          />
        </div>
      </SCard>

      <SCard title="Motivos de perda">
        {c.motivosDePerda.length === 0 ? (
          <EmptyMsg texto="Nenhuma oportunidade perdida no período." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-motivos-de-perda>
            {c.motivosDePerda.map(m => (
              <div key={m.motivo} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 180, fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                  {m.motivo}
                </div>
                <div style={{ flex: 1, height: 10, background: 'var(--track, var(--border))', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(m.total / maiorMotivo) * 100}%`, height: '100%', background: 'var(--brand)', borderRadius: 99 }} />
                </div>
                <div style={{ width: 40, textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', fontVariant: 'tabular-nums' }}>
                  {fmtInt(m.total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </SCard>
    </div>
  )
}

function EmptyMsg({ texto = 'Sem dados no período.' }: { texto?: string }) {
  return <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-base-sz)', margin: 0 }}>{texto}</p>
}

// -----------------------------------------------------------------------------
// MAIN: ReportsBiView
// -----------------------------------------------------------------------------
export function ReportsBiView(props: ReportsBiProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tab } = props

  // Mescla em vez de montar do zero: antes, trocar de aba descartava o período
  // personalizado e vice-versa.
  // A página de uma lista (Vendas, as movimentações do Estoque) não passa de uma aba à outra.
  const switchTab = (t: Tab) => router.push(mesclarParams(searchParams, { tab: t, pagina: null }))
  // O recorte vai em `?unidade=<endereço>` (A57), como o resto da rede; o
  // `?branch=` antigo sai da URL.
  const switchBranch = (id: string) => {
    const unidade = (props.allBranches ?? props.branches).find(b => b.id === id)
    router.push(mesclarParams(searchParams, { unidade: unidade?.slug ?? (id || null), branch: null }))
  }

  // O filtro de Tags (só nas abas de pessoas): a tag escolhida que saiu do
  // vocabulário continua na lista, marcada, para dar para desmarcar — a tela
  // mostra o que vale na conta (princípio 3).
  const tagsEscolhidas = props.tagsEscolhidas ?? []
  const opcoesDeTag = [...(props.tagsDaRede ?? []), ...tagsEscolhidas.filter(t => !(props.tagsDaRede ?? []).includes(t))]
  const comFiltroDeTags = abaTemFiltroDeTags(tab) && opcoesDeTag.length > 0

  const activeSection = {
    overview:       <TabOverview      {...props} />,
    financeiro:     <TabFinanceiro    {...props} />,
    vendas:         <TabVendas        {...props} />,
    agenda:         <TabAgenda        {...props} />,
    clientes:       <TabClientes      {...props} />,
    procedimentos:  <TabProcedimentos {...props} />,
    profissionais:  <TabProfissionais {...props} />,
    estoque:        <TabEstoque       {...props} />,
    comercial:      <TabComercial     {...props} />,
  }[tab]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p data-escopo-dos-relatorios style={{
            fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--brand)',
            textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px',
          }}>
            ✦ {props.scopeLabel}
          </p>
          <h1 style={{
            fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)',
            margin: 0, letterSpacing: '-0.02em',
          }}>
            BI — Relatórios
          </h1>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {props.periodLabel}
          </p>
        </div>

        {/* Recorte: a rede inteira ou uma unidade. Fica ao lado do título
            porque muda o significado de todos os números abaixo. */}
        {props.showBranchFilter && (props.allBranches ?? props.branches).length > 1 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="overline">Recorte</span>
            <select
              className="filtro-select"
              style={{ minWidth: 160 }}
              value={props.selectedBranchId ?? ''}
              onChange={e => switchBranch(e.target.value)}
            >
              {props.allowNetwork !== false && <option value="">Rede inteira</option>}
              {(props.allBranches ?? props.branches).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Tab nav + seletor de período na mesma linha */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <SegSelect
          options={TABS.filter(t => props.abasPermitidas.includes(t.key))}
          value={tab}
          onSelect={(k) => switchTab(k as Tab)}
          ariaLabel="Seção do relatório"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* O filtro de Tags compartilhado (o do Financeiro): o mesmo gatilho e a
              mesma dica; trocar a tag volta à primeira página da lista. */}
          {comFiltroDeTags && (
            <FiltroDeTags
              tagsDaRede={props.tagsDaRede ?? []}
              escolhidas={tagsEscolhidas}
              limpar={['pagina']}
              sobre={'A tag filtra pessoas: entra no relatório só o que é de uma cliente com TODAS as tags marcadas '
                + '(maiúscula ou minúscula, tanto faz). O que não tem cliente sai enquanto houver tag marcada. Na aba Comercial vale a tag da pessoa da oportunidade '
                + '(a cliente; sem ela, o contato); nos atendimentos comerciais, a da cliente. A equipe (Profissionais ativos) não muda. Na Visão geral '
                + 'e no Financeiro, a despesa, a compra de estoque e as perdas não são de uma cliente: saem, e o lucro e o DRE são só das clientes marcadas. '
                + 'O Estoque não tem este filtro.'}
            />
          )}
          <PeriodSelector
            current={props.period}
            fromDate={props.customFrom}
            toDate={props.customTo}
          />
        </div>
      </div>

      {/* Active section */}
      {activeSection}
    </div>
  )
}
