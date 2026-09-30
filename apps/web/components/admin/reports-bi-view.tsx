'use client'

import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { mesclarParams } from '@/lib/query-params'
import { EvolutionChart, type ChartPoint } from './evolution-chart'
import { PeriodSelector, type Period } from './period-selector'
import { SegSelect } from '@/components/shared/seg-select'
import { FunnelSelect } from '@/components/shared/funnel-select'
import type { LinhaLote, LinhaParcela } from './reports-linhas'
import type { Relatorio } from '@/lib/metrics/relatorio'
import type { MetricsCore } from '@/lib/metrics'
import {
  HBarChart, WeekBarChart, DonutChart, MiniAreaChart,
  DreWaterfall, SimpleTable, Badge,
  CHART_COLORS, fmtBRLShort, fmtBRLFull,
  type TableColumn,
} from './reports-charts'

// -- Types ---------------------------------------------------------------------
type Tab = 'overview' | 'financeiro' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque' | 'comercial'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',       label: 'Visão Geral'    },
  { key: 'financeiro',     label: 'Financeiro'     },
  { key: 'agenda',         label: 'Agenda'         },
  { key: 'clientes',       label: 'Clientes'       },
  { key: 'procedimentos',  label: 'Procedimentos'  },
  { key: 'profissionais',  label: 'Profissionais'  },
  { key: 'estoque',        label: 'Estoque'        },
  // Era a tela /admin/comercial, com entrada própria no menu. O assunto é
  // relatório — funil, conversão e ranking — e o módulo que a governa já era
  // `reports`, então virou aba em vez de destino separado.
  { key: 'comercial',      label: 'Comercial'      },
]

/** Painel comercial, calculado no servidor (ver `painelComercial`). */
export interface DadosComerciais {
  funis:      { id: string; name: string }[]
  funilAtivo: string
  etapas:     { name: string; count: number }[]
  totalLeads:  number
  convertidos: number
  conversao:   number
  comerciaisAgendados:    number
  comerciaisConsiderados: number
  comerciaisRealizados:   number
  comparecimento:         number
  ranking: { id: string; name: string; leads: number; convertidos: number; agendamentos: number }[]
}

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
  /** Vê a comissão da equipe (financeiro com escopo de todos). Sem, a aba Profissionais não a mostra. */
  verComissoes: boolean
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
  /** Só vem preenchido quando a aba Comercial está aberta. */
  comercial?: DadosComerciais
}

// -- Animated number -----------------------------------------------------------
function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0)
  const frameRef = useRef<number>(0)
  useEffect(() => {
    // Sem `setVal(0)` aqui: o primeiro quadro já parte de ~0 (t≈0).
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(target * eased)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration])
  return val
}

function AnimatedNum({ value, format = 'brl' }: {
  value: number
  format?: 'brl' | 'brl-short' | 'int' | 'pct'
}) {
  const n = useCountUp(value)
  if (format === 'brl')       return <>{n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</>
  if (format === 'brl-short') return <>{fmtBRLShort(n)}</>
  if (format === 'pct')       return <>{n.toFixed(1).replace('.', ',')}%</>
  return <>{Math.round(n).toLocaleString('pt-BR')}</>
}

// -- KPI card ------------------------------------------------------------------
function KpiCard({
  label, value, format = 'brl', delta, accent, showDelta = false, deltaUnit = '%', hero = false,
}: {
  label: string
  value: number
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
}) {
  const hasDelta = delta != null
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
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 'var(--text-name)', fontWeight: 800,
        color: hero ? 'var(--on-brand)' : accent ?? 'var(--brand)',
        margin: 0, letterSpacing: '-0.02em',
      }}>
        <AnimatedNum value={value} format={format} />
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
      ) : null}
    </div>
  )
}

