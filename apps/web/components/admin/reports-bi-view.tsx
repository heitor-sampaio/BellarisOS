'use client'

import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { EvolutionChart, type ChartPoint } from './evolution-chart'
import { PeriodSelector, type Period } from './period-selector'
import { SegSelect } from '@/components/shared/seg-select'
import {
  HBarChart, WeekBarChart, DonutChart, MiniAreaChart,
  DreWaterfall, SimpleTable, Badge,
  CHART_COLORS, fmtBRLShort, fmtBRLFull,
  type TableColumn,
} from './reports-charts'

// -- Types ---------------------------------------------------------------------
type Tab = 'overview' | 'financeiro' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',       label: 'Visão Geral'    },
  { key: 'financeiro',     label: 'Financeiro'     },
  { key: 'agenda',         label: 'Agenda'         },
  { key: 'clientes',       label: 'Clientes'       },
  { key: 'procedimentos',  label: 'Procedimentos'  },
  { key: 'profissionais',  label: 'Profissionais'  },
  { key: 'estoque',        label: 'Estoque'        },
]

export interface ReportsBiProps {
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
  evolutionData: ChartPoint[]
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
  label, value, format = 'brl', delta, accent, showDelta = false,
}: {
  label: string
  value: number
  format?: 'brl' | 'brl-short' | 'int' | 'pct'
  delta?: number | null
  accent?: string
  showDelta?: boolean
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
          {delta! >= 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1).replace('.', ',')}% vs anterior
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

