'use client'

import { useMemo, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Wallet, Receipt,
  Clock, BarChart2, Plus, ArrowUpRight, ArrowDownRight,
  Users, CheckCircle2, Gift,
} from 'lucide-react'
import { FinancialTransactionModal }                        from './financial-transaction-modal'
import { ClientCreditModal, ClientCreditModalHandle }       from './client-credit-modal'
import { FinancialTable, Transaction }                      from './financial-table'

// --- Types --------------------------------------------------------

interface PrevTx { type: 'INCOME' | 'EXPENSE'; amount: number; is_paid: boolean }

interface CommissionEntry {
  id:               string
  professionalId:   string
  professionalName: string
  amount:           number
  isPaid:           boolean
  createdAt:        string
}

interface Props {
  branchId:         string
  branchName:       string
  slug:             string
  period:           string
  periodLabel:      string
  periodStart:      string
  customFrom?:      string
  customTo?:        string
  transactions:     Transaction[]
  prevTransactions: PrevTx[]
  commissions:      CommissionEntry[]
  canReverse:       boolean
  canWrite:         boolean
  clients:          { id: string; name: string }[]
}

// --- Helpers ------------------------------------------------------

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtShort = (v: number): string => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`
  return fmtBRL(v)
}

const PM_LABELS: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'PIX',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}
const PM_COLORS: Record<string, string> = {
  CASH:            '#16a34a',
  PIX:             '#2563eb',
  DEBIT_CARD:      '#7c3aed',
  CREDIT_CARD:     '#c2410c',
  INTERNAL_CREDIT: '#c34d6b',
}

const PERIOD_OPTIONS = [
  { value: 'today',      label: 'Hoje' },
  { value: 'week',       label: 'Esta semana' },
  { value: 'month',      label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'quarter',    label: 'Últimos 90 dias' },
  { value: 'custom',     label: 'Personalizado' },
]

function delta(curr: number, prev: number): { pct: number; up: boolean; neutral: boolean } {
  if (prev === 0 && curr === 0) return { pct: 0, up: true, neutral: true }
  if (prev === 0) return { pct: 100, up: true, neutral: false }
  const pct = ((curr - prev) / prev) * 100
  return { pct: Math.abs(pct), up: pct >= 0, neutral: false }
}

// --- KPI Card -----------------------------------------------------

function KpiCardFull({
  label, curr, prev, icon, iconBg, valueColor, invertDelta = false, format = fmtBRL, highlight = false,
}: {
  label:         string
  curr:          number
  prev:          number
  icon:          React.ReactNode
  iconBg:        string
  valueColor?:   string
  invertDelta?:  boolean
  format?:       (v: number) => string
  highlight?:    boolean
}) {
  const d = delta(curr, prev)
  const isGood = invertDelta ? !d.up : d.up

  const hl = highlight
  const cardBg     = hl ? 'var(--brand)'           : undefined
  const labelColor = hl ? 'rgba(255,255,255,0.65)'  : 'var(--text-muted)'
  const valColor   = hl ? '#fff'                    : (valueColor ?? 'var(--text)')
  const iconBgFin  = hl ? 'rgba(255,255,255,0.18)'  : iconBg
  const deltaGood  = hl ? '#fff'                    : (isGood ? '#16a34a' : '#dc2626')
  const deltaBad   = hl ? 'rgba(255,255,255,0.65)'  : (isGood ? '#16a34a' : '#dc2626')
  const deltaColor = isGood ? deltaGood : deltaBad
  const mutedColor = hl ? 'rgba(255,255,255,0.5)'   : 'var(--text-faint)'

  return (
    <div className="card" style={{
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      background: cardBg,
      boxShadow: hl ? '0 4px 16px rgba(195,77,107,0.35)' : undefined,
      border: hl ? 'none' : undefined,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 9.5, fontWeight: 700, color: labelColor, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </p>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: iconBgFin,
        }}>
          {icon}
        </div>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: valColor, lineHeight: 1 }}>
        {format(curr)}
      </p>
      {!d.neutral ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {d.up
            ? <ArrowUpRight   size={10} style={{ color: deltaColor }} />
            : <ArrowDownRight size={10} style={{ color: deltaColor }} />}
          <span style={{ fontSize: 10, fontWeight: 700, color: deltaColor }}>
            {d.pct.toFixed(1).replace('.', ',')}%
          </span>
          <span style={{ fontSize: 10, color: mutedColor }}>vs anterior</span>
        </div>
      ) : (
        <span style={{ fontSize: 10, color: mutedColor }}>sem dados anteriores</span>
      )}
    </div>
  )
}

// --- Evolution Chart (SVG bar chart) -----------------------------

interface BarDatum { label: string; income: number; expense: number }

function groupByPeriod(
  txs: Transaction[],
  period: string,
  startISO: string,
): BarDatum[] {
  const start = new Date(startISO)

  if (period === 'today') {
    const hours: BarDatum[] = Array.from({ length: 24 }, (_, h) => ({
      label: `${h}h`, income: 0, expense: 0,
    }))
    txs.forEach(tx => {
      if (!tx.is_paid) return
      const h = new Date(tx.created_at).getHours()
      if (tx.type === 'INCOME')  hours[h]!.income  += Number(tx.amount)
      if (tx.type === 'EXPENSE') hours[h]!.expense += Number(tx.amount)
    })
    return hours
  }

  if (period === 'quarter') {
    const weeks: Record<string, BarDatum> = {}
    txs.forEach(tx => {
      if (!tx.is_paid) return
      const d = new Date(tx.created_at)
      const ws = new Date(d)
      ws.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = ws.toISOString().slice(0, 10)
      if (!weeks[key]) {
        weeks[key] = {
          label: ws.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          income: 0, expense: 0,
        }
      }
      if (tx.type === 'INCOME')  weeks[key].income  += Number(tx.amount)
      if (tx.type === 'EXPENSE') weeks[key].expense += Number(tx.amount)
    })
    return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }

  // Day-by-day
  const map: Record<string, BarDatum> = {}
  const cur = new Date(start)
  cur.setHours(0, 0, 0, 0)
  const now = new Date()
  while (cur <= now) {
    const key = cur.toISOString().slice(0, 10)
    map[key] = {
      label: cur.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      income: 0, expense: 0,
    }
    cur.setDate(cur.getDate() + 1)
  }
  txs.forEach(tx => {
    if (!tx.is_paid) return
    const key = tx.created_at.slice(0, 10)
    if (!map[key]) return
    if (tx.type === 'INCOME')  map[key].income  += Number(tx.amount)
    if (tx.type === 'EXPENSE') map[key].expense += Number(tx.amount)
  })
  return Object.values(map)
}

function EvolutionChart({ data }: { data: BarDatum[] }) {
  const H        = 130
  const barW     = 8
  const gap      = 4
  const groupW   = barW * 2 + gap + 6
  const totalW   = Math.max(data.length * groupW, 400)
  const maxVal   = Math.max(...data.flatMap(d => [d.income, d.expense]), 1)
  const gridLines = 4

  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <svg
        viewBox={`0 0 ${totalW} ${H + 36}`}
        width={totalW}
        height={H + 36}
        style={{ display: 'block', minWidth: '100%' }}
      >
        {/* Grid lines */}
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const y = H - (i / gridLines) * H
          return (
            <line
              key={i}
              x1={0} y1={y} x2={totalW} y2={y}
              stroke="var(--border)" strokeWidth={0.5}
              strokeDasharray={i === 0 ? 'none' : '3,3'}
            />
          )
        })}

        {data.map((d, i) => {
          const x = i * groupW + 2
          const incH = maxVal > 0 ? (d.income  / maxVal) * H : 0
          const expH = maxVal > 0 ? (d.expense / maxVal) * H : 0
          const showLabel = data.length <= 31 || i % Math.ceil(data.length / 15) === 0

          return (
            <g key={i}>
              {/* Income bar */}
              {d.income > 0 && (
                <rect
                  x={x} y={H - incH} width={barW} height={incH}
                  fill="#16a34a" opacity={0.85} rx={2}
                >
                  <title>{`Receitas: ${fmtBRL(d.income)}`}</title>
                </rect>
              )}
              {/* Expense bar */}
              {d.expense > 0 && (
                <rect
                  x={x + barW + gap} y={H - expH} width={barW} height={expH}
                  fill="#dc2626" opacity={0.75} rx={2}
                >
                  <title>{`Despesas: ${fmtBRL(d.expense)}`}</title>
                </rect>
              )}
              {/* X label */}
              {showLabel && (
                <text
                  x={x + barW}
                  y={H + 18}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="var(--text-faint)"
                >
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// --- Payment Method Donut -----------------------------------------

interface DonutSegment { label: string; value: number; color: string }

function DonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const R    = 52
  const CX   = 75
  const CY   = 75
  const circ = 2 * Math.PI * R

  if (total === 0) {
    return (
      <svg viewBox="0 0 150 150" width={150} height={150}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={16} />
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize={11} fill="var(--text-faint)" fontWeight={700}>
          Sem dados
        </text>
      </svg>
    )
  }

  // Rotate each segment by accumulating angles; start at -90° (12 o'clock)
  let cumRotate = -90
  return (
    <svg viewBox="0 0 150 150" width={150} height={150}>
      {/* Track ring */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--bg-app)" strokeWidth={16} />

      {segments.map((seg, i) => {
        const pct       = seg.value / total
        const dashLen   = pct * circ
        const rotate    = cumRotate
        cumRotate      += pct * 360
        return (
          <circle
            key={i}
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={14}
            strokeLinecap="butt"
            strokeDasharray={`${dashLen} ${circ - dashLen}`}
            transform={`rotate(${rotate} ${CX} ${CY})`}
          >
            <title>{`${seg.label}: ${fmtBRL(seg.value)}`}</title>
          </circle>
        )
      })}

      {/* Center text */}
      <text x={CX} y={CY - 5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--text-muted)" letterSpacing="0.04em">
        RECEITAS
      </text>
      <text x={CX} y={CY + 11} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--text)">
        {fmtBRL(total)}
      </text>
    </svg>
  )
}

// --- Category Horizontal Bars -------------------------------------

function CategoryBars({
  items, color,
}: { items: { label: string; value: number; pct: number }[]; color: string }) {
  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--text-faint)', fontSize: 12.5, textAlign: 'center', padding: '16px 0' }}>
        Nenhum lançamento
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 6).map(item => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{item.label}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color }}>
              {fmtBRL(item.value)}
            </span>
          </div>
          <div style={{
            height: 5, background: 'var(--bg-app)', borderRadius: 99,
            overflow: 'hidden', border: '1px solid var(--hairline)',
          }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${Math.max(item.pct, 2)}%`,
              background: color, opacity: 0.8,
              transition: 'width 600ms ease',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, display: 'block' }}>
            {item.pct.toFixed(0)}% do total
          </span>
        </div>
      ))}
    </div>
  )
}

