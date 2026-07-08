import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedBranchBySlug } from '@/lib/cached-queries'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { RevenueBarChart } from '@/components/branch/revenue-bar-chart'
import { format, subMonths, subDays, startOfMonth, endOfMonth, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronRight, ArrowUpRight, ClipboardList } from 'lucide-react'

// --- Avatar colorido determinístico ------------------------------
const PALETTE = [
  { bg: '#e8f4f0', color: '#2a7a5e' },
  { bg: '#f0e8f4', color: '#7a2d68' },
  { bg: '#e8edf4', color: '#2d4e7a' },
  { bg: '#fef3e8', color: '#8a5a1a' },
  { bg: '#eef4e8', color: '#3a6a1a' },
  { bg: '#f4e8e8', color: '#7a2a2a' },
]
function avatarColor(name: string) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return PALETTE[h % PALETTE.length]!
}
function initials(name: string) {
  const p = name.trim().split(' ')
  return (p.length >= 2 ? p[0]![0]! + p[p.length - 1]![0]! : p[0]!.substring(0, 2)).toUpperCase()
}

// --- Avatar pill --------------------------------------------------
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const c = avatarColor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: c.bg, color: c.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 800,
    }}>
      {initials(name)}
    </div>
  )
}

// --- Status chips -------------------------------------------------
const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  SCHEDULED:   { label: 'Aguardando',  bg: 'var(--bg-app)',      color: 'var(--text-muted)' },
  CONFIRMED:   { label: 'Confirmado',  bg: 'var(--brand-soft)',  color: 'var(--brand)'      },
  IN_PROGRESS: { label: 'Em atend.',   bg: 'var(--warning-soft)',color: 'var(--warning)'    },
  COMPLETED:   { label: 'Concluído',   bg: 'var(--success-soft)',color: 'var(--success)'    },
  CANCELLED:   { label: 'Cancelado',   bg: 'var(--bg-app)',      color: 'var(--text-faint)' },
  NO_SHOW:     { label: 'Não veio',    bg: 'var(--bg-app)',      color: 'var(--text-faint)' },
}
function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.SCHEDULED!
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px',
      borderRadius: 99, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
      background: s.bg, color: s.color,
      border: status === 'SCHEDULED' ? '1px solid var(--border)' : 'none',
    }}>
      {s.label}
    </span>
  )
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function pct(a: number, b: number) {
  if (!b) return null
  const d = ((a - b) / b) * 100
  return { value: Math.abs(d).toFixed(1), up: d >= 0 }
}

