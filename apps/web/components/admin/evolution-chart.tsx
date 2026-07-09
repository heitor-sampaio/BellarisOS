'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

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
  revenue: '#7c3aed',
  cost:    '#dc2626',
  profit:  '#16a34a',
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
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`
  return `R$${v}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e8dde0',
      borderRadius: 12,
      padding: '12px 16px',
      boxShadow: '0 8px 24px -6px rgba(34,22,25,.14)',
      fontFamily: 'system-ui, sans-serif',
      minWidth: 180,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
        Dia {label}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#666' }}>{LABELS[entry.dataKey]}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: entry.color }}>{fmtBRL(Number(entry.value))}</span>
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
          <span style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.03em' }}>
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
      <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        Sem movimentações no período.
      </div>
    )
  }

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
  const totalCost    = data.reduce((s, d) => s + d.cost,    0)
  const totals = { revenue: totalRevenue, cost: totalCost, profit: totalRevenue - totalCost }

  return (
    <div style={{ padding: '18px 20px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          Evolução — {monthLabel}
        </span>
        <div style={{ display: 'flex', gap: 20 }}>
          {(['revenue', 'cost', 'profit'] as const).map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 3, borderRadius: 2, background: COLORS[k] }} />
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  {LABELS[k]}
                </p>
                <p style={{ fontSize: 12, fontWeight: 800, color: COLORS[k], margin: 0, letterSpacing: '-0.01em' }}>
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
            stroke="var(--hairline, #f0e8eb)"
            vertical={false}
          />

          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: 'var(--text-faint, #c5b0b8)', fontFamily: 'system-ui' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border, #e8dde0)' }}
            tickFormatter={v => granularity === 'hour' ? `${v}h` : String(v)}
            interval={data.length <= 10 ? 0 : Math.floor(data.length / 6)}
          />

          <YAxis
            tick={{ fontSize: 10, fill: 'var(--text-faint, #c5b0b8)', fontFamily: 'system-ui' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtAxis}
            width={44}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border, #e8dde0)', strokeWidth: 1.5, strokeDasharray: '4 3' }} />

          <Area
            type="monotone" dataKey="revenue"
            stroke={COLORS.revenue} strokeWidth={2.5}
            fill="url(#gradRevenue)"
            dot={false} activeDot={{ r: 5, fill: COLORS.revenue, stroke: 'white', strokeWidth: 2 }}
            animationDuration={1000} animationEasing="ease-out"
          />
          <Area
            type="monotone" dataKey="cost"
            stroke={COLORS.cost} strokeWidth={2}
            fill="url(#gradCost)"
            strokeDasharray="6 3"
            dot={false} activeDot={{ r: 4, fill: COLORS.cost, stroke: 'white', strokeWidth: 2 }}
            animationDuration={1100} animationEasing="ease-out"
          />
          <Area
            type="monotone" dataKey="profit"
            stroke={COLORS.profit} strokeWidth={2.5}
            fill="url(#gradProfit)"
            dot={false} activeDot={{ r: 5, fill: COLORS.profit, stroke: 'white', strokeWidth: 2 }}
            animationDuration={1200} animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
