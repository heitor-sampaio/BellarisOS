'use client'

import { type ReactNode } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'

// -- Palette -------------------------------------------------------------------
export const CHART_COLORS = ['#c34d6b', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#64748b']

// -- Formatters ----------------------------------------------------------------
const _fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtBRLShort = (v: number): string => {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`
  return _fmtBRL(v)
}

export const fmtBRLFull = (v: number): string => _fmtBRL(v)

// -- Shared empty state --------------------------------------------------------
function EmptyChart({ msg = 'Sem dados no período.' }: { msg?: string }) {
  return (
    <div style={{
      padding: '28px 0', textAlign: 'center',
      fontSize: 12, color: 'var(--text-faint)',
    }}>
      {msg}
    </div>
  )
}

// -- HBarChart -----------------------------------------------------------------
export function HBarChart({
  data,
  color = CHART_COLORS[0],
  formatValue = fmtBRLShort,
  emptyMsg,
}: {
  data: { name: string; value: number }[]
  color?: string
  formatValue?: (v: number) => string
  emptyMsg?: string
}) {
  const rows = data.filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  if (!rows.length) return <EmptyChart msg={emptyMsg} />

  const h = Math.max(100, Math.min(rows.length * 46, 400))
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 92, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 0" horizontal={false} stroke="var(--hairline,#f4ebe8)" />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: 'var(--text-faint)' }}
          tickLine={false} axisLine={false}
          tickFormatter={formatValue}
        />
        <YAxis
          type="category" dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickLine={false} axisLine={false} width={130}
        />
        <Tooltip
          formatter={(v) => [formatValue(Number(v ?? 0)), '']}
          contentStyle={{
            background: 'white', border: '1px solid var(--border,#f0e6e3)',
            borderRadius: 10, fontSize: 12,
          }}
          cursor={{ fill: 'var(--hairline,#f4ebe8)' }}
        />
        <Bar
          dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22}
          label={{ position: 'right', fontSize: 10, fill: 'var(--text-muted)', formatter: (v: unknown) => formatValue(Number(v ?? 0)) }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// -- WeekBarChart --------------------------------------------------------------
export function WeekBarChart({ data }: { data: { day: number; count: number }[] }) {
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const chartData = DAYS.map((name, i) => ({
    name,
    count: data.find(d => d.day === i)?.count ?? 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={176}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 0" stroke="var(--hairline)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickLine={false} axisLine={{ stroke: 'var(--border)' }}
        />
        <YAxis
          tick={{ fontSize: 9, fill: 'var(--text-faint)' }}
          tickLine={false} axisLine={false} allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 10, fontSize: 12,
          }}
        />
        <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// -- DonutChart ----------------------------------------------------------------
export function DonutChart({
  data,
  colors = CHART_COLORS,
  formatLabel,
}: {
  data: { name: string; value: number }[]
  colors?: string[]
  formatLabel?: (v: number, total: number) => string
}) {
  const rows = data.filter(d => d.value > 0)
  const total = rows.reduce((s, d) => s + d.value, 0)
  if (!total) return <EmptyChart />

  const fmt = formatLabel ?? ((v: number, tot: number) => `${((v / tot) * 100).toFixed(1)}%`)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ width: 152, height: 152, flexShrink: 0 }}>
        <PieChart width={152} height={152}>
          <Pie
            data={rows} cx={76} cy={76}
            innerRadius={44} outerRadius={68}
            dataKey="value" stroke="none"
            startAngle={90} endAngle={-270}
          >
            {rows.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip
            formatter={(v, name) => [fmt(Number(v ?? 0), total), String(name ?? '')]}
            contentStyle={{
              background: 'white', border: '1px solid var(--border)',
              borderRadius: 10, fontSize: 12,
            }}
          />
        </PieChart>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 3,
              background: colors[i % colors.length], flexShrink: 0,
            }} />
            <span style={{
              fontSize: 11, color: 'var(--text-muted)',
              flex: 1, minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {d.name}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
              {fmt(d.value, total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// -- MiniAreaChart -------------------------------------------------------------
export function MiniAreaChart({
  data,
  color = CHART_COLORS[0]!,
  height = 144,
}: {
  data: { label: string; value: number }[]
  color?: string
  height?: number
}) {
  if (!data.length || data.every(d => d.value === 0)) return <EmptyChart />
  const id = `mcg${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 0" stroke="var(--hairline)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: 'var(--text-faint)' }}
          tickLine={false} axisLine={{ stroke: 'var(--border)' }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: 'var(--text-faint)' }}
          tickLine={false} axisLine={false} allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 10, fontSize: 12,
          }}
        />
        <Area
          type="monotone" dataKey="value"
          stroke={color} strokeWidth={2}
          fill={`url(#${id})`} dot={false}
          activeDot={{ r: 4, fill: color, stroke: 'white', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// -- DreWaterfall --------------------------------------------------------------
export function DreWaterfall({
  receita, custoProdutos, despesas, lucro,
}: {
  receita: number
  custoProdutos: number
  despesas: number
  lucro: number
}) {
  const rows = [
    { label: 'Receita Bruta',          v: receita,       color: '#c34d6b', pct: 100 },
    { label: '− Custo de Insumos',      v: custoProdutos, color: '#dc2626', pct: receita > 0 ? (custoProdutos / receita) * 100 : 0 },
    { label: '− Despesas Operacionais', v: despesas,      color: '#d97706', pct: receita > 0 ? (despesas / receita) * 100 : 0 },
    {
      label: '= Lucro Operacional',
      v: lucro,
      color: lucro >= 0 ? '#16a34a' : '#dc2626',
      pct: receita > 0 ? Math.min(Math.abs(lucro / receita) * 100, 100) : 0,
    },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 6,
          }}>
            <span style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: i === 3 ? 700 : 500,
            }}>
              {r.label}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 800,
              color: r.color, letterSpacing: '-0.01em',
            }}>
              {_fmtBRL(r.v)}
            </span>
          </div>
          <div style={{
            height: i === 3 ? 8 : 5,
            background: 'var(--hairline)', borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(r.pct, 100)}%`, height: '100%',
              background: r.color, borderRadius: 4,
              transition: 'width 0.85s cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>
          {i < 3 && <div style={{ height: 1, background: 'var(--hairline)', marginTop: 14 }} />}
        </div>
      ))}
    </div>
  )
}

// -- SimpleTable ---------------------------------------------------------------
export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  width?: number | string
  render?: (value: any, row: any) => ReactNode
}

export function SimpleTable({
  columns,
  rows,
  emptyMsg = 'Nenhum registro no período.',
}: {
  columns: TableColumn[]
  rows: Record<string, any>[]
  emptyMsg?: string
}) {
  if (!rows.length) return <EmptyChart msg={emptyMsg} />
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '8px 12px',
                textAlign: col.align ?? 'left',
                fontSize: 10, fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap',
                width: col.width,
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{
              borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
            }}>
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '10px 12px',
                  textAlign: col.align ?? 'left',
                  color: 'var(--text)', maxWidth: 220,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// -- Badge helper --------------------------------------------------------------
export function Badge({
  label, color = 'gray',
}: {
  label: string
  color?: 'green' | 'amber' | 'red' | 'blue' | 'gray'
}) {
  const map = {
    green: { bg: '#dcfce7', text: '#16a34a' },
    amber: { bg: '#fef3c7', text: '#d97706' },
    red:   { bg: '#fee2e2', text: '#dc2626' },
    blue:  { bg: '#dbeafe', text: '#2563eb' },
    gray:  { bg: 'var(--hairline)', text: 'var(--text-muted)' },
  }
  const { bg, text } = map[color]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 10,
      fontWeight: 700,
      background: bg,
      color: text,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