// -----------------------------------------------------------------
export default async function BranchDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  const supabase = await createSupabase()

  const branch = await getCachedBranchBySlug(slug, ctx.tenantId!)
  if (!branch) notFound()

  const branchId = branch.id
  const now = new Date()
  const admin = createAdminClient()

  const canSeeCheckout = ['RECEPTIONIST', 'BRANCH_ADMIN', 'NETWORK_ADMIN'].includes(ctx.role)

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const monthStart = startOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd   = endOfMonth(subMonths(now, 1))
  const sixMonthsAgo   = startOfMonth(subMonths(now, 5))
  const thirtyDaysAgo  = subDays(now, 30)
  const ninetyDaysAgo  = subDays(now, 90)

  const [
    { count: pendingCheckouts },
    { data: monthRevTx },
    { data: lastMonthRevTx },
    { data: todayAppts },
    { count: professionalsCount },
    { count: monthCompletedCount },
    { data: sixMonthsTx },
    { data: procedureAppts },
    { data: recentVisitorIds },
    { data: allActiveClients },
    { count: newClientsCount },
  ] = await Promise.all([
    canSeeCheckout
      ? admin.from('treatment_plans').select('id', { count: 'exact', head: true })
          .eq('branch_id', branchId).eq('status', 'PROPOSED')
      : Promise.resolve({ count: 0 }),

    supabase.from('financial_transactions').select('amount')
      .eq('branch_id', branchId).eq('type', 'INCOME')
      .gte('created_at', monthStart.toISOString()),

    supabase.from('financial_transactions').select('amount')
      .eq('branch_id', branchId).eq('type', 'INCOME')
      .gte('created_at', lastMonthStart.toISOString())
      .lte('created_at', lastMonthEnd.toISOString()),

    supabase.from('appointments')
      .select('id, client_id, scheduled_at, duration_min, status, price, clients(name), procedures(name), users(name)')
      .eq('branch_id', branchId)
      .gte('scheduled_at', todayStart.toISOString())
      .lte('scheduled_at', todayEnd.toISOString())
      .order('scheduled_at'),

    supabase.from('users').select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId).in('role', ['BRANCH_ADMIN', 'PROFESSIONAL']).eq('is_active', true),

    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId).eq('status', 'COMPLETED')
      .gte('scheduled_at', monthStart.toISOString()),

    supabase.from('financial_transactions').select('amount, created_at')
      .eq('branch_id', branchId).eq('type', 'INCOME')
      .gte('created_at', sixMonthsAgo.toISOString()),

    supabase.from('appointments').select('procedure_id, procedures(name)')
      .eq('branch_id', branchId).eq('status', 'COMPLETED')
      .gte('scheduled_at', thirtyDaysAgo.toISOString()),

    supabase.from('appointments').select('client_id')
      .eq('branch_id', branchId)
      .in('status', ['COMPLETED', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'])
      .gte('scheduled_at', ninetyDaysAgo.toISOString()),

    supabase.from('clients').select('id, name, phone')
      .eq('branch_id', branchId).eq('is_active', true).limit(400),

    supabase.from('clients').select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId).gte('created_at', monthStart.toISOString()),
  ])

  // -- KPI calculations ------------------------------------------
  const monthRevenue   = (monthRevTx ?? []).reduce((s, t) => s + parseFloat(String(t.amount)), 0)
  const lastRevenue    = (lastMonthRevTx ?? []).reduce((s, t) => s + parseFloat(String(t.amount)), 0)
  const revDelta       = pct(monthRevenue, lastRevenue)
  const avgTicket      = monthCompletedCount ? monthRevenue / monthCompletedCount : 0

  const validToday     = (todayAppts ?? []).filter(a => !['CANCELLED', 'NO_SHOW'].includes(a.status))
  const todayCount     = validToday.length
  const awaitingCount  = validToday.filter(a => a.status === 'SCHEDULED').length
  const scheduledMin   = validToday.reduce((s, a) => s + (a.duration_min ?? 0), 0)
  const capacityMin    = (professionalsCount ?? 1) * 8 * 60
  const occupancy      = professionalsCount ? Math.min(Math.round((scheduledMin / capacityMin) * 100), 100) : 0

  // -- Chart -----------------------------------------------------
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(now, 5 - i)
    const key   = format(month, 'yyyy-MM')
    const label = format(month, 'MMM', { locale: ptBR })
    const value = (sixMonthsTx ?? [])
      .filter(t => t.created_at.substring(0, 7) === key)
      .reduce((s, t) => s + parseFloat(String(t.amount)), 0)
    return { label, value }
  })
  const semesterTotal = chartData.reduce((s, d) => s + d.value, 0)
  const semesterDelta = semesterTotal - chartData[0]!.value // vs. 6 months ago

  // -- Top procedimentos -----------------------------------------
  const procMap = new Map<string, { name: string; count: number }>()
  for (const a of (procedureAppts ?? [])) {
    const proc = a.procedures as unknown as { name: string } | null
    if (!proc) continue
    const curr = procMap.get(a.procedure_id)
    if (curr) curr.count++
    else procMap.set(a.procedure_id, { name: proc.name, count: 1 })
  }
  const topProcs   = [...procMap.values()].sort((a, b) => b.count - a.count).slice(0, 4)
  const maxProc    = topProcs[0]?.count ?? 1

  // -- Funil CRM -------------------------------------------------
  const totalActive        = allActiveClients?.length ?? 0
  const withScheduled      = new Set(validToday.filter(a => a.status === 'SCHEDULED').map(a => a.client_id ?? '')).size
  const withConfirmed      = new Set(validToday.filter(a => ['CONFIRMED', 'IN_PROGRESS'].includes(a.status)).map(a => a.client_id ?? '')).size
  const completedThisMonth = monthCompletedCount ?? 0
  const funnelMax = newClientsCount ?? 1

  const funnel = [
    { label: 'Novos este mês',   count: newClientsCount ?? 0,     color: 'var(--brand)' },
    { label: 'Agendados hoje',   count: withScheduled,            color: 'var(--brand-2)' },
    { label: 'Em atendimento',   count: withConfirmed,            color: 'var(--brand-3)' },
    { label: 'Concluídos no mês', count: completedThisMonth,      color: 'var(--success)' },
  ]

  // -- Reativar clientes -----------------------------------------
  const recentIds = new Set((recentVisitorIds ?? []).map(a => a.client_id))
  const inactiveClients = (allActiveClients ?? []).filter(c => !recentIds.has(c.id))

  type RC = { id: string; name: string; phone: string; daysSince: number | null }
  let toReactivate: RC[] = []

  if (inactiveClients.length > 0) {
    const ids = inactiveClients.slice(0, 60).map(c => c.id)
    const { data: lastAppts } = await supabase
      .from('appointments').select('client_id, scheduled_at')
      .in('client_id', ids).eq('status', 'COMPLETED')
      .order('scheduled_at', { ascending: false })

    const lastMap = new Map<string, string>()
    for (const a of (lastAppts ?? [])) {
      if (!lastMap.has(a.client_id)) lastMap.set(a.client_id, a.scheduled_at)
    }

    toReactivate = inactiveClients
      .map(c => ({
        ...c,
        daysSince: lastMap.has(c.id) ? differenceInDays(now, new Date(lastMap.get(c.id)!)) : null,
      }))
      .sort((a, b) => {
        if (a.daysSince === null) return -1
        if (b.daysSince === null) return 1
        return b.daysSince - a.daysSince
      })
      .slice(0, 3)
  }

  // -------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RealtimeRefresher tables={['appointments', 'financial_transactions', 'clients', 'treatment_plans']} />

      {/* -- Row 0: Header --------------------------------------- */}
      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 3 }}>
          {branch.name} · {format(now, "EEE, dd 'de' MMM yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* -- Checkout pendente ----------------------------------- */}
      {canSeeCheckout && (pendingCheckouts ?? 0) > 0 && (
        <Link href={`/${slug}/checkout`} style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 20px', borderRadius: 14,
            background: 'var(--brand-soft)', border: '1.5px solid var(--brand)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--brand)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(195,77,107,0.35)',
            }}>
              <ClipboardList size={16} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>
                {pendingCheckouts} paciente{(pendingCheckouts ?? 0) !== 1 ? 's' : ''} aguardando checkout
              </p>
              <p style={{ fontSize: 12, color: 'var(--brand)', opacity: 0.75, marginTop: 2 }}>
                Clique para revisar e finalizar os planos de tratamento
              </p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          </div>
        </Link>
      )}

      {/* -- Row 1: 4 KPI cards ---------------------------------- */}
      <div className="kpi-grid">

        {/* Faturamento — brand card */}
        <div style={{ background: 'var(--brand)', borderRadius: 18, padding: '22px 24px', boxShadow: 'var(--shadow-brand-card)', color: '#fff' }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>
            Faturamento do mês
          </p>
          <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1 }}>
            {formatBRL(monthRevenue)}
          </p>
          {revDelta && (
            <p style={{ fontSize: 11.5, marginTop: 10, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 700 }}>{revDelta.up ? '▲' : '▼'} {revDelta.value}%</span>
              <span style={{ opacity: 0.75 }}>vs. mês anterior</span>
            </p>
          )}
        </div>

        {/* Agendamentos hoje */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <p className="overline">Agendamentos hoje</p>
          <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }}>
            {todayCount}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            {awaitingCount} aguardando confirmação
          </p>
        </div>

        {/* Taxa de ocupação */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <p className="overline">Taxa de ocupação</p>
          <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }}>
            {professionalsCount ? `${occupancy}%` : '—'}
          </p>
          {/* Barra de progresso */}
          <div>
            <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-app)', overflow: 'hidden', marginTop: 8 }}>
              <div style={{ height: '100%', width: `${occupancy}%`, background: occupancy > 70 ? 'var(--brand)' : occupancy > 40 ? 'var(--warning)' : 'var(--border)', borderRadius: 99, transition: 'width 600ms ease' }} />
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
              {scheduledMin}min de {capacityMin}min disponíveis
            </p>
          </div>
        </div>

        {/* Ticket médio */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <p className="overline">Ticket médio</p>
          <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }}>
            {avgTicket > 0 ? formatBRL(avgTicket) : '—'}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            {monthCompletedCount ?? 0} atendimentos concluídos
          </p>
        </div>
      </div>

      {/* -- Row 2: Gráfico + Agenda ------------------------------ */}
      <div className="rg-2">

        {/* Gráfico */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Faturamento</h2>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Últimos 6 meses</p>
            </div>
            {semesterDelta > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 99 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--success)' }}>
                  ▲ {formatBRL(semesterDelta)} no semestre
                </span>
              </div>
            )}
          </div>
          <RevenueBarChart data={chartData} />
        </div>

        {/* Agenda de hoje */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Agenda de hoje</h2>
            <Link href={`/${slug}/agenda`} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
              Ver tudo <ChevronRight size={12} />
            </Link>
          </div>

          {validToday.length === 0 ? (
            <p style={{ padding: '16px 20px 24px', color: 'var(--text-faint)', fontSize: 12.5, textAlign: 'center' }}>
              Sem agendamentos hoje
            </p>
          ) : (
            <div>
              {validToday.slice(0, 5).map((a, i) => {
                const client    = a.clients    as unknown as { name: string } | null
                const procedure = a.procedures as unknown as { name: string } | null
                const isLast    = i === Math.min(validToday.length, 5) - 1
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--brand)', minWidth: 38, flexShrink: 0 }}>
                      {format(new Date(a.scheduled_at), 'HH:mm')}
                    </span>
                    {client && <Avatar name={client.name} size={32} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {client?.name ?? '—'}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {procedure?.name ?? '—'}
                      </p>
                    </div>
                    <StatusChip status={a.status} />
                  </div>
                )
              })}
              {validToday.length > 5 && (
                <Link href={`/${slug}/agenda`} style={{ display: 'block', padding: '10px 20px', fontSize: 11.5, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none', borderTop: '1px solid var(--hairline)' }}>
                  +{validToday.length - 5} agendamentos →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* -- Row 3: Procedimentos | Funil CRM | Reativar --------- */}
      <div className="rg-3">

        {/* Procedimentos mais procurados */}
        <div className="card">
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
            Procedimentos mais procurados
          </h2>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 18 }}>Últimos 30 dias</p>

          {topProcs.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: 12.5, textAlign: 'center', paddingTop: 8 }}>Sem dados</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {topProcs.map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>{p.count}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-app)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((p.count / maxProc) * 100)}%`,
                      background: `rgba(195,77,107,${[1, 0.7, 0.5, 0.35][i] ?? 0.35})`,
                      borderRadius: 99,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Funil de leads / CRM */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Funil de leads
            </h2>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)', borderRadius: 99, padding: '2px 8px' }}>
              CRM
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 18 }}>Situação atual da filial</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {funnel.map((f, i) => {
              const barPct = funnelMax > 0 ? Math.round((f.count / Math.max(funnelMax, 1)) * 100) : 0
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', minWidth: 110, flexShrink: 0 }}>{f.label}</span>
                  <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'var(--bg-app)', overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${Math.max(barPct, f.count > 0 ? 12 : 0)}%`,
                      background: f.color, borderRadius: 6,
                    }} />
                    {f.count > 0 && (
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 800, color: '#fff', zIndex: 1 }}>
                        {f.count}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Reativar clientes */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 4 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Reativar clientes
              <span style={{ color: 'var(--brand)', fontWeight: 700 }}>✦</span>
            </h2>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 18 }}>Sem visita há mais de 90 dias</p>

          {toReactivate.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center', paddingTop: 8, flex: 1 }}>
              Todos os clientes retornaram 🎉
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                {toReactivate.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={c.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {c.daysSince !== null ? `Última visita há ${c.daysSince} dias` : 'Nunca veio'}
                      </p>
                    </div>
                    <Link href={`/${slug}/agenda`} style={{
                      width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none',
                    }} title="Agendar">
                      <ArrowUpRight size={13} />
                    </Link>
                  </div>
                ))}
              </div>

              {inactiveClients.length > 3 && (
                <Link href={`/${slug}/clients?status=active`} style={{
                  display: 'block', textAlign: 'center', marginTop: 16,
                  padding: '8px', borderRadius: 10, border: '1px solid var(--border)',
                  fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none',
                }}>
                  Ver {inactiveClients.length - 3} clientes inativos
                </Link>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  )
}
