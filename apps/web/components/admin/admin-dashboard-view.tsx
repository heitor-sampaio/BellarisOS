'use client'

import { useState, useEffect, type ReactNode } from 'react'
import {
  TrendingUp, TrendingDown, Users, Calendar,
  ArrowUpRight, ArrowDownRight, ExternalLink,
  AlertTriangle, ClipboardList, Package, CheckCircle2,
  Clock, Zap,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip as RechartsTip, ResponsiveContainer } from 'recharts'
import { EvolutionChart, type ChartPoint } from './evolution-chart'
import { HotmapSection, type RawBranch } from './hotmap-section'
import { PeriodSelector, type Period } from './period-selector'

// --- Types -------------------------------------------------------------------

export interface BranchStat {
  id:           string
  name:         string
  slug:         string
  revenue:      number
  appointments: number
  newClients:   number
  ticketMedio:  number
}

export interface TodayBranchStat {
  id:         string
  name:       string
  slug:       string
  total:      number
  scheduled:  number
  confirmed:  number
  inProgress: number
  completed:  number
}

export interface AlertPendingPlan {
  id:         string
  clientName: string
  branchName: string
  branchSlug: string
  createdAt:  string
}

export interface AlertLowStock {
  productName:  string
  branchName:   string
  branchSlug:   string
  currentStock: number
  minStock:     number
}

export interface AdminDashboardProps {
  monthLabel:       string
  totalRevenue:      number
  totalCost:         number
  totalAppointments: number
  newClients:       number
  ticketMedio:      number
  totalClientsEver: number
  branchCount:      number
  prevRevenue:      number
  prevAppointments: number
  prevNewClients:   number
  branchStats:      BranchStat[]
  todayTotal:       number
  todayByBranch:    TodayBranchStat[]
  pendingPlans:       AlertPendingPlan[]
  lowStockItems:      AlertLowStock[]
  stockStatus:        'healthy' | 'warning' | 'critical'
  zeroStockCount:     number
  lowStockCount:      number
  stockTurnover:      number
  // Gráfico de evolução
  evolutionData: ChartPoint[]
  // Ocupação
  branchOccupancy: {
    name: string; slug: string
    completed: number; cancelled: number; noShow: number
    total: number; occupancyPct: number
  }[]
  // Analytics avançados
  topProcedures:          { name: string; count: number; pct: number }[]
  topProceduresByRevenue: { name: string; revenue: number; pct: number }[]
  topRecurring:           { name: string; repeatVisits: number }[]
  topProfessionals:              { name: string; count: number; pct: number }[]
  topProfessionalsByRevenue:     { name: string; revenue: number; pct: number }[]
  topProfessionalsByCommission:  { name: string; amount: number; pct: number }[]
  procedureMargins:   { name: string; price: number; cost: number; marginPct: number }[]
  avgDurationMinutes: number
  bestRatedPros:      { name: string; avgRating: number; count: number }[]
  worstRatedPros:     { name: string; avgRating: number; count: number }[]
  topClients:              { id: string; name: string; totalSpent: number; appointmentCount: number }[]
  topClientsByRecurrence:  { name: string; count: number; pct: number }[]
  clientAgeGroups:         { label: string; count: number; pct: number }[]
  topClientsByLocation:    { city: string; count: number; pct: number }[]
  hotmapRawBranches:       RawBranch[]
  hotmapRawCepCounts:      Record<string, number>
  hotmapRawCepLtv:         Record<string, number>
  currentPeriod:  Period
  customFrom?:    string
  customTo?:      string
  granularity:    'hour' | 'day'
}

