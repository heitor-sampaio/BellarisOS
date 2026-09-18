'use client'

import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { mesclarParams } from '@/lib/query-params'
import { EvolutionChart, type ChartPoint } from './evolution-chart'
import { PeriodSelector, type Period } from './period-selector'
import { SegSelect } from '@/components/shared/seg-select'
import { FunnelSelect } from '@/components/shared/funnel-select'
import { weekdayTZ } from '@/lib/datetime'
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
  evalAgendadas:    number
  evalConsideradas: number
  evalRealizadas:   number
  comparecimento:   number
  agendamentosComerciais: number
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
  period: Period
  periodLabel: string
  customFrom?: string
  customTo?: string
  granularity: 'hour' | 'day'
  branches: { id: string; name: string; slug: string }[]
  txsCurr: any[]
  txsPrev: any[]
  installments: any[]
  apptsCurr: any[]
  apptsPrevCount: number
  allAppts: any[]
  clientsCurr: any[]
  clientsPrevCount: number
  clientsAll: any[]
  commissions: any[]
  stockMoves: any[]
  bps: any[]
  productBatches: any[]
  procedureCosts: any[]
  retention: { clientsServed: number; returningClients: number; firstTimeClients: number }
  newClientsSeries: { bucket: string; count: number }[]
  evolutionData: ChartPoint[]
  /** Só vem preenchido quando a aba Comercial está aberta. */
  comercial?: DadosComerciais
}