const SRC_LABELS: Record<string, string> = {
  INTERNAL: 'Interno', ONLINE: 'Online', CLIENT_APP: 'App do Cliente',
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
    stockMoves, allAppts, commissions, branches, evolutionData, granularity } = p

  const revenue      = txsCurr.filter(t => t.type === 'INCOME' && t.is_paid).reduce((s, t) => s + Number(t.amount), 0)
  const prevRevenue  = txsPrev.filter(t => t.type === 'INCOME' && t.is_paid).reduce((s, t) => s + Number(t.amount), 0)
  const stockCOGS    = stockMoves.reduce((s, m) => s + Math.abs(Number(m.quantity)) * Number(m.products?.cost_price ?? 0), 0)
  const expenses     = txsCurr.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0) + stockCOGS
  const prevExpenses = txsPrev.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
  const profit       = revenue - expenses
  const prevProfit   = prevRevenue - prevExpenses
  const avgTicket    = apptsCurr.length > 0 ? revenue / apptsCurr.length : 0
  const prevAvgTicket = apptsPrevCount > 0 ? prevRevenue / apptsPrevCount : 0

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
        <KpiCard label="Ticket Médio"   value={avgTicket}         format="brl" delta={pctDelta(avgTicket, prevAvgTicket)}                  showDelta />
      </div>
      {/* Charts grid */}
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="Faturamento por Unidade">
          <HBarChart data={byBranch} />
        </SCard>
        <SCard title="Evolução do Período">
          <EvolutionChart data={evolutionData} monthLabel={p.periodLabel} granularity={granularity} />
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

  const revenue     = txsCurr.filter(t => t.type === 'INCOME' && t.is_paid).reduce((s, t) => s + Number(t.amount), 0)
  const prevRevenue = txsPrev.filter(t => t.type === 'INCOME' && t.is_paid).reduce((s, t) => s + Number(t.amount), 0)
  const stockCOGS   = stockMoves.reduce((s, m) => s + Math.abs(Number(m.quantity)) * Number(m.products?.cost_price ?? 0), 0)
  const opEx        = txsCurr.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
  const prevOpEx    = txsPrev.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
  const profit      = revenue - stockCOGS - opEx
  const prevProfit  = prevRevenue - prevOpEx
  const margin      = revenue > 0 ? (profit / revenue) * 100 : 0
  const prevMargin  = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0

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
        <KpiCard label="Custo Insumos"   value={stockCOGS} format="brl" accent="#dc2626" />
        <KpiCard label="Despesas Op."    value={opEx}      format="brl" accent="#d97706"  delta={pctDelta(opEx, prevOpEx)}     showDelta />
        <KpiCard label="Lucro"           value={profit}    format="brl" accent={profit >= 0 ? '#16a34a' : '#dc2626'} delta={pctDelta(profit, prevProfit)}   showDelta />
        <KpiCard label="Margem"          value={margin}    format="pct" accent={margin >= 20 ? '#16a34a' : margin >= 0 ? '#d97706' : '#dc2626'} delta={pctDelta(margin, prevMargin)} showDelta />
      </div>
      <div className="rg-2" style={{ gap: 16 }}>
        <SCard title="DRE Simplificado" style={{ gridColumn: '1 / -1' }}>
          <DreWaterfall receita={revenue} custoProdutos={stockCOGS} despesas={opEx} lucro={profit} />
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
  const { allAppts, apptsCurr, apptsPrevCount, branches } = p

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

  const weekMap: Record<number, number> = {}
  allAppts.forEach(a => {
    const d = new Date(a.scheduled_at).getDay()
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
  const { clientsCurr, clientsPrevCount, clientsAll, txsCurr, apptsCurr } = p

  const totalAtivos  = clientsAll.length
  const novos        = clientsCurr.length
  // Recorrentes = clientes que aparecem ≥2 vezes em apptsCurr
  const apptByClient: Record<string, number> = {}
  apptsCurr.filter(a => a.client_id).forEach(a => {
    apptByClient[a.client_id] = (apptByClient[a.client_id] ?? 0) + 1
  })
  const recorrentes = Object.values(apptByClient).filter(n => n >= 2).length
  const taxaRetencao = Object.keys(apptByClient).length > 0
    ? (recorrentes / Object.keys(apptByClient).length) * 100 : 0

  // LTV no período: média de gasto por cliente em txsCurr
  const spendByClient: Record<string, number> = {}
  txsCurr.filter(t => t.type === 'INCOME' && t.is_paid && t.client_id).forEach(t => {
    spendByClient[t.client_id] = (spendByClient[t.client_id] ?? 0) + Number(t.amount)
  })
  const spends = Object.values(spendByClient)
  const gastoMedio = spends.length > 0 ? spends.reduce((s, v) => s + v, 0) / spends.length : 0

  // New clients by day (from clientsAll within period — using clientsCurr as proxy)
  const dayMap: Record<string, number> = {}
  clientsCurr.forEach(() => {
    // We only have id/branch_id for clientsCurr; use clientsAll created_at if available
  })
  clientsAll.forEach(c => {
    if (!c.created_at) return
    const d = new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    dayMap[d] = (dayMap[d] ?? 0) + 1
  })
  const acquisitionData = Object.entries(dayMap)
    .slice(-30)
    .map(([label, value]) => ({ label, value }))

  // Age groups
  const AGE_LABELS = ['<18', '18–24', '25–34', '35–44', '45–54', '55+']
  const ageBuckets = [0, 0, 0, 0, 0, 0]
  const thisYear = new Date().getFullYear()
  clientsAll.filter(c => c.birth_date).forEach(c => {
    const age = thisYear - new Date(c.birth_date).getFullYear()
    if (age < 18)      ageBuckets[0]!++
    else if (age < 25) ageBuckets[1]!++
    else if (age < 35) ageBuckets[2]!++
    else if (age < 45) ageBuckets[3]!++
    else if (age < 55) ageBuckets[4]!++
    else               ageBuckets[5]!++
  })
  const byAge = AGE_LABELS.map((name, i) => ({ name, value: ageBuckets[i] ?? 0 }))

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
        <KpiCard label="Recorrentes"      value={recorrentes}  format="int" accent={CHART_COLORS[1]} />
        <KpiCard label="Taxa de Retenção" value={taxaRetencao} format="pct" accent={taxaRetencao >= 40 ? '#16a34a' : '#d97706'} />
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
  const { apptsCurr, txsPrev, apptsPrevCount, procedureCosts } = p
  const prevRevenue = txsPrev.filter(t => t.type === 'INCOME' && t.is_paid).reduce((s, t) => s + Number(t.amount), 0)
  const prevAvgTicket = (apptsPrevCount ?? 0) > 0 ? prevRevenue / (apptsPrevCount ?? 1) : 0

  const procData: Record<string, { revenue: number; count: number; category: string }> = {}
  apptsCurr.filter(a => a.procedures?.name).forEach(a => {
    const k = a.procedures.name
    if (!procData[k]) procData[k] = { revenue: 0, count: 0, category: a.procedures.category ?? '—' }
    procData[k].revenue += Number(a.price)
    procData[k].count++
  })

  // -- Custo por procedure_id → para cálculo de margem ----------------
  const costByProcedure = new Map<string, number>()
  for (const pp of procedureCosts) {
    const qty  = Number(pp.quantity ?? 0)
    const cost = Number(pp.products?.cost_price ?? 0)
    costByProcedure.set(pp.procedure_id, (costByProcedure.get(pp.procedure_id) ?? 0) + qty * cost)
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

  const totalExec   = Object.values(procData).reduce((s, d) => s + d.count, 0)
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
        <KpiCard label="Total Execuções" value={totalExec} format="int" delta={pctDelta(totalExec, apptsPrevCount ?? 0)} showDelta />
        <KpiCard label="Receita Total"   value={totalRev}  format="brl" delta={pctDelta(totalRev, prevRevenue)}           showDelta />
        <KpiCard label="Ticket Médio"    value={avgTicket} format="brl" delta={pctDelta(avgTicket, prevAvgTicket)}         showDelta />
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
  const { apptsCurr, commissions, branches, apptsPrevCount } = p

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
// MAIN: ReportsBiView
// -----------------------------------------------------------------------------
export function ReportsBiView(props: ReportsBiProps) {
  const router = useRouter()
  const { tab, period } = props

  const switchTab = (t: Tab) => router.push(`?tab=${t}&period=${period}`)

  const activeSection = {
    overview:       <TabOverview      {...props} />,
    financeiro:     <TabFinanceiro    {...props} />,
    agenda:         <TabAgenda        {...props} />,
    clientes:       <TabClientes      {...props} />,
    procedimentos:  <TabProcedimentos {...props} />,
    profissionais:  <TabProfissionais {...props} />,
    estoque:        <TabEstoque       {...props} />,
  }[tab]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page header */}
      <div>
        <p style={{
          fontSize: 10, fontWeight: 700, color: 'var(--brand)',
          textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px',
        }}>
          ✦ Rede
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

      {/* Tab nav + seletor de período na mesma linha */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <SegSelect
          options={TABS}
          value={tab}
          onSelect={(k) => switchTab(k as Tab)}
          ariaLabel="Seção do relatório"
        />
        <PeriodSelector
          current={period}
          fromDate={props.customFrom}
          toDate={props.customTo}
        />
      </div>

      {/* Active section */}
      {activeSection}
    </div>
  )
}