// --- Helpers -----------------------------------------------------------------

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`
  return fmtBRL(v)
}

function pctDelta(curr: number, prev: number) {
  if (prev === 0 && curr === 0) return null
  if (prev === 0) return { pct: 100, up: true }
  const pct = ((curr - prev) / prev) * 100
  return { pct: Math.abs(pct), up: pct >= 0 }
}

const AGE_PIE_COLORS = ['#c34d6b', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#64748b']

// --- Animation primitives -----------------------------------------------------

function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    let raf: number
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setVal(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
      else setVal(target)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

function AnimatedNum({
  value, format = 'int', style,
}: {
  value:   number
  format?: 'brl' | 'brl-short' | 'int' | 'pct'
  style?:  React.CSSProperties
}) {
  const v = useCountUp(value)
  const display =
    format === 'brl'       ? fmtBRL(v) :
    format === 'brl-short' ? fmtShort(v) :
    format === 'pct'       ? `${v.toFixed(0)}%` :
    Math.round(v).toLocaleString('pt-BR')
  return <span style={style}>{display}</span>
}

function AnimatedBar({
  pct, color, height = 3, borderRadius = 2,
  background = 'var(--hairline)', maxWidth,
}: {
  pct:          number
  color:        string
  height?:      number
  borderRadius?: number
  background?:  string
  maxWidth?:    number
}) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setWidth(pct), 30)
    return () => clearTimeout(id)
  }, [pct])
  return (
    <div style={{ height, borderRadius, background, overflow: 'hidden', ...(maxWidth ? { maxWidth, width: '100%' } : {}) }}>
      <div style={{
        height: '100%', borderRadius,
        background: color,
        width: `${width}%`,
        transition: 'width 0.85s cubic-bezier(0.16, 1, 0.3, 1)',
      }} />
    </div>
  )
}

function timeSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  if (d > 0) return `há ${d}d`
  if (h > 0) return `há ${h}h`
  return 'agora'
}

// --- Section Header ----------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-muted)', flexShrink: 0,
      }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
    </div>
  )
}

// --- Mini bar row (para rankings) --------------------------------------------

function MiniBarRow({
  rank, name, label, pct, accent = 'var(--brand)',
}: {
  rank:    number
  name:    string
  label:   string
  pct:     number
  accent?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-faint)', width: 16, flexShrink: 0, textAlign: 'right' }}>
        {rank}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
            {label}
          </span>
        </div>
        <AnimatedBar pct={pct} color={accent} height={3} />
      </div>
    </div>
  )
}

// --- Star display -------------------------------------------------------------

function RatingBadge({ value, max = 5 }: { value: number; max?: number }) {
  const pct = (value / max) * 100
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color, letterSpacing: '-0.01em' }}>
        {value.toFixed(1)}
      </span>
      <span style={{ fontSize: 11, color }}>★</span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>/ {max}</span>
    </div>
  )
}

// --- KPI Card ----------------------------------------------------------------

function KpiCard({
  label, value, format = 'brl', sub, delta, icon, brand = false,
}: {
  label:   string
  value:   number
  format?: 'brl' | 'int'
  sub?:    string
  delta?:  { pct: number; up: boolean } | null
  icon:    ReactNode
  brand?:  boolean
}) {
  return (
    <div className="card" style={{
      padding: '20px 22px',
      background: brand ? 'var(--brand)' : 'var(--surface)',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: brand ? '0 4px 20px -4px rgba(195,77,107,.40)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: brand ? 'rgba(255,255,255,.72)' : 'var(--text-muted)',
        }}>{label}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: brand ? 'rgba(255,255,255,.18)' : 'var(--brand-soft)',
        }}>
          {icon}
        </div>
      </div>

      <AnimatedNum
        value={value}
        format={format}
        style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.028em', lineHeight: 1,
          color: brand ? '#fff' : 'var(--text)',
        }}
      />

      {sub && (
        <span style={{ fontSize: 11, color: brand ? 'rgba(255,255,255,.6)' : 'var(--text-faint)' }}>
          {sub}
        </span>
      )}

      {delta != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: -2 }}>
          {delta.up
            ? <ArrowUpRight  size={12} color={brand ? 'rgba(255,255,255,.8)' : '#16a34a'} />
            : <ArrowDownRight size={12} color={brand ? 'rgba(255,255,255,.55)' : '#dc2626'} />}
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: brand
              ? (delta.up ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.55)')
              : (delta.up ? '#16a34a' : '#dc2626'),
          }}>
            {delta.pct.toFixed(1).replace('.', ',')}% vs. mês anterior
          </span>
        </div>
      )}
    </div>
  )
}

// --- Status dot --------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  scheduled:  '#94a3b8',
  confirmed:  '#3b82f6',
  inProgress: '#f59e0b',
  completed:  '#16a34a',
}

function StatusPill({ label, count, colorKey }: { label: string; count: number; colorKey: string }) {
  if (count === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: STATUS_COLORS[colorKey],
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
        {count} {label}
      </span>
    </div>
  )
}

// --- Main component -----------------------------------------------------------

export function AdminDashboardView({
  monthLabel,
  totalRevenue, totalCost, totalAppointments, newClients, ticketMedio,
  totalClientsEver, branchCount,
  prevRevenue, prevAppointments, prevNewClients,
  branchStats, todayTotal, todayByBranch,
  pendingPlans, lowStockItems, stockStatus, zeroStockCount, lowStockCount, stockTurnover,
  evolutionData,
  branchOccupancy,
  topProcedures, topProceduresByRevenue, topRecurring, topProfessionals, topProfessionalsByRevenue, topProfessionalsByCommission, procedureMargins,
  avgDurationMinutes, bestRatedPros, worstRatedPros,
  topClients, topClientsByRecurrence, clientAgeGroups, topClientsByLocation,
  hotmapRawBranches, hotmapRawCepCounts, hotmapRawCepLtv,
  currentPeriod, customFrom, customTo, granularity,
}: AdminDashboardProps) {

  const deltaRevenue      = pctDelta(totalRevenue,      prevRevenue)
  const deltaAppointments = pctDelta(totalAppointments, prevAppointments)
  const deltaNewClients   = pctDelta(newClients,        prevNewClients)

  const maxRevenue  = Math.max(...branchStats.map(b => b.revenue), 1)
  const sortedStats = [...branchStats].sort((a, b) => b.revenue - a.revenue)

  const hasAlerts = pendingPlans.length > 0 || lowStockItems.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* -- Header -- */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 800,
            letterSpacing: '-0.022em', color: 'var(--text)', lineHeight: 1.1,
          }}>
            Visão geral da rede
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            {monthLabel} · {branchCount} filial{branchCount !== 1 ? 'is' : ''} · {totalClientsEver.toLocaleString('pt-BR')} clientes
          </p>
          {!hasAlerts && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 20, marginTop: 8,
              background: '#f0fdf4', border: '1.5px solid #bbf7d0',
            }}>
              <CheckCircle2 size={11} color="#16a34a" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>
                Tudo em ordem
              </span>
            </div>
          )}
        </div>
        <PeriodSelector current={currentPeriod} fromDate={customFrom} toDate={customTo} />
      </div>

      {/* -- KPI cards -- */}
      <div className="kpi-grid-auto" style={{ gap: 14 }}>
        <KpiCard
          brand
          label="Receita bruta do mês"
          value={totalRevenue}
          format="brl"
          delta={deltaRevenue}
          icon={<TrendingUp size={16} color="#fff" />}
        />
        <KpiCard
          label="Custo do mês"
          value={totalCost}
          format="brl"
          sub="despesas registradas"
          icon={<TrendingDown size={16} color="var(--brand)" />}
        />
        <KpiCard
          label="Atendimentos"
          value={totalAppointments}
          format="int"
          sub="concluídos no mês"
          delta={deltaAppointments}
          icon={<Calendar size={16} color="var(--brand)" />}
        />
        <KpiCard
          label="Novos clientes"
          value={newClients}
          format="int"
          sub={`${totalClientsEver.toLocaleString('pt-BR')} no total`}
          delta={deltaNewClients}
          icon={<Users size={16} color="var(--brand)" />}
        />
        <KpiCard
          label="Ticket médio"
          value={ticketMedio}
          format="brl"
          sub="receita ÷ atendimentos"
          icon={<Zap size={16} color="var(--brand)" />}
        />
      </div>

      {/* -- Middle: ranking + hoje -- */}
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: 16, alignItems: 'start' }}>

        {/* Ranking de filiais + gráfico de evolução */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Gráfico animado */}
          <EvolutionChart data={evolutionData} monthLabel={monthLabel} granularity={granularity} />

          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking de filiais</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{monthLabel}</span>
          </div>

          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Filial', 'Receita', 'Atend.', 'Novos', 'Ticket médio', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: i === 0 ? '9px 8px 9px 18px' : '9px 16px',
                    textAlign: i <= 1 ? 'left' : (i === 6 ? 'right' : 'right'),
                    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    width: i === 0 ? 32 : i === 6 ? 56 : undefined,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((b, i) => {
                const pct = maxRevenue > 0 ? (b.revenue / maxRevenue) * 100 : 0
                return (
                  <tr
                    key={b.id}
                    style={{ borderBottom: i < sortedStats.length - 1 ? '1px solid var(--hairline)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '13px 8px 13px 18px', fontSize: 12, fontWeight: 800, color: 'var(--text-faint)', width: 32 }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '13px 16px', maxWidth: 220 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block' }}>{b.name}</span>
                      {/* mini bar */}
                      <div style={{ marginTop: 5 }}>
                        <AnimatedBar pct={pct} color="var(--brand)" height={3} maxWidth={160} />
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: b.revenue > 0 ? '#16a34a' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                      {fmtBRL(b.revenue)}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-muted)' }}>
                      {b.appointments}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-muted)' }}>
                      {b.newClients}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {b.ticketMedio > 0 ? fmtBRL(b.ticketMedio) : '—'}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <a
                        href={`/${b.slug}/dashboard`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
                      >
                        Ver <ExternalLink size={10} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {sortedStats.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhuma filial ativa.
            </div>
          )}
          </div>
        </div>

        {/* Coluna direita: Hoje na rede + Estoque */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Hoje na rede */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={14} color="var(--text-muted)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Hoje na rede</span>
            </div>
            <AnimatedNum
              value={todayTotal}
              format="int"
              style={{
                fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
                color: todayTotal > 0 ? 'var(--brand)' : 'var(--text-faint)',
              }}
            />
          </div>
          {todayByBranch.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center' }}>
              <CheckCircle2 size={28} color="var(--border)" style={{ margin: '0 auto 10px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum agendamento para hoje</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[...todayByBranch]
                .sort((a, b) => b.total - a.total)
                .map((b, i) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '13px 18px',
                      borderBottom: i < todayByBranch.length - 1 ? '1px solid var(--hairline)' : 'none',
                      display: 'flex', flexDirection: 'column', gap: 7,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <a
                        href={`/${b.slug}/agenda`}
                        style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
                      >
                        {b.name}
                      </a>
                      <AnimatedNum value={b.total} format="int" style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                      <StatusPill label="ag."    count={b.scheduled}  colorKey="scheduled"  />
                      <StatusPill label="conf."  count={b.confirmed}  colorKey="confirmed"  />
                      <StatusPill label="em at." count={b.inProgress} colorKey="inProgress" />
                      <StatusPill label="ok"     count={b.completed}  colorKey="completed"  />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Card indicador de estoque */}
        {(() => {
          const cfg = {
            healthy:  { label: 'Saudável',   bg: '#f0fdf4', border: '#bbf7d0', dot: '#16a34a', text: '#15803d' },
            warning:  { label: 'Atenção',    bg: '#fffbeb', border: '#fde68a', dot: '#d97706', text: '#92400e' },
            critical: { label: 'Emergência', bg: '#fff1f2', border: '#fecaca', dot: '#dc2626', text: '#991b1b' },
          }[stockStatus]
          return (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Estoque</span>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: cfg.text }}>{cfg.label}</span>
                </div>
              </div>

              {/* Giro */}
              <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Giro do mês</span>
                <AnimatedNum value={stockTurnover} format="brl" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }} />
              </div>

              {/* Zerados */}
              <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Produtos zerados</span>
                <AnimatedNum value={zeroStockCount} format="int" style={{
                  fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em',
                  color: zeroStockCount > 0 ? '#dc2626' : 'var(--text-faint)',
                }} />
              </div>

              {/* Estoque baixo */}
              <div style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Estoque baixo</span>
                <AnimatedNum value={lowStockCount} format="int" style={{
                  fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em',
                  color: lowStockCount > 0 ? '#d97706' : 'var(--text-faint)',
                }} />
              </div>
            </div>
          )
        })()}

        </div>{/* fim coluna direita */}
      </div>

      {/* -- Alertas -- */}
      {hasAlerts && (
        <div className={pendingPlans.length > 0 && lowStockItems.length > 0 ? 'rg-2' : undefined} style={{ gap: 16 }}>

          {/* Planos aguardando checkout */}
          {pendingPlans.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid #fde68a' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb' }}>
                <ClipboardList size={14} color="#d97706" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                  Planos aguardando checkout
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 800,
                  background: '#d97706', color: '#fff',
                  padding: '2px 8px', borderRadius: 10,
                }}>
                  {pendingPlans.length}
                </span>
              </div>
              <div>
                {pendingPlans.slice(0, 5).map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      padding: '11px 18px',
                      borderBottom: i < Math.min(pendingPlans.length, 5) - 1 ? '1px solid var(--hairline)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.clientName}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        {p.branchName} · {timeSince(p.createdAt)}
                      </p>
                    </div>
                    <a
                      href={`/${p.branchSlug}/checkout/${p.id}`}
                      style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textDecoration: 'none', whiteSpace: 'nowrap' }}
                    >
                      Checkout →
                    </a>
                  </div>
                ))}
                {pendingPlans.length > 5 && (
                  <div style={{ padding: '10px 18px', borderTop: '1px solid var(--hairline)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    +{pendingPlans.length - 5} mais
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Estoque crítico */}
          {lowStockItems.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid #fecaca' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8, background: '#fff1f2' }}>
                <Package size={14} color="#dc2626" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>
                  Estoque crítico
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 800,
                  background: '#dc2626', color: '#fff',
                  padding: '2px 8px', borderRadius: 10,
                }}>
                  {lowStockItems.length}
                </span>
              </div>
              <div>
                {lowStockItems.slice(0, 5).map((item, i) => (
                  <div
                    key={`${item.productName}-${item.branchName}`}
                    style={{
                      padding: '11px 18px',
                      borderBottom: i < Math.min(lowStockItems.length, 5) - 1 ? '1px solid var(--hairline)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.productName}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        {item.branchName} · {item.currentStock} de {item.minStock} mín.
                      </p>
                    </div>
                    <a
                      href={`/${item.branchSlug}/stock`}
                      style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textDecoration: 'none', whiteSpace: 'nowrap' }}
                    >
                      Ver →
                    </a>
                  </div>
                ))}
                {lowStockItems.length > 5 && (
                  <div style={{ padding: '10px 18px', borderTop: '1px solid var(--hairline)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    +{lowStockItems.length - 5} mais
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {/* ══════════════════════════════════════════════════════════════
          SEÇÃO: OCUPAÇÃO
      ══════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Ocupação por filial" />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Taxa de aproveitamento</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>
              horários passados concluídos ÷ total marcado
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{monthLabel}</span>
        </div>

        {branchOccupancy.length === 0 ? (
          <p style={{ padding: '24px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
            Sem agendamentos registrados no período.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {branchOccupancy.map((b, i) => {
              const pct    = b.occupancyPct
              const color  = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626'
              const barBg  = pct >= 80 ? '#dcfce7' : pct >= 60 ? '#fef3c7' : '#fee2e2'
              return (
                <div
                  key={b.slug}
                  className="flex-wrap-mobile"
                  style={{
                    padding: '14px 20px',
                    borderBottom: i < branchOccupancy.length - 1 ? '1px solid var(--hairline)' : 'none',
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr 120px 200px',
                    alignItems: 'center',
                    gap: 20,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {/* Nome */}
                  <a
                    href={`/${b.slug}/agenda`}
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
                  >
                    {b.name}
                  </a>

                  {/* Barra */}
                  <AnimatedBar pct={pct} color={color} height={8} borderRadius={4} />

                  {/* % */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AnimatedNum value={pct} format="pct" style={{
                      fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em',
                      color,
                    }} />
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                      background: barBg, color,
                    }}>
                      {pct >= 80 ? 'Alta' : pct >= 60 ? 'Média' : 'Baixa'}
                    </span>
                  </div>

                  {/* Detalhes */}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>{b.completed} concluídos</span>
                    <span>{b.cancelled} cancelados</span>
                    <span>{b.noShow} no-show</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SEÇÃO: PROCEDIMENTOS
      ══════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Procedimentos" />

      <div className="kpi-grid" style={{ gap: 16, alignItems: 'start' }}>

        {/* Ranking - Procedimentos realizados */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Procedimentos realizados</span>
          </div>
          {topProcedures.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem dados de procedimentos no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topProcedures.map((p, i) => (
                <MiniBarRow
                  key={i} rank={i + 1} name={p.name}
                  label={`${p.count} atend.`} pct={p.pct}
                />
              ))}
            </div>
          )}
        </div>

        {/* Ranking - Recorrência */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Recorrência</span>
          </div>
          {topRecurring.filter(p => p.repeatVisits > 0).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem retornos no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(() => {
                const filtered = topRecurring.filter(p => p.repeatVisits > 0)
                const maxV = filtered[0]?.repeatVisits ?? 1
                return filtered.map((p, i) => (
                  <MiniBarRow
                    key={i} rank={i + 1} name={p.name}
                    label={`${p.repeatVisits} retorno${p.repeatVisits !== 1 ? 's' : ''}`}
                    pct={(p.repeatVisits / maxV) * 100}
                  />
                ))
              })()}
            </div>
          )}
        </div>

        {/* Ranking - Procedimentos por receita bruta */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Procedimentos por receita bruta</span>
          </div>
          {topProceduresByRevenue.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem dados de receita no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topProceduresByRevenue.map((p, i) => (
                <MiniBarRow
                  key={i} rank={i + 1} name={p.name}
                  label={p.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} pct={p.pct}
                />
              ))}
            </div>
          )}
        </div>

        {/* Ranking - Procedimentos por margem */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Procedimentos por margem</span>
          </div>
          {procedureMargins.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 18px' }}>
              Sem custo variável cadastrado nos procedimentos.
            </p>
          ) : (
            <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Procedimento', 'Preço', 'Margem'].map(h => (
                    <th key={h} style={{
                      padding: '9px 14px', textAlign: h === 'Procedimento' ? 'left' : 'right',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {procedureMargins.map((p, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: i < procedureMargins.length - 1 ? '1px solid var(--hairline)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text)', maxWidth: 160 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 800,
                        color: p.marginPct >= 70 ? '#16a34a' : p.marginPct >= 40 ? '#d97706' : '#dc2626',
                      }}>
                        {p.marginPct.toFixed(1).replace('.', ',')}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════
          SEÇÃO: PROFISSIONAIS
      ══════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Profissionais" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, alignItems: 'start' }}>

        {/* Ranking — Mais solicitados */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Mais solicitados</span>
          </div>
          {topProfessionals.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem dados no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topProfessionals.map((p, i) => (
                <MiniBarRow key={i} rank={i + 1} name={p.name} label={`${p.count} atend.`} pct={p.pct} accent="#3b82f6" />
              ))}
            </div>
          )}
        </div>

        {/* Ranking — Vendas */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Vendas</span>
          </div>
          {topProfessionalsByRevenue.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem dados no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topProfessionalsByRevenue.map((p, i) => (
                <MiniBarRow
                  key={i} rank={i + 1} name={p.name}
                  label={p.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  pct={p.pct} accent="#3b82f6"
                />
              ))}
            </div>
          )}
        </div>

        {/* Ranking — Comissão */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Comissão</span>
          </div>
          {topProfessionalsByCommission.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem comissões no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topProfessionalsByCommission.map((p, i) => (
                <MiniBarRow
                  key={i} rank={i + 1} name={p.name}
                  label={p.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  pct={p.pct} accent="#3b82f6"
                />
              ))}
            </div>
          )}
        </div>

        {/* Melhor avaliados */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>★ Melhor avaliados</span>
          </div>
          {bestRatedPros.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 18px' }}>Sem avaliações no período.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {bestRatedPros.map((p, i) => (
                  <tr key={i} style={{ borderBottom: i < bestRatedPros.length - 1 ? '1px solid var(--hairline)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 14px', width: 28 }}><span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-faint)' }}>{i + 1}</span></td>
                    <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}><RatingBadge value={p.avgRating} /></td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{p.count} aval.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pior avaliados */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: '#fff1f2' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠ Pior avaliados</span>
          </div>
          {worstRatedPros.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 18px' }}>Sem avaliações no período.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {worstRatedPros.map((p, i) => (
                  <tr key={i} style={{ borderBottom: i < worstRatedPros.length - 1 ? '1px solid var(--hairline)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 14px', width: 28 }}><span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-faint)' }}>{i + 1}</span></td>
                    <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}><RatingBadge value={p.avgRating} /></td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{p.count} aval.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SEÇÃO: CLIENTES
      ══════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Clientes" />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Ranking — Valor gasto */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Valor gasto</span>
          </div>
          {topClients.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '24px 20px' }}>Sem dados de clientes no período.</p>
          ) : (
            <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Cliente', 'Valor gasto', 'Atend.', 'Ticket médio'].map((h, i) => (
                    <th key={h} style={{
                      padding: i === 0 ? '9px 8px 9px 18px' : '9px 16px',
                      textAlign: i <= 1 ? 'left' : 'right',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      width: i === 0 ? 32 : undefined,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topClients.map((c, i) => {
                  const ticketC = c.appointmentCount > 0 ? c.totalSpent / c.appointmentCount : 0
                  return (
                    <tr key={c.id}
                      style={{ borderBottom: i < topClients.length - 1 ? '1px solid var(--hairline)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '12px 8px 12px 18px', fontSize: 12, fontWeight: 800, color: 'var(--text-faint)', width: 32 }}>{i + 1}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#16a34a', whiteSpace: 'nowrap' }}>
                        {c.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-muted)' }}>{c.appointmentCount}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {ticketC > 0 ? ticketC.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Ranking — Recorrência */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Recorrência</span>
          </div>
          {topClientsByRecurrence.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem dados no período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topClientsByRecurrence.map((c, i) => (
                <MiniBarRow key={i} rank={i + 1} name={c.name}
                  label={`${c.count} atend.`} pct={c.pct} />
              ))}
            </div>
          )}
        </div>

        {/* Faixa etária — pizza */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 12 }}>
            Faixa etária
          </span>
          {clientAgeGroups.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
              Sem data de nascimento cadastrada.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={clientAgeGroups}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={72}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="label"
                    animationBegin={0}
                    animationDuration={900}
                  >
                    {clientAgeGroups.map((_, i) => (
                      <Cell key={i} fill={AGE_PIE_COLORS[i % AGE_PIE_COLORS.length]} stroke="var(--surface)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <RechartsTip
                    formatter={(value, name) =>
                      [`${value} cliente${Number(value) !== 1 ? 's' : ''}`, String(name)]
                    }
                    contentStyle={{
                      fontSize: 11, borderRadius: 6,
                      border: '1px solid var(--border)',
                      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                {clientAgeGroups.map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                        background: AGE_PIE_COLORS[i % AGE_PIE_COLORS.length],
                      }} />
                      <span style={{ fontSize: 11, color: 'var(--text)' }}>{g.label}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                      {g.count} · {g.pct.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Ranking — Localização */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Ranking — Localização</span>
          </div>
          {topClientsByLocation.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>Sem cidade cadastrada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topClientsByLocation.map((l, i) => (
                <MiniBarRow key={i} rank={i + 1} name={l.city}
                  label={`${l.count} cliente${l.count !== 1 ? 's' : ''}`} pct={l.pct} />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════
          SEÇÃO: HOTMAP
      ══════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Hotmap" />

      <HotmapSection
        rawBranches={hotmapRawBranches}
        rawCepCounts={hotmapRawCepCounts}
        rawCepLtv={hotmapRawCepLtv}
      />

    </div>
  )
}