// -- Animated number -----------------------------------------------------------
function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0)
  const frameRef = useRef<number>(0)
  useEffect(() => {
    setVal(0)
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
  label, value, format = 'brl', delta, accent, showDelta = false, deltaUnit = '%',
}: {
  label: string
  value: number
  format?: 'brl' | 'brl-short' | 'int' | 'pct'
  delta?: number | null
  accent?: string
  showDelta?: boolean
  /** Unidade da variação. Métricas que já são percentuais variam em "p.p.". */
  deltaUnit?: '%' | 'p.p.'
}) {
  const hasDelta = delta != null
  return (
    <div className="card" style={{ padding: '16px 20px', flex: '1 1 160px' }}>
      <p style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px',
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 22, fontWeight: 800,
        color: accent ?? 'var(--brand)',
        margin: 0, letterSpacing: '-0.02em',
      }}>
        <AnimatedNum value={value} format={format} />
      </p>
      {hasDelta ? (
        <p style={{
          fontSize: 11, margin: '4px 0 0',
          color: delta! >= 0 ? 'var(--success)' : '#dc2626',
          fontWeight: 600,
        }}>
          {delta! >= 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1).replace('.', ',')}{deltaUnit} vs anterior
        </p>
      ) : showDelta ? (
        <p style={{ fontSize: 11, margin: '4px 0 0', color: 'var(--text-faint)', fontWeight: 500 }}>
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
        <span style={{ color: 'var(--brand)', fontSize: 11 }}>✦</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
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

/**
 * Somas de caixa, com a mesma regra usada nas funções de métrica do banco:
 * só transações pagas, e o par estorno/estornada fora dos dois lados — antes
 * a receita original continuava contando E a contra-transação entrava como
 * despesa, então um estorno impactava o resultado duas vezes.
 */
type MoneyRow = { type: string; amount: number | string; is_paid?: boolean; category?: string | null; notes?: string | null }

const isReversal = (t: MoneyRow) => t.notes === 'Estornada' || t.category === 'Estorno'

export function sumRevenue(rows: MoneyRow[]): number {
  return rows
    .filter(t => t.type === 'INCOME' && t.is_paid && !isReversal(t))
    .reduce((s, t) => s + Number(t.amount), 0)
}

export function sumExpenses(rows: MoneyRow[]): number {
  return rows
    .filter(t => t.type === 'EXPENSE' && t.is_paid && !isReversal(t))
    .reduce((s, t) => s + Number(t.amount), 0)
}

const SRC_LABELS: Record<string, string> = {
  INTERNAL: 'Interno', ONLINE: 'Online', CLIENT_APP: 'App do Cliente', COMMERCIAL: 'Comercial',
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não Compareceu',
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', IN_PROGRESS: 'Em Andamento',
}

// -----------------------------------------------------------------------------
// TAB: VISÃO GERAL
// -----------------------------------------------------------------------------
function TabOverview(p: ReportsBiProps) {
  const { txsCurr, txsPrev, apptsCurr, apptsPrevCount, clientsCurr, clientsPrevCount,
    allAppts, branches, evolutionData, granularity } = p

  const revenue      = sumRevenue(txsCurr)
  const prevRevenue  = sumRevenue(txsPrev)
  // Despesa simétrica à receita: só o que foi pago. Antes a receita exigia
  // is_paid e a despesa não, então uma conta com vencimento futuro derrubava
  // o lucro do mês corrente — e esta tela discordava de /admin/financeiro.
  const expenses     = sumExpenses(txsCurr)
  const prevExpenses = sumExpenses(txsPrev)
  const profit       = revenue - expenses
  const prevProfit   = prevRevenue - prevExpenses
  // Ticket médio: receita dos ATENDIMENTOS ÷ atendimentos. Antes era o caixa
  // do período (que inclui venda de produto e pacote) sobre a contagem da
  // agenda — dois conjuntos diferentes, e a conta não fechava na mão.
  const serviceRevenue = apptsCurr.reduce((s, a) => s + Number(a.price ?? 0), 0)
  const avgTicket      = apptsCurr.length > 0 ? serviceRevenue / apptsCurr.length : 0


  const byBranch = branches
    .map(b => ({
      name: b.name,
      value: txsCurr
        .filter(t => t.branch_id === b.id && t.type === 'INCOME' && t.is_paid)
        .reduce((s, t) => s + Number(t.amount), 0),
    }))
    .sort((a, b) => b.value - a.value)

  const payMap: Record<string, number> = {}
  txsCurr.filter(t => t.type === 'INCOME' && t.is_paid && t.payment_method).forEach(t => {
    const k = PAY_LABELS[t.payment_method] ?? t.payment_method
    payMap[k] = (payMap[k] ?? 0) + Number(t.amount)
  })
  const byPayment = Object.entries(payMap).map(([name, value]) => ({ name, value }))

  const procMap: Record<string, number> = {}
  apptsCurr.filter(a => a.procedures?.name).forEach(a => {
    const k = a.procedures.name
    procMap[k] = (procMap[k] ?? 0) + Number(a.price)
  })
  const topProcs = Object.entries(procMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 5)

  const profMap: Record<string, number> = {}
  apptsCurr.filter(a => a.users?.name).forEach(a => {
    const k = a.users.name
    profMap[k] = (profMap[k] ?? 0) + Number(a.price)
  })
  const topProfs = Object.entries(profMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 5)

  const statusMap: Record<string, number> = {}
  allAppts.forEach(a => {
    const k = STATUS_LABELS[a.status] ?? a.status
    statusMap[k] = (statusMap[k] ?? 0) + 1
  })
  const byStatus = Object.entries(statusMap).map(([name, value]) => ({ name, value }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Faturamento"    value={revenue}           format="brl" delta={pctDelta(revenue, prevRevenue)}           showDelta />
        <KpiCard label="Despesas"       value={expenses}          format="brl" accent="#dc2626" delta={pctDelta(expenses, prevExpenses)}   showDelta />
        <KpiCard label="Lucro"          value={profit}            format="brl" accent={profit >= 0 ? '#16a34a' : '#dc2626'} delta={pctDelta(profit, prevProfit)}     showDelta />
        <KpiCard label="Atendimentos"   value={apptsCurr.length}  format="int" delta={pctDelta(apptsCurr.length, apptsPrevCount)}         showDelta />
        <KpiCard label="Novos Clientes" value={clientsCurr.length} format="int" delta={pctDelta(clientsCurr.length, clientsPrevCount)}    showDelta />
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
          <DonutChart data={byStatus} colors={[CHART_COLORS[3]!, CHART_COLORS[4]!, '#dc2626', CHART_COLORS[2]!, CHART_COLORS[0]!, CHART_COLORS[5]!]} />
        </SCard>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: FINANCEIRO
// -----------------------------------------------------------------------------
function TabFinanceiro(p: ReportsBiProps) {
  const { txsCurr, txsPrev, stockMoves, branches, installments } = p

  const revenue     = sumRevenue(txsCurr)
  const prevRevenue = sumRevenue(txsPrev)
  // Consumo de insumos é indicador gerencial, exibido à parte. NÃO entra no
  // resultado: a compra do insumo já foi lançada como despesa (categoria
  // "Estoque"), e somar o consumo de novo contava o mesmo custo duas vezes.
  const stockCOGS   = stockMoves.reduce(
    (s, m) => s + Math.abs(Number(m.quantity)) * Number(m.unit_cost ?? m.products?.cost_price ?? 0), 0)
  const opEx        = sumExpenses(txsCurr)
  const prevOpEx    = sumExpenses(txsPrev)
  const profit      = revenue - opEx
  const prevProfit  = prevRevenue - prevOpEx
  const margin      = revenue > 0 ? (profit / revenue) * 100 : 0
  const prevMargin  = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0
  // Margem é percentual: a variação se mede em pontos percentuais, não em
  // "percentual de percentual" (20% → 22% não é "+10%", é "+2,0 p.p.").
  const marginDeltaPp = margin - prevMargin

  const payMap: Record<string, number> = {}
  txsCurr.filter(t => t.type === 'INCOME' && t.is_paid && t.payment_method).forEach(t => {
    const k = PAY_LABELS[t.payment_method] ?? t.payment_method
    payMap[k] = (payMap[k] ?? 0) + Number(t.amount)
  })

  const catMap: Record<string, number> = {}
  txsCurr.filter(t => t.type === 'INCOME' && t.is_paid && t.category).forEach(t => {
    catMap[t.category] = (catMap[t.category] ?? 0) + Number(t.amount)
  })

  const branchMap: Record<string, { curr: number; prev: number }> = {}
  branches.forEach(b => { branchMap[b.id] = { curr: 0, prev: 0 } })
  txsCurr.filter(t => t.type === 'INCOME' && t.is_paid).forEach(t => {
    const bm = branchMap[t.branch_id]; if (bm) bm.curr += Number(t.amount)
  })
  txsPrev.filter(t => t.type === 'INCOME' && t.is_paid).forEach(t => {
    const bm = branchMap[t.branch_id]; if (bm) bm.prev += Number(t.amount)
  })
  const branchCompareCurr  = branches.map(b => ({ name: b.name, value: branchMap[b.id]?.curr  ?? 0 }))
  const branchComparePrev  = branches.map(b => ({ name: b.name, value: branchMap[b.id]?.prev  ?? 0 }))

  // Pending installments table
  const installCols: TableColumn[] = [
    { key: 'client',    label: 'Cliente'    },
    { key: 'value',     label: 'Valor',      align: 'right',  render: (v) => fmtBRLFull(v) },
    { key: 'due',       label: 'Vencimento', align: 'center' },
    { key: 'branch',    label: 'Filial'      },
    {
      key: 'daysLeft', label: 'Dias', align: 'center',
      render: (v) => (
        <Badge label={`${v}d`} color={v <= 3 ? 'red' : v <= 7 ? 'amber' : 'gray'} />
      ),
    },
  ]
  const today = new Date()
  const installRows = installments.map(i => ({
    client:   i.financial_transactions?.clients?.name ?? '—',
    value:    Number(i.amount),
    due:      new Date(i.due_date).toLocaleDateString('pt-BR'),
    branch:   branches.find(b => b.id === i.financial_transactions?.branch_id)?.name ?? '—',
    daysLeft: Math.max(0, Math.ceil((new Date(i.due_date).getTime() - today.getTime()) / 86_400_000)),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Receita Bruta"   value={revenue}   format="brl" delta={pctDelta(revenue, prevRevenue)}   showDelta />
        <KpiCard label="Consumo de insumos" value={stockCOGS} format="brl" accent="#dc2626" />
        <KpiCard label="Despesas Op."    value={opEx}      format="brl" accent="#d97706"  delta={pctDelta(opEx, prevOpEx)}     showDelta />
        <KpiCard label="Lucro"           value={profit}    format="brl" accent={profit >= 0 ? '#16a34a' : '#dc2626'} delta={pctDelta(profit, prevProfit)}   showDelta />
        <KpiCard label="Margem"          value={margin}    format="pct" accent={margin >= 20 ? '#16a34a' : margin >= 0 ? '#d97706' : '#dc2626'} delta={prevRevenue > 0 ? marginDeltaPp : null} showDelta deltaUnit="p.p." />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="DRE Simplificado" style={{ gridColumn: '1 / -1' }}>
          {/* O consumo de insumos não entra no DRE: já está dentro das
              despesas, na categoria "Estoque", pela compra. */}
          <DreWaterfall receita={revenue} custoProdutos={0} despesas={opEx} lucro={profit} />
        </SCard>
        <SCard title="Receita por Forma de Pagamento">
          <HBarChart data={Object.entries(payMap).map(([name, value]) => ({ name, value }))} />
        </SCard>
        <SCard title="Receita por Categoria">
          <HBarChart
            data={Object.entries(catMap).map(([name, value]) => ({ name, value }))}
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
  const { allAppts, apptsPrevCount, branches } = p

  const total      = allAppts.length
  const completed  = allAppts.filter(a => a.status === 'COMPLETED').length
  const cancelled  = allAppts.filter(a => a.status === 'CANCELLED').length
  const noShow     = allAppts.filter(a => a.status === 'NO_SHOW').length
  const rate       = total > 0 ? (completed / total) * 100 : 0

  const byStatus = [
    { name: 'Concluído',      value: completed },
    { name: 'Cancelado',      value: cancelled },
    { name: 'Não Compareceu', value: noShow    },
    { name: 'Outros',         value: Math.max(0, total - completed - cancelled - noShow) },
  ]

  // Dia da semana no fuso do negócio: um atendimento das 22h de sábado cairia
  // em domingo se o cálculo seguisse o fuso do processo.
  const weekMap: Record<number, number> = {}
  allAppts.forEach(a => {
    const d = weekdayTZ(a.scheduled_at)
    weekMap[d] = (weekMap[d] ?? 0) + 1
  })
  const byWeekday = Array.from({ length: 7 }, (_, i) => ({ day: i, count: weekMap[i] ?? 0 }))

  const srcMap: Record<string, number> = {}
  allAppts.filter(a => a.source).forEach(a => {
    const k = SRC_LABELS[a.source] ?? a.source
    srcMap[k] = (srcMap[k] ?? 0) + 1
  })
  const bySource = Object.entries(srcMap).map(([name, value]) => ({ name, value }))

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
  const branchRows = branches.map(b => {
    const bAppts     = allAppts.filter(a => a.branch_id === b.id)
    const bCompleted = bAppts.filter(a => a.status === 'COMPLETED').length
    const bCancelled = bAppts.filter(a => a.status === 'CANCELLED').length
    const bNoShow    = bAppts.filter(a => a.status === 'NO_SHOW').length
    const bRate      = bAppts.length > 0 ? (bCompleted / bAppts.length) * 100 : 0
    return { name: b.name, completed: bCompleted, cancelled: bCancelled, noShow: bNoShow, rate: bRate }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Total Agendamentos" value={total}     format="int" />
        <KpiCard label="Realizados"         value={completed} format="int" delta={pctDelta(completed, apptsPrevCount)} showDelta />
        <KpiCard label="Cancelados"         value={cancelled} format="int" accent="#d97706" />
        <KpiCard label="Não Compareceu"     value={noShow}    format="int" accent="#dc2626" />
        <KpiCard label="Taxa de Conclusão"  value={rate}      format="pct" accent={rate >= 70 ? '#16a34a' : '#d97706'} />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Distribuição por Status">
          <DonutChart
            data={byStatus}
            colors={[CHART_COLORS[3]!, CHART_COLORS[4]!, '#dc2626', CHART_COLORS[5]!]}
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
  const { clientsCurr, clientsPrevCount, clientsAll, txsCurr, apptsCurr, retention, newClientsSeries } = p

  const totalAtivos = clientsAll.length
  const novos       = clientsCurr.length

  const apptByClient: Record<string, number> = {}
  apptsCurr.filter(a => a.client_id).forEach(a => {
    apptByClient[a.client_id] = (apptByClient[a.client_id] ?? 0) + 1
  })

  // Retenção agora vem do banco: clientes atendidos no período que JÁ tinham
  // sido atendidos antes dele. O cálculo anterior — "2+ atendimentos dentro da
  // janela" — media recorrência, não retenção, e em janelas curtas dava zero
  // por construção.
  const { clientsServed, returningClients, firstTimeClients } = retention
  const taxaRetencao = clientsServed > 0 ? (returningClients / clientsServed) * 100 : 0

  // Gasto por cliente, com estorno excluído dos dois lados.
  const spendByClient: Record<string, number> = {}
  txsCurr
    .filter(t => t.type === 'INCOME' && t.is_paid && t.client_id
                 && t.notes !== 'Estornada' && t.category !== 'Estorno')
    .forEach(t => {
      spendByClient[t.client_id] = (spendByClient[t.client_id] ?? 0) + Number(t.amount)
    })
  const spends = Object.values(spendByClient)
  const gastoMedio = spends.length > 0 ? spends.reduce((s, v) => s + v, 0) / spends.length : 0

  // Série de aquisição agregada no banco, dentro da janela e no fuso do
  // negócio. Antes era montada sobre TODOS os clientes já cadastrados, com
  // chave 'dd/MM' (a mesma data de anos diferentes somava no mesmo ponto) e um
  // corte final que seguia a ordem de inserção do objeto, não a cronológica.
  const acquisitionData = newClientsSeries.map(pt => ({
    label: new Date(pt.bucket).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
    }),
    value: pt.count,
  }))

  // Faixa etária pelo mesmo getAgeGroup usado na aba Procedimentos: aqui a
  // idade era `anoAtual - anoNascimento`, que erra em até um ano e classificava
  // a mesma pessoa em faixas diferentes nas duas telas.
  const refDate = new Date()
  const ageCount = new Map<string, number>()
  clientsAll.forEach(c => {
    const group = getAgeGroup(c.birth_date ?? null, refDate)
    if (group === 'Não informado') return
    ageCount.set(group, (ageCount.get(group) ?? 0) + 1)
  })
  const byAge = AGE_GROUP_ORDER
    .filter(g => g !== 'Não informado' && (ageCount.get(g) ?? 0) > 0)
    .map(name => ({ name, value: ageCount.get(name) ?? 0 }))

  // Gender
  const genderMap: Record<string, number> = {}
  clientsAll.filter(c => c.gender).forEach(c => {
    genderMap[c.gender] = (genderMap[c.gender] ?? 0) + 1
  })
  const byGender = Object.entries(genderMap).map(([name, value]) => ({ name, value }))

  // Top 10 clients by spend
  const clientNameMap: Record<string, string> = {}
  clientsAll.forEach(c => { clientNameMap[c.id] = c.name })
  const top10Rows = Object.entries(spendByClient)
    .sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([cid, total]) => ({
      name:  clientNameMap[cid] ?? cid.slice(0, 8),
      total: fmtBRLFull(total),
      appts: String(apptByClient[cid] ?? 0),
    }))

  // Cities
  const cityMap: Record<string, number> = {}
  clientsAll.filter(c => c.city).forEach(c => {
    cityMap[c.city] = (cityMap[c.city] ?? 0) + 1
  })
  const byCities = Object.entries(cityMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 10)

  const top10Cols: TableColumn[] = [
    { key: 'name',  label: 'Cliente'    },
    { key: 'total', label: 'Gasto Total', align: 'right' },
    { key: 'appts', label: 'Atendimentos', align: 'center' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Total Ativos"     value={totalAtivos}  format="int" />
        <KpiCard label="Novos no Período" value={novos}        format="int" delta={pctDelta(novos, clientsPrevCount)} showDelta />
        <KpiCard label="Atendidos no Período" value={clientsServed}    format="int" accent={CHART_COLORS[1]} />
        <KpiCard label="Primeira Vez"         value={firstTimeClients} format="int" accent={CHART_COLORS[2]} />
        <KpiCard label="Taxa de Retenção"     value={taxaRetencao}     format="pct" accent={taxaRetencao >= 40 ? '#16a34a' : '#d97706'} />
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

function getAgeGroup(birthDate: string | null, ref: Date): string {
  if (!birthDate) return 'Não informado'
  const born = new Date(birthDate)
  let age = ref.getFullYear() - born.getFullYear()
  const m = ref.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < born.getDate())) age--
  if (age < 18) return '< 18'
  if (age < 25) return '18–24'
  if (age < 35) return '25–34'
  if (age < 45) return '35–44'
  if (age < 55) return '45–54'
  if (age < 65) return '55–64'
  return '65+'
}

function AgeRankCard({ data }: {
  data: { ageGroup: string; top3: { name: string; label: string }[] }[]
}) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Sem dados para exibir.</p>
  }
  const rankColors = ['var(--brand)', 'var(--text-muted)', 'var(--text-faint)']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {data.map(({ ageGroup, top3 }) => (
        <div key={ageGroup}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
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
              <span style={{ fontSize: 11, fontWeight: 800, color: rankColors[idx], minWidth: 20 }}>
                #{idx + 1}
              </span>
              <span style={{
                flex: 1, fontSize: 13, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
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
  const { apptsCurr, apptsPrevCount, procedureCosts } = p

  const procData: Record<string, { revenue: number; count: number; category: string }> = {}
  apptsCurr.filter(a => a.procedures?.name).forEach(a => {
    const k = a.procedures.name
    if (!procData[k]) procData[k] = { revenue: 0, count: 0, category: a.procedures.category ?? '—' }
    procData[k].revenue += Number(a.price)
    procData[k].count++
  })

  // -- Custo por procedure_id → para cálculo de margem ----------------
  // Insumos + mão de obra + outros custos. As duas últimas parcelas existem no
  // cadastro (e são usadas na tela de procedimentos) mas ficavam de fora aqui,
  // então a margem exibida era sistematicamente otimista.
  const inputCostByProcedure = new Map<string, number>()
  const fixedCostByProcedure = new Map<string, number>()
  for (const pp of procedureCosts) {
    const qty  = Number(pp.quantity ?? 0)
    const cost = Number(pp.products?.cost_price ?? 0)
    inputCostByProcedure.set(pp.procedure_id, (inputCostByProcedure.get(pp.procedure_id) ?? 0) + qty * cost)
    fixedCostByProcedure.set(
      pp.procedure_id,
      Number(pp.procedures?.labor_cost ?? 0) + Number(pp.procedures?.other_costs ?? 0),
    )
  }
  const costByProcedure = new Map<string, number>()
  for (const id of inputCostByProcedure.keys()) {
    costByProcedure.set(id, (inputCostByProcedure.get(id) ?? 0) + (fixedCostByProcedure.get(id) ?? 0))
  }

  // -- Agrupamento por faixa etária -----------------------------------
  const refDate = new Date()
  const ageVolumeMap = new Map<string, Map<string, number>>()
  const ageMarginMap = new Map<string, Map<string, { total: number; count: number }>>()

  apptsCurr.filter(a => a.procedures?.name).forEach(a => {
    const procName = a.procedures.name as string
    const ageGroup = getAgeGroup(a.clients?.birth_date ?? null, refDate)
    const price    = Number(a.price)
    const cost     = costByProcedure.get(a.procedure_id) ?? 0

    // Volume
    if (!ageVolumeMap.has(ageGroup)) ageVolumeMap.set(ageGroup, new Map())
    const vm = ageVolumeMap.get(ageGroup)!
    vm.set(procName, (vm.get(procName) ?? 0) + 1)

    // Margem (só com custo configurado)
    if (cost > 0) {
      const margin = price > 0 ? ((price - cost) / price) * 100 : 0
      if (!ageMarginMap.has(ageGroup)) ageMarginMap.set(ageGroup, new Map())
      const mm = ageMarginMap.get(ageGroup)!
      const prev = mm.get(procName) ?? { total: 0, count: 0 }
      mm.set(procName, { total: prev.total + margin, count: prev.count + 1 })
    }
  })

  const topByAgeVolume = AGE_GROUP_ORDER
    .filter(ag => ageVolumeMap.has(ag))
    .map(ag => ({
      ageGroup: ag,
      top3: [...ageVolumeMap.get(ag)!.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, label: `${count} exec.` })),
    }))

  const topByAgeMargin = AGE_GROUP_ORDER
    .filter(ag => ageMarginMap.has(ag))
    .map(ag => ({
      ageGroup: ag,
      top3: [...ageMarginMap.get(ag)!.entries()]
        .sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))
        .slice(0, 3)
        .map(([name, d]) => ({
          name,
          label: `${(d.total / d.count).toFixed(1).replace('.', ',')}%`,
        })),
    }))

  // Conta todos os atendimentos concluídos do período, para casar com o
  // denominador do período anterior (apptsPrevCount). Os rankings abaixo é que
  // se restringem aos que têm procedimento nomeado.
  const totalExec   = apptsCurr.length
  const totalRev    = Object.values(procData).reduce((s, d) => s + d.revenue, 0)
  const avgTicket   = totalExec > 0 ? totalRev / totalExec : 0
  const topByName   = Object.entries(procData).sort(([, a], [, b]) => b.revenue - a.revenue)
  const topRevenue  = topByName.slice(0, 10).map(([name, d]) => ({ name, value: d.revenue }))
  const topVolume   = Object.entries(procData)
    .sort(([, a], [, b]) => b.count - a.count).slice(0, 10)
    .map(([name, d]) => ({ name, value: d.count }))
  const maisRealizado = topVolume[0]?.name ?? '—'

  const catMap: Record<string, number> = {}
  Object.entries(procData).forEach(([, d]) => {
    catMap[d.category] = (catMap[d.category] ?? 0) + d.revenue
  })
  const byCategory = Object.entries(catMap).map(([name, value]) => ({ name, value }))

  const tableCols: TableColumn[] = [
    { key: 'name',     label: 'Procedimento'  },
    { key: 'category', label: 'Categoria'     },
    { key: 'count',    label: 'Execuções',    align: 'center' },
    { key: 'revenue',  label: 'Receita Total', align: 'right', render: (v) => fmtBRLFull(v) },
    { key: 'ticket',   label: 'Ticket Médio',  align: 'right', render: (v) => fmtBRLFull(v) },
    { key: 'pct',      label: '% do Total',    align: 'center', render: (v) => `${v}%` },
  ]
  const tableRows = topByName.slice(0, 20).map(([name, d]) => ({
    name,
    category: d.category,
    count:    d.count,
    revenue:  d.revenue,
    ticket:   d.count > 0 ? d.revenue / d.count : 0,
    pct:      totalRev > 0 ? ((d.revenue / totalRev) * 100).toFixed(1) : '0.0',
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* Só "Total Execuções" tem delta: é a única grandeza cujo período
            anterior é medido do mesmo jeito (atendimentos concluídos). Receita
            e ticket aqui vêm de appointments.price, e o comparativo disponível
            do período anterior é de caixa — comparar os dois media outra coisa. */}
        <KpiCard label="Total Execuções" value={totalExec} format="int" delta={pctDelta(totalExec, apptsPrevCount ?? 0)} showDelta />
        <KpiCard label="Receita Total"   value={totalRev}  format="brl" />
        <KpiCard label="Ticket Médio"    value={avgTicket} format="brl" />
        <div className="card" style={{ padding: '16px 20px', flex: '1 1 160px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
            Mais Realizado
          </p>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand)', margin: 0, lineHeight: 1.3 }}>
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
          {procedureCosts.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
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
  const { apptsCurr, commissions, apptsPrevCount } = p

  const profData: Record<string, { revenue: number; count: number }> = {}
  apptsCurr.filter(a => a.users?.name).forEach(a => {
    const k = a.users.name
    if (!profData[k]) profData[k] = { revenue: 0, count: 0 }
    profData[k].revenue += Number(a.price)
    profData[k].count++
  })

  const professionais = new Set(apptsCurr.filter(a => a.users?.name).map(a => a.users.name)).size
  const totalAppts = apptsCurr.length
  const commOpen = commissions.filter(c => c.status === 'OPEN').reduce((s, c) => s + Number(c.amount), 0)
  const commPaid = commissions.filter(c => c.status === 'PAID').reduce((s, c) => s + Number(c.amount), 0)

  const byRevenue = Object.entries(profData)
    .map(([name, d]) => ({ name, value: d.revenue }))
    .sort((a, b) => b.value - a.value)

  const byCount = Object.entries(profData)
    .map(([name, d]) => ({ name, value: d.count }))
    .sort((a, b) => b.value - a.value)

  // Commission summary per professional
  const commByProf: Record<string, { open: number; paid: number }> = {}
  commissions.filter(c => c.users?.name).forEach(c => {
    const k = c.users.name
    if (!commByProf[k]) commByProf[k] = { open: 0, paid: 0 }
    if (c.status === 'OPEN') commByProf[k].open += Number(c.amount)
    else                      commByProf[k].paid += Number(c.amount)
  })

  const commCols: TableColumn[] = [
    { key: 'name',    label: 'Profissional'   },
    { key: 'appts',   label: 'Atendimentos',   align: 'center' },
    { key: 'revenue', label: 'Receita Gerada', align: 'right', render: (v) => fmtBRLFull(v) },
    { key: 'open',    label: 'Comissão Aberta', align: 'right', render: (v) => fmtBRLFull(v) },
    { key: 'paid',    label: 'Comissão Paga',   align: 'right', render: (v) => fmtBRLFull(v) },
    {
      key: 'status', label: 'Status', align: 'center',
      render: (v) => <Badge label={v} color={v === 'OK' ? 'green' : 'amber'} />,
    },
  ]
  const allProfNames = new Set([
    ...Object.keys(profData),
    ...Object.keys(commByProf),
  ])
  const commRows = Array.from(allProfNames).map(name => {
    const open = commByProf[name]?.open ?? 0
    return {
      name,
      appts:   profData[name]?.count   ?? 0,
      revenue: profData[name]?.revenue ?? 0,
      open,
      paid:    commByProf[name]?.paid  ?? 0,
      status:  open === 0 ? 'OK' : 'Pendente',
    }
  }).sort((a, b) => b.revenue - a.revenue)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Profissionais Ativos" value={professionais} format="int" />
        <KpiCard label="Atendimentos"         value={totalAppts}    format="int" delta={pctDelta(totalAppts, apptsPrevCount ?? 0)} showDelta />
        <KpiCard label="Comissões em Aberto"  value={commOpen}      format="brl" accent="#d97706" />
        <KpiCard label="Comissões Pagas"      value={commPaid}      format="brl" accent="#16a34a" />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Receita Gerada por Profissional">
          <HBarChart data={byRevenue} />
        </SCard>
        <SCard title="Atendimentos por Profissional">
          <HBarChart data={byCount} color={CHART_COLORS[1]} formatValue={(v) => String(v)} />
        </SCard>
        <SCard title="Comissões por Profissional" style={{ gridColumn: '1 / -1' }}>
          <SimpleTable columns={commCols} rows={commRows} />
        </SCard>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// TAB: ESTOQUE
// -----------------------------------------------------------------------------
function TabEstoque(p: ReportsBiProps) {
  const { stockMoves, bps, productBatches, branches } = p

  const totalStockValue = bps.reduce((s, b) => {
    const cost = Number(b.products?.cost_price ?? 0)
    return s + Number(b.current_stock) * cost
  }, 0)
  const consumoValue = stockMoves.reduce(
    (s, m) => s + Math.abs(Number(m.quantity)) * Number(m.products?.cost_price ?? 0), 0,
  )
  const giro = totalStockValue > 0 ? (consumoValue / totalStockValue) * 100 : 0
  const criticos = bps.filter(b =>
    Number(b.current_stock) > 0 &&
    Number(b.min_stock) > 0 &&
    Number(b.current_stock) <= Number(b.min_stock)
  ).length
  const zerados = bps.filter(b =>
    Number(b.current_stock) === 0 && b.products?.is_active !== false
  ).length

  // Top consumed products
  const consumeMap: Record<string, number> = {}
  stockMoves.filter(m => m.products?.name).forEach(m => {
    consumeMap[m.products.name] = (consumeMap[m.products.name] ?? 0) +
      Math.abs(Number(m.quantity)) * Number(m.products.cost_price ?? 0)
  })
  const topConsumed = Object.entries(consumeMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value).slice(0, 10)

  // Value by category
  const catValueMap: Record<string, number> = {}
  bps.filter(b => b.products?.category).forEach(b => {
    const cat = b.products.category
    catValueMap[cat] = (catValueMap[cat] ?? 0) + Number(b.current_stock) * Number(b.products.cost_price ?? 0)
  })
  const byCategory = Object.entries(catValueMap).map(([name, value]) => ({ name, value }))

  // Branch health table
  const branchHealthCols: TableColumn[] = [
    { key: 'name',     label: 'Unidade'        },
    { key: 'total',    label: 'Itens',  align: 'center' },
    { key: 'zerados',  label: 'Zerados', align: 'center',
      render: (v) => <Badge label={String(v)} color={Number(v) > 0 ? 'red' : 'green'} /> },
    { key: 'criticos', label: 'Críticos', align: 'center',
      render: (v) => <Badge label={String(v)} color={Number(v) > 0 ? 'amber' : 'green'} /> },
    { key: 'value',    label: 'Valor em Estoque', align: 'right', render: (v) => fmtBRLFull(v) },
  ]
  const branchHealthRows = branches.map(b => {
    const bBps   = bps.filter(bp => bp.branch_id === b.id)
    const bZero  = bBps.filter(bp => Number(bp.current_stock) === 0 && bp.products?.is_active !== false).length
    const bCrit  = bBps.filter(bp => Number(bp.current_stock) > 0 && Number(bp.min_stock) > 0 && Number(bp.current_stock) <= Number(bp.min_stock)).length
    const bValue = bBps.reduce((s, bp) => s + Number(bp.current_stock) * Number(bp.products?.cost_price ?? 0), 0)
    return { name: b.name, total: bBps.length, zerados: bZero, criticos: bCrit, value: bValue }
  })

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
        <KpiCard label="Consumo no Período" value={consumoValue} format="brl" accent="#d97706" />
        <KpiCard label="Giro (%)" value={giro} format="pct" accent={giro >= 50 ? '#16a34a' : '#d97706'} />
        <KpiCard label="Itens Críticos" value={criticos} format="int" accent="#d97706" />
        <KpiCard label="Itens Zerados"  value={zerados}  format="int" accent="#dc2626" />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Top 10 Produtos Mais Consumidos (custo)">
          <HBarChart data={topConsumed} color="#d97706" />
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
    { key: 'leads',        label: 'Leads',   align: 'right', width: 80, render: v => fmtInt(v) },
    { key: 'conversao',    label: 'Conv.',   align: 'right', width: 80,
      render: (_v, row) => row.leads > 0
        ? <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{fmtPct((row.convertidos / row.leads) * 100)}</span>
        : '—' },
    { key: 'agendamentos', label: 'Agend.',  align: 'right', width: 90, render: v => fmtInt(v) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <KpiCard label="Conversão de leads"    value={c.conversao} format="pct" />
        <KpiCard label="Leads recebidos"       value={c.totalLeads} format="int" accent="var(--text)" />
        <KpiCard label="Avaliações agendadas"  value={c.evalAgendadas} format="int" accent="var(--text)" />
        <KpiCard label="Comparecimento"        value={c.comparecimento} format="pct" accent="var(--text)" />
        <KpiCard label="Agend. comerciais"     value={c.agendamentosComerciais} format="int" accent="var(--text)" />
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>
        {fmtInt(c.convertidos)} de {fmtInt(c.totalLeads)} leads viraram cliente ·
        {' '}{fmtInt(c.evalRealizadas)} de {fmtInt(c.evalConsideradas)} avaliações não canceladas
        aconteceram · agendamentos comerciais são os gerados pelo time comercial.
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
                  <div style={{ width: 120, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                    {e.name}
                  </div>
                  <div style={{ flex: 1, height: 10, background: 'var(--track, #f0e6e3)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${(e.count / maiorEtapa) * 100}%`, height: '100%', background: 'var(--brand)', borderRadius: 99 }} />
                  </div>
                  <div style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text)', fontVariant: 'tabular-nums' }}>
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
  return <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>{texto}</p>
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
            fontSize: 10, fontWeight: 700, color: 'var(--brand)',
            textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px',
          }}>
            ✦ {props.scopeLabel}
          </p>
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: 'var(--text)',
            margin: 0, letterSpacing: '-0.02em',
          }}>
            BI — Relatórios
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {props.periodLabel}
          </p>
        </div>

        {/* Recorte: a rede inteira ou uma unidade. Fica ao lado do título
            porque muda o significado de todos os números abaixo. */}
        {props.showBranchFilter && (props.allBranches ?? props.branches).length > 1 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="overline">Recorte</span>
            <select
              className="field"
              style={{ width: 'auto', minWidth: 160, padding: '7px 10px' }}
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
          options={TABS}
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