// -- Section card --------------------------------------------------------------
function SCard({
  title, children, style,
}: {
  title: string
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
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

// -- Delta helper --------------------------------------------------------------
function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
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
  COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não Compareceu',
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', IN_PROGRESS: 'Em Andamento',
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

  const revenue      = core.revenueCash
  const prevRevenue  = corePrev.revenueCash
  // Despesa simétrica à receita: só o que foi pago. Antes a receita exigia
  // is_paid e a despesa não, então uma conta com vencimento futuro derrubava
  // o lucro do mês corrente — e esta tela discordava de /admin/financeiro.
  const expenses     = core.expensesCash
  const prevExpenses = corePrev.expensesCash
  const profit       = revenue - expenses
  const prevProfit   = prevRevenue - prevExpenses
  // Ticket médio canônico (§13.1): receita dos atendimentos ÷ atendimentos
  // concluídos, os dois do núcleo.
  const avgTicket    = core.appointmentsCompleted > 0 ? core.serviceRevenue / core.appointmentsCompleted : 0

  const byBranch = r.receitaPorUnidade
    .map(u => ({ name: nomeDaUnidade(u.branchId), value: u.atual }))
    .sort(porValor)
  const byPayment = r.receitaPorForma.map(f => ({ name: PAY_LABELS[f.forma] ?? f.forma, value: f.valor }))
  const topProcs = r.porProcedimento
    .map(x => ({ name: x.nome, value: x.receita })).sort(porValor).slice(0, 5)
  const topProfs = r.porProfissional
    .map(x => ({ name: x.nome, value: x.receita })).sort(porValor).slice(0, 5)
  const byStatus = r.agendamentosPorStatus.map(x => ({ name: STATUS_LABELS[x.status] ?? x.status, value: x.n }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Faturamento"    value={revenue}           format="brl" delta={pctDelta(revenue, prevRevenue)}           showDelta hero />
        <KpiCard label="Despesas"       value={expenses}          format="brl" accent="var(--danger)" delta={pctDelta(expenses, prevExpenses)}   showDelta />
        <KpiCard label="Lucro"          value={profit}            format="brl" accent={profit >= 0 ? 'var(--success)' : 'var(--danger)'} delta={pctDelta(profit, prevProfit)}     showDelta />
        <KpiCard label="Atendimentos"   value={core.appointmentsCompleted} format="int" delta={pctDelta(core.appointmentsCompleted, corePrev.appointmentsCompleted)} showDelta />
        <KpiCard label="Novos Clientes" value={core.newClients}            format="int" delta={pctDelta(core.newClients, corePrev.newClients)}                       showDelta />
        {/* Sem delta: a receita de serviço do período anterior não é carregada,
            e comparar com o caixa anterior daria uma variação de outra métrica. */}
        <KpiCard label="Ticket Médio"   value={avgTicket}         format="brl" />
      </div>
      {/* Charts grid */}
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Evolução do Período" style={{ gridColumn: '1 / -1' }}>
          <EvolutionChart data={evolutionData} monthLabel={p.periodLabel} granularity={granularity} />
        </SCard>
        <SCard title="Faturamento por Unidade">
          <HBarChart data={byBranch} />
        </SCard>
        <SCard title="Top 5 Procedimentos por Receita">
          <HBarChart data={topProcs} />
        </SCard>
        <SCard title="Top 5 Profissionais por Receita">
          <HBarChart data={topProfs} color={CHART_COLORS[1]} />
        </SCard>
        <SCard title="Forma de Pagamento">
          <DonutChart data={byPayment} />
        </SCard>
        <SCard title="Status dos Agendamentos">
          <DonutChart data={byStatus} colors={[CHART_COLORS[3]!, CHART_COLORS[4]!, 'var(--danger)', CHART_COLORS[2]!, CHART_COLORS[0]!, CHART_COLORS[5]!]} />
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
  const nomeDaUnidade = nomesDasUnidades(branches)

  const revenue     = core.revenueCash
  const prevRevenue = corePrev.revenueCash
  // Consumo de insumos é indicador gerencial, exibido à parte. NÃO entra no
  // resultado: a compra do insumo já foi lançada como despesa (categoria
  // "Estoque"), e somar o consumo de novo contava o mesmo custo duas vezes.
  // Ao custo do MOVIMENTO — a mesma conta do giro do dashboard.
  const stockCOGS   = r.consumoTotal
  const opEx        = core.expensesCash
  const prevOpEx    = corePrev.expensesCash
  const profit      = revenue - opEx
  const prevProfit  = prevRevenue - prevOpEx
  const margin      = revenue > 0 ? (profit / revenue) * 100 : 0
  const prevMargin  = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0
  // Margem é percentual: a variação se mede em pontos percentuais, não em
  // "percentual de percentual" (20% → 22% não é "+10%", é "+2,0 p.p.").
  const marginDeltaPp = margin - prevMargin

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
    { key: 'what',      label: 'Parcela'    },
    { key: 'value',     label: 'Valor',      align: 'right',  render: (v) => fmtBRLFull(Number(v)) },
    { key: 'due',       label: 'Vencimento', align: 'center' },
    { key: 'branch',    label: 'Filial'      },
    {
      key: 'daysLeft', label: 'Dias', align: 'center',
      render: (v) => (
        <Badge label={`${v}d`} color={Number(v) <= 3 ? 'red' : Number(v) <= 7 ? 'amber' : 'gray'} />
      ),
    },
  ]
  const today = new Date()
  const installRows = installments.map(i => ({
    client:   i.clients?.name ?? '—',
    what:     i.description,
    value:    Number(i.amount),
    due:      new Date(i.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    branch:   branches.find(b => b.id === i.branch_id)?.name ?? '—',
    daysLeft: Math.max(0, Math.ceil((new Date(i.due_date).getTime() - today.getTime()) / 86_400_000)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Receita Bruta"   value={revenue}   format="brl" delta={pctDelta(revenue, prevRevenue)}   showDelta hero />
        <KpiCard label="Consumo de insumos" value={stockCOGS} format="brl" accent="var(--danger)" />
        <KpiCard label="Despesas Op."    value={opEx}      format="brl" accent="var(--warning)"  delta={pctDelta(opEx, prevOpEx)}     showDelta />
        <KpiCard label="Lucro"           value={profit}    format="brl" accent={profit >= 0 ? 'var(--success)' : 'var(--danger)'} delta={pctDelta(profit, prevProfit)}   showDelta />
        <KpiCard label="Margem"          value={margin}    format="pct" accent={margin >= 20 ? 'var(--success)' : margin >= 0 ? 'var(--warning)' : 'var(--danger)'} delta={prevRevenue > 0 ? marginDeltaPp : null} showDelta deltaUnit="p.p." />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="DRE Simplificado" style={{ gridColumn: '1 / -1' }}>
          {/* O consumo de insumos não entra no DRE: já está dentro das
              despesas, na categoria "Estoque", pela compra. */}
          <DreWaterfall receita={revenue} custoProdutos={0} despesas={opEx} lucro={profit} />
        </SCard>
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
        <SCard title="Faturamento por Unidade — Período Atual">
          <HBarChart data={branchCompareCurr} />
        </SCard>
        <SCard title="Faturamento por Unidade — Período Anterior">
          <HBarChart data={branchComparePrev} color={CHART_COLORS[5]} />
        </SCard>
        <SCard title="Parcelas Pendentes" style={{ gridColumn: '1 / -1' }}>
          <SimpleTable
            columns={installCols}
            rows={installRows}
            emptyMsg="Sem parcelas pendentes."
          />
        </SCard>
      </div>
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
  const rate       = total > 0 ? (completed / total) * 100 : 0

  const byStatus = [
    { name: 'Concluído',      value: completed },
    { name: 'Cancelado',      value: cancelled },
    { name: 'Não Compareceu', value: noShow    },
    { name: 'Outros',         value: Math.max(0, total - completed - cancelled - noShow) },
  ]

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
      render: (v) => (
        <Badge label={`${Number(v).toFixed(1).replace('.', ',')}%`} color={Number(v) >= 70 ? 'green' : Number(v) >= 50 ? 'amber' : 'red'} />
      ),
    },
  ]
  const branchRows = r.agendaPorUnidade.map(u => ({
    name:      nomeDaUnidade(u.branchId),
    completed: u.concluidos,
    cancelled: u.cancelados,
    noShow:    u.faltas,
    rate:      u.total > 0 ? (u.concluidos / u.total) * 100 : 0,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Total Agendamentos" value={total}     format="int" />
        <KpiCard label="Realizados"         value={completed} format="int" delta={pctDelta(completed, corePrev.appointmentsCompleted)} showDelta />
        <KpiCard label="Cancelados"         value={cancelled} format="int" accent="var(--warning)" />
        <KpiCard label="Não Compareceu"     value={noShow}    format="int" accent="var(--danger)" />
        <KpiCard label="Taxa de Conclusão"  value={rate}      format="pct" accent={rate >= 70 ? 'var(--success)' : 'var(--warning)'} />
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
        <SCard title="Comparativo por Unidade">
          <SimpleTable columns={branchCols} rows={branchRows} />
        </SCard>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: CLIENTES
// -----------------------------------------------------------------------------
function TabClientes(p: ReportsBiProps) {
  const { relatorio: r, core, corePrev, retention, newClientsSeries } = p
  const c = r.clientes

  const totalAtivos = c.totalAtivos
  // Novos clientes do núcleo — a mesma regra do dashboard (a unidade e os
  // cadastros da rede, sem unidade). Aqui contava só os com unidade.
  const novos       = core.newClients

  // Retenção vem do banco: clientes atendidos no período que JÁ tinham sido
  // atendidos antes dele. O cálculo anterior — "2+ atendimentos dentro da
  // janela" — media recorrência, não retenção, e em janelas curtas dava zero
  // por construção.
  const { clientsServed, returningClients, firstTimeClients } = retention
  const taxaRetencao = clientsServed > 0 ? (returningClients / clientsServed) * 100 : 0

  // Gasto médio por cliente que pagou algo no período, do mesmo conjunto de
  // receita do KPI (pago, sem estorno, eixo em paid_at).
  const gastoMedio = c.gastoMedio

  // Série de aquisição agregada no banco, dentro da janela e no fuso do
  // negócio.
  const acquisitionData = newClientsSeries.map(pt => ({
    label: new Date(pt.bucket).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
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
        <KpiCard label="Novos no Período" value={novos}        format="int" delta={pctDelta(novos, corePrev.newClients)} showDelta />
        <KpiCard label="Atendidos no Período" value={clientsServed}    format="int" accent={CHART_COLORS[1]} />
        <KpiCard label="Primeira Vez"         value={firstTimeClients} format="int" accent={CHART_COLORS[2]} />
        <KpiCard label="Taxa de Retenção"     value={taxaRetencao}     format="pct" accent={taxaRetencao >= 40 ? 'var(--success)' : 'var(--warning)'} />
        <KpiCard label="Gasto Médio"      value={gastoMedio}   format="brl" />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Novos Clientes ao Longo do Tempo" style={{ gridColumn: '1 / -1' }}>
          <MiniAreaChart data={acquisitionData} height={160} />
        </SCard>
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
function TabProcedimentos(p: ReportsBiProps) {
  const { relatorio: r, core, corePrev } = p
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

  // Totais do NÚCLEO: atendimentos concluídos e a receita deles — o mesmo
  // ticket médio do sistema inteiro (§13.1). Os rankings abaixo são por
  // procedimento.
  const totalExec   = core.appointmentsCompleted
  const totalRev    = core.serviceRevenue
  const avgTicket   = totalExec > 0 ? totalRev / totalExec : 0
  const topByName   = [...r.porProcedimento].sort((a, b) => b.receita - a.receita)
  const topRevenue  = topByName.slice(0, 10).map(d => ({ name: d.nome, value: d.receita }))
  const topVolume   = [...r.porProcedimento]
    .sort((a, b) => b.execucoes - a.execucoes).slice(0, 10)
    .map(d => ({ name: d.nome, value: d.execucoes }))
  const maisRealizado = topVolume[0]?.name ?? '—'

  // Receita por categoria, somada no banco (nenhuma tela soma dinheiro).
  const byCategory = r.receitaPorCategoriaDeProcedimento.map(c => ({ name: c.categoria, value: c.receita }))

  const tableCols: TableColumn[] = [
    { key: 'name',     label: 'Procedimento'  },
    { key: 'category', label: 'Categoria'     },
    { key: 'count',    label: 'Execuções',    align: 'center' },
    { key: 'revenue',  label: 'Receita Total', align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    { key: 'ticket',   label: 'Ticket Médio',  align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    { key: 'pct',      label: '% do Total',    align: 'center', render: (v) => `${v}%` },
  ]
  const tableRows = topByName.slice(0, 20).map(d => ({
    name:     d.nome,
    category: d.categoria,
    count:    d.execucoes,
    revenue:  d.receita,
    ticket:   d.execucoes > 0 ? d.receita / d.execucoes : 0,
    pct:      totalRev > 0 ? ((d.receita / totalRev) * 100).toFixed(1) : '0.0',
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* Só "Total Execuções" tem delta: é a única grandeza cujo período
            anterior é medido do mesmo jeito (atendimentos concluídos). Receita
            e ticket aqui vêm de appointments.price, e o comparativo disponível
            do período anterior é de caixa — comparar os dois media outra coisa. */}
        <KpiCard label="Total Execuções" value={totalExec} format="int" delta={pctDelta(totalExec, corePrev.appointmentsCompleted)} showDelta />
        <KpiCard label="Receita Total"   value={totalRev}  format="brl" />
        <KpiCard label="Ticket Médio"    value={avgTicket} format="brl" />
        <div className="card" style={{ padding: '16px 20px', flex: '1 1 160px' }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
            Mais Realizado
          </p>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--brand)', margin: 0, lineHeight: 1.3 }}>
            {maisRealizado}
          </p>
        </div>
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Top 10 por Receita">
          <HBarChart data={topRevenue} />
        </SCard>
        <SCard title="Top 10 por Volume">
          <HBarChart data={topVolume} color={CHART_COLORS[1]} formatValue={(v) => String(v)} />
        </SCard>
        <SCard title="Distribuição por Categoria">
          <DonutChart data={byCategory} />
        </SCard>
        <SCard title="Receita por Categoria">
          <HBarChart
            data={byCategory.sort((a, b) => b.value - a.value)}
            color={CHART_COLORS[2]}
          />
        </SCard>
        <SCard title="Top 3 por Faixa de Idade — Volume">
          <AgeRankCard data={topByAgeVolume} />
        </SCard>
        <SCard title="Top 3 por Faixa de Idade — Margem">
          {!faixas.temCustos
            ? <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', margin: 0 }}>
                Configure o custo dos insumos em Procedimentos para visualizar a margem por faixa etária.
              </p>
            : <AgeRankCard data={topByAgeMargin} />
          }
        </SCard>
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

  const profissionais = r.porProfissional.length
  const totalAppts    = core.appointmentsCompleted
  // Comissões do núcleo: o período é o do LANÇAMENTO (released_at).
  const commOpen      = core.commissionsOpen
  const commPaid      = core.commissionsPaid

  const byRevenue = r.porProfissional.map(x => ({ name: x.nome, value: x.receita })).sort(porValor)
  const byCount   = r.porProfissional.map(x => ({ name: x.nome, value: x.atendimentos })).sort(porValor)

  const commCols: TableColumn[] = [
    { key: 'name',    label: 'Profissional'   },
    { key: 'appts',   label: 'Atendimentos',   align: 'center' },
    { key: 'revenue', label: 'Receita Gerada', align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    { key: 'open',    label: 'Comissão Aberta', align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    { key: 'paid',    label: 'Comissão Paga',   align: 'right', render: (v) => fmtBRLFull(Number(v)) },
    {
      key: 'status', label: 'Status', align: 'center',
      render: (v) => <Badge label={String(v)} color={v === 'OK' ? 'green' : 'amber'} />,
    },
  ]
  const producao  = new Map(r.porProfissional.map(x => [x.nome, x]))
  const comissoes = new Map(r.comissoesPorProfissional.map(x => [x.nome, x]))
  const commRows = [...new Set([...producao.keys(), ...comissoes.keys()])].map(name => {
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
        <SCard title="Receita Gerada por Profissional">
          <HBarChart data={byRevenue} />
        </SCard>
        <SCard title="Atendimentos por Profissional">
          <HBarChart data={byCount} color={CHART_COLORS[1]} formatValue={(v) => String(v)} />
        </SCard>
        {verComissoes && (
          <SCard title="Comissões por Profissional" style={{ gridColumn: '1 / -1' }}>
            <SimpleTable columns={commCols} rows={commRows} />
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
  const e = r.estoque
  const nomeDaUnidade = nomesDasUnidades(branches)

  const totalStockValue = e.valorEmEstoque
  // Consumo ao custo do MOVIMENTO, a mesma conta do giro do dashboard.
  const consumoValue    = r.consumoTotal
  const giro            = totalStockValue > 0 ? (consumoValue / totalStockValue) * 100 : 0
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
      render: (v) => <Badge label={`${v}d`} color={Number(v) <= 7 ? 'red' : Number(v) <= 15 ? 'amber' : 'gray'} />,
    },
  ]
  const batchRows = productBatches.map(b => ({
    product: b.products?.name ?? '—',
    batch:   b.batch_number ?? '—',
    expires: new Date(b.expires_at).toLocaleDateString('pt-BR'),
    qty:     Number(b.quantity),
    days:    Math.max(0, Math.ceil((new Date(b.expires_at).getTime() - today.getTime()) / 86_400_000)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Valor em Estoque" value={totalStockValue} format="brl" />
        <KpiCard label="Consumo no Período" value={consumoValue} format="brl" accent="var(--warning)" />
        <KpiCard label="Giro (%)" value={giro} format="pct" accent={giro >= 50 ? 'var(--success)' : 'var(--warning)'} />
        <KpiCard label="Itens Críticos" value={criticos} format="int" accent="var(--warning)" />
        <KpiCard label="Itens Zerados"  value={zerados}  format="int" accent="var(--danger)" />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Top 10 Produtos Mais Consumidos (custo)">
          <HBarChart data={topConsumed} color="var(--warning)" />
        </SCard>
        <SCard title="Valor em Estoque por Categoria">
          <DonutChart data={byCategory} />
        </SCard>
        <SCard title="Saúde do Estoque por Unidade" style={{ gridColumn: '1 / -1' }}>
          <SimpleTable columns={branchHealthCols} rows={branchHealthRows} />
        </SCard>
        {batchRows.length > 0 && (
          <SCard title="Validades Próximas (≤ 30 dias)" style={{ gridColumn: '1 / -1' }}>
            <SimpleTable columns={batchCols} rows={batchRows} emptyMsg="Sem lotes vencendo em breve." />
          </SCard>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: COMERCIAL
// -----------------------------------------------------------------------------
function TabComercial(p: ReportsBiProps) {
  const c = p.comercial
  if (!c) return <SCard title="Comercial"><EmptyMsg /></SCard>

  const fmtInt = (n: number) => new Intl.NumberFormat('pt-BR').format(n)
  const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  // A barra mais cheia é a maior etapa, não o total: com o total, um funil de
  // topo largo deixava todas as outras etapas invisíveis.
  const maiorEtapa = Math.max(1, ...c.etapas.map(e => e.count))

  const colunas: TableColumn[] = [
    { key: 'name',         label: 'Vendedor' },
    { key: 'leads',        label: 'Leads',   align: 'right', width: 80, render: v => fmtInt(Number(v)) },
    { key: 'conversao',    label: 'Conv.',   align: 'right', width: 80,
      render: (_v, row) => Number(row.leads) > 0
        ? <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{fmtPct((Number(row.convertidos) / Number(row.leads)) * 100)}</span>
        : '—' },
    { key: 'agendamentos', label: 'Agend.',  align: 'right', width: 90, render: v => fmtInt(Number(v)) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <KpiCard label="Conversão de leads"    value={c.conversao} format="pct" />
        <KpiCard label="Leads recebidos"       value={c.totalLeads} format="int" accent="var(--text)" />
        <KpiCard label="Agendados pelo comercial" value={c.comerciaisAgendados} format="int" accent="var(--text)" />
        <KpiCard label="Comparecimento"           value={c.comparecimento} format="pct" accent="var(--text)" />
      </div>

      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', margin: 0 }}>
        {fmtInt(c.convertidos)} de {fmtInt(c.totalLeads)} leads viraram cliente ·
        {' '}{fmtInt(c.comerciaisRealizados)} de {fmtInt(c.comerciaisConsiderados)} agendamentos
        do comercial não cancelados aconteceram.
      </p>

      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Funil de leads">
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
            rows={c.ranking}
            emptyMsg="Nenhuma atividade comercial atribuída neste período."
          />
        </SCard>
      </div>
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
  const switchTab = (t: Tab) => router.push(mesclarParams(searchParams, { tab: t }))
  const switchBranch = (id: string) =>
    router.push(mesclarParams(searchParams, { branch: id || null }))

  const activeSection = {
    overview:       <TabOverview      {...props} />,
    financeiro:     <TabFinanceiro    {...props} />,
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
          <p style={{
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
        <PeriodSelector
          current={props.period}
          fromDate={props.customFrom}
          toDate={props.customTo}
        />
      </div>

      {/* Active section */}
      {activeSection}
    </div>
  )
}
