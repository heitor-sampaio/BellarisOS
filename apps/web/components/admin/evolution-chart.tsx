'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { numericAxisWidth } from '@/lib/chart-utils'

export interface ChartPoint {
  day:     number
  revenue: number
  cost:    number
  profit:  number
}

interface Props {
  data:         ChartPoint[]
  monthLabel:   string
  granularity?: 'hour' | 'day'
}

const COLORS = {
  revenue: 'var(--brand)',
  cost:    'var(--danger)',
  profit:  'var(--success)',
}

const LABELS: Record<string, string> = {
  revenue: 'Faturamento',
  cost:    'Custo',
  profit:  'Lucro',
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtAxis(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return `${v}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-field-token)',
      padding: '12px 16px',
      boxShadow: 'var(--shadow-popover)',
      fontFamily: 'var(--font-sans-custom)',
      minWidth: 180,
    }}>
      <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
        Dia {label}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 600, color: '#666' }}>{LABELS[entry.dataKey]}</span>
          </div>
          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: entry.color }}>{fmtBRL(Number(entry.value))}</span>
        </div>
      ))}
    </div>
  )
}

function CustomLegend({ payload }: any) {
  return (
    <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end', paddingRight: 8 }}>
      {payload?.map((entry: any) => (
        <div key={entry.dataKey ?? entry.value} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 24, height: 3, borderRadius: 2, background: entry.color }} />
          <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>
            {LABELS[entry.dataKey ?? entry.value] ?? entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function EvolutionChart({ data, monthLabel, granularity = 'day' }: Props) {
  if (!data.length) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
        Sem movimentações no período.
      </div>
    )
  }

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
  const totalCost    = data.reduce((s, d) => s + d.cost,    0)
  const totals = { revenue: totalRevenue, cost: totalCost, profit: totalRevenue - totalCost }
  const yAxisW = numericAxisWidth(data.flatMap(d => [d.revenue, d.cost, d.profit]), fmtAxis)

  return (
    <div style={{ padding: '18px 20px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
          Evolução — {monthLabel}
        </span>
        {/* A legenda tem três valores em reais: com `gap: 20` fixo e sem quebra
            ela estourava 11px da tela do celular. Quebra em duas linhas quando
            não cabe, e o vão encolhe antes disso. */}
        <div style={{ display: 'flex', gap: '10px 20px', flexWrap: 'wrap', minWidth: 0 }}>
          {(['revenue', 'cost', 'profit'] as const).map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 3, borderRadius: 2, background: COLORS[k] }} />
              <div>
                <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  {LABELS[k]}
                </p>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: COLORS[k], margin: 0, letterSpacing: '-0.01em' }}>
                  {fmtBRL(totals[k])}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"   stopColor={COLORS.revenue} stopOpacity={0.18} />
              <stop offset="95%"  stopColor={COLORS.revenue} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"   stopColor={COLORS.cost}    stopOpacity={0.12} />
              <stop offset="95%"  stopColor={COLORS.cost}    stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"   stopColor={COLORS.profit}  stopOpacity={0.18} />
              <stop offset="95%"  stopColor={COLORS.profit}  stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 0"
            stroke="var(--hairline, var(--hairline))"
            vertical={false}
          />

          <XAxis
            dataKey="day"
            tick={{ fontSize: 'var(--text-overline)', fill: 'var(--text-faint, var(--text-faint))', fontFamily: 'var(--font-sans-custom)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border, var(--border))' }}
            tickFormatter={v => granularity === 'hour' ? `${v}h` : String(v)}
            interval={data.length <= 10 ? 0 : Math.floor(data.length / 6)}
          />

          <YAxis
            tick={{ fontSize: 'var(--text-overline)', fill: 'var(--text-faint, var(--text-faint))', fontFamily: 'var(--font-sans-custom)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtAxis}
            width={yAxisW}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border, var(--border))', strokeWidth: 1.5, strokeDasharray: '4 3' }} />

          <Area
            type="monotone" dataKey="revenue"
            stroke={COLORS.revenue} strokeWidth={2.5}
            fill="url(#gradRevenue)"
            dot={false} activeDot={{ r: 5, fill: COLORS.revenue, stroke: 'var(--surface)', strokeWidth: 2 }}
            animationDuration={1000} animationEasing="ease-out"
          />
          <Area
            type="monotone" dataKey="cost"
            stroke={COLORS.cost} strokeWidth={2}
            fill="url(#gradCost)"
            strokeDasharray="6 3"
            dot={false} activeDot={{ r: 4, fill: COLORS.cost, stroke: 'var(--surface)', strokeWidth: 2 }}
            animationDuration={1100} animationEasing="ease-out"
          />
          <Area
            type="monotone" dataKey="profit"
            stroke={COLORS.profit} strokeWidth={2.5}
            fill="url(#gradProfit)"
            dot={false} activeDot={{ r: 5, fill: COLORS.profit, stroke: 'var(--surface)', strokeWidth: 2 }}
            animationDuration={1200} animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