// --- Commissions Card ---------------------------------------------

function CommissionsCard({ entries }: { entries: CommissionEntry[] }) {
  const totalComm = entries.reduce((s, e) => s + e.amount, 0)
  const totalPaid = entries.filter(e => e.isPaid).reduce((s, e) => s + e.amount, 0)

  // Agrupa por profissional mantendo a ordem de inserção
  const groups: { id: string; name: string; items: CommissionEntry[] }[] = []
  const seen: Record<string, number> = {}
  for (const e of entries) {
    if (seen[e.professionalId] === undefined) {
      seen[e.professionalId] = groups.length
      groups.push({ id: e.professionalId, name: e.professionalName, items: [] })
    }
    groups[seen[e.professionalId]!]!.items.push(e)
  }

  return (
    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
        Comissões
      </p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
        {groups.length} profissional{groups.length !== 1 ? 'is' : ''} · {entries.length} lançamentos
      </p>

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--hairline)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</span>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--brand)' }}>
            {fmtBRL(totalComm)}
          </span>
          {totalPaid > 0 && totalPaid < totalComm && (
            <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
              {fmtBRL(totalPaid)} pago
            </p>
          )}
        </div>
      </div>

      {/* Lista por profissional */}
      {entries.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '12px 0' }}>
          Sem comissões no período
        </p>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1, maxHeight: 280 }}>
          {groups.map((group, gi) => {
            const groupTotal = group.items.reduce((s, i) => s + i.amount, 0)
            const initials   = group.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div key={group.id} style={{ marginBottom: gi < groups.length - 1 ? 12 : 0 }}>
                {/* Profissional header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                    background: 'var(--brand-soft)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 800, color: 'var(--brand)',
                  }}>
                    {initials}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.name}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>
                    {fmtBRL(groupTotal)}
                  </span>
                </div>

                {/* Itens do profissional */}
                <div style={{ paddingLeft: 29, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {group.items.map((item, ii) => (
                    <div key={item.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '5px 0',
                      borderBottom: ii < group.items.length - 1 ? '1px solid var(--hairline)' : 'none',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(item.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
                          {fmtBRL(item.amount)}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 99,
                          background: item.isPaid ? '#f0fdf4' : '#fffbeb',
                          color:      item.isPaid ? '#16a34a' : '#d97706',
                          border:     `1px solid ${item.isPaid ? '#86efac' : '#fcd34d'}`,
                        }}>
                          {item.isPaid ? 'Pago' : 'Pend.'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Main Hub -----------------------------------------------------

export function FinancialHub({
  branchId, branchName, slug,
  period, periodLabel, periodStart,
  customFrom, customTo,
  transactions, prevTransactions,
  commissions,
  canReverse,
  canWrite,
  clients,
}: Props) {
  const router              = useRouter()
  const [, startTransition] = useTransition()
  const creditModalRef      = useRef<ClientCreditModalHandle>(null)

  function navigatePeriod(p: string) {
    startTransition(() => { router.push(`?period=${p}`) })
  }

  // -- KPIs ------------------------------------------------------
  const { income, expense, pendingIncome, pendingExpense, avgTicket } = useMemo(() => {
    const paid      = transactions.filter(t => t.is_paid && t.notes !== 'Estornada')
    const unpaid    = transactions.filter(t => !t.is_paid)
    const income    = paid.filter(t => t.type === 'INCOME').reduce((s, t)  => s + Number(t.amount), 0)
    const expense   = paid.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
    const pendingIncome  = unpaid.filter(t => t.type === 'INCOME').reduce((s, t)  => s + Number(t.amount), 0)
    const pendingExpense = unpaid.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
    const incomeTxs = paid.filter(t => t.type === 'INCOME')
    return { income, expense, pendingIncome, pendingExpense, avgTicket: incomeTxs.length > 0 ? income / incomeTxs.length : 0 }
  }, [transactions])

  const { prevIncome, prevExpense, prevPendingIncome, prevPendingExpense } = useMemo(() => {
    const paid   = prevTransactions.filter(t => t.is_paid)
    const unpaid = prevTransactions.filter(t => !t.is_paid)
    return {
      prevIncome:         paid.filter(t => t.type === 'INCOME').reduce((s, t)  => s + Number(t.amount), 0),
      prevExpense:        paid.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0),
      prevPendingIncome:  unpaid.filter(t => t.type === 'INCOME').reduce((s, t)  => s + Number(t.amount), 0),
      prevPendingExpense: unpaid.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0),
    }
  }, [prevTransactions])

  const saldo     = income - expense
  const prevSaldo = prevIncome - prevExpense

  // -- Charts ----------------------------------------------------
  const barData = useMemo(
    () => groupByPeriod(transactions, period, periodStart),
    [transactions, period, periodStart],
  )

  const { paymentSegments, paymentTotal } = useMemo(() => {
    const byMethod: Record<string, number> = {}
    transactions
      .filter(t => t.is_paid && t.type === 'INCOME' && t.payment_method && t.notes !== 'Estornada')
      .forEach(t => { byMethod[t.payment_method!] = (byMethod[t.payment_method!] ?? 0) + Number(t.amount) })
    const total = Object.values(byMethod).reduce((s, v) => s + v, 0)
    const segs  = Object.entries(byMethod)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => ({ label: PM_LABELS[k] ?? k, value: v, color: PM_COLORS[k] ?? '#aaa' }))
    return { paymentSegments: segs, paymentTotal: total }
  }, [transactions])

  const { incomeCategories, expenseCategories } = useMemo(() => {
    const inc: Record<string, number> = {}
    const exp: Record<string, number> = {}
    transactions.filter(t => t.is_paid && t.notes !== 'Estornada').forEach(t => {
      if (t.type === 'INCOME')  inc[t.category] = (inc[t.category] ?? 0) + Number(t.amount)
      if (t.type === 'EXPENSE') exp[t.category] = (exp[t.category] ?? 0) + Number(t.amount)
    })
    const toItems = (map: Record<string, number>, total: number) =>
      Object.entries(map).sort(([, a], [, b]) => b - a)
        .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    return { incomeCategories: toItems(inc, income), expenseCategories: toItems(exp, expense) }
  }, [transactions, income, expense])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <ClientCreditModal ref={creditModalRef} branchId={branchId} slug={slug} clients={clients} />

      {/* Header: título (esquerda) + seletores e botões (direita) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Financeiro
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {branchName} · {periodLabel}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg-bar" style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
            {PERIOD_OPTIONS.map(opt => {
              const active = period === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => navigatePeriod(opt.value)}
                  className={active ? 'btn-primary' : undefined}
                  style={{
                    padding: '6px 14px', fontSize: 12.5, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 100ms', fontFamily: 'inherit',
                    ...(active ? {} : {
                      borderRadius: 'var(--radius-field-token)',
                      border: '1px solid transparent',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                    }),
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date"
                defaultValue={customFrom}
                onChange={e => {
                  const from = e.target.value
                  const to   = customTo ?? new Date().toISOString().slice(0, 10)
                  router.push(`?period=custom&from=${from}&to=${to}`)
                }}
                className="field"
                style={{ width: 140, fontSize: 12, padding: '5px 10px' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>até</span>
              <input
                type="date"
                defaultValue={customTo}
                onChange={e => {
                  const to   = e.target.value
                  const from = customFrom ?? new Date().toISOString().slice(0, 10)
                  router.push(`?period=custom&from=${from}&to=${to}`)
                }}
                className="field"
                style={{ width: 140, fontSize: 12, padding: '5px 10px' }}
              />
            </div>
          )}
          {canWrite && (
            <>
              <button
                type="button" className="btn-secondary"
                onClick={() => creditModalRef.current?.open()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}
              >
                <Gift size={14} />
                Crédito para cliente
              </button>
              <FinancialTransactionModal
                branchId={branchId}
                slug={slug}
                trigger={<button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} />Novo lançamento</button>}
              />
            </>
          )}
        </div>
      </div>


      {/* KPI grid — 6 cards em linha */}
      <div className="kpi-grid">
        <KpiCardFull
          label="Lucro Líquido"
          curr={saldo} prev={prevSaldo}
          icon={<Wallet size={13} style={{ color: '#fff' }} />}
          iconBg="rgba(255,255,255,0.18)"
          highlight
        />
        <KpiCardFull
          label="Receita Bruta"
          curr={income} prev={prevIncome}
          icon={<TrendingUp size={13} style={{ color: '#16a34a' }} />}
          iconBg="#f0fdf4"
          valueColor="#16a34a"
        />
        <KpiCardFull
          label="Despesas"
          curr={expense} prev={prevExpense}
          icon={<TrendingDown size={13} style={{ color: '#dc2626' }} />}
          iconBg="#fef2f2"
          valueColor="#dc2626"
          invertDelta
        />
        <KpiCardFull
          label="Ticket Médio"
          curr={avgTicket} prev={0}
          icon={<BarChart2 size={13} style={{ color: '#2563eb' }} />}
          iconBg="#eff6ff"
          valueColor="#2563eb"
        />
        <KpiCardFull
          label="A Receber"
          curr={pendingIncome} prev={prevPendingIncome}
          icon={<Clock size={13} style={{ color: '#16a34a' }} />}
          iconBg="#f0fdf4"
          valueColor={pendingIncome > 0 ? '#16a34a' : 'var(--text)'}
        />
        <KpiCardFull
          label="A Pagar"
          curr={pendingExpense} prev={prevPendingExpense}
          icon={<Clock size={13} style={{ color: '#d97706' }} />}
          iconBg="#fffbeb"
          valueColor={pendingExpense > 0 ? '#d97706' : 'var(--text)'}
          invertDelta
        />
      </div>

      {/* Charts row — evolução | comissões | formas de pagamento */}
      <div className="rg-3">
        {/* Evolution */}
        <div className="card" style={{ padding: '20px 20px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Evolução financeira
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Receitas vs despesas realizadas
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: '#16a34a' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Receitas</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: '#dc2626' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Despesas</span>
              </div>
            </div>
          </div>
          <EvolutionChart data={barData} />
        </div>

        {/* Comissões */}
        <CommissionsCard entries={commissions} />

        {/* Formas de pagamento */}
        <div className="card" style={{ padding: '20px' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
            Formas de pagamento
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Receitas por método</p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <DonutChart segments={paymentSegments} total={paymentTotal} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {paymentSegments.map(seg => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{seg.label}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>
                    {paymentTotal > 0 ? ((seg.value / paymentTotal) * 100).toFixed(0) : 0}%
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)', marginLeft: 4 }}>
                    {fmtBRL(seg.value)}
                  </span>
                </div>
              </div>
            ))}
            {paymentSegments.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>Sem receitas pagas</p>
            )}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rg-2">
        <div className="card" style={{ padding: '20px' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
            Categorias de receita
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Top 6 categorias</p>
          <CategoryBars items={incomeCategories} color="#16a34a" />
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
            Categorias de despesa
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Top 6 categorias</p>
          <CategoryBars items={expenseCategories} color="#dc2626" />
        </div>
      </div>

      {/* Transactions */}
      <div>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: 12 }}>
          Lançamentos
        </p>
        <FinancialTable
          transactions={transactions}
          branchId={branchId}
          slug={slug}
          canReverse={canReverse}
        />
      </div>
    </div>
  )
}
