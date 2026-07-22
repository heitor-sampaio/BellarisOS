import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminFinancialView } from '@/components/admin/admin-financial-view'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

function resolvePeriod(
  period: string,
  from?: string,
  to?: string,
): { start: Date; end: Date; label: string } {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (period) {
    case 'today':
      return { start: today, end: now, label: 'Hoje' }
    case 'week': {
      const s = new Date(today)
      s.setDate(today.getDate() - ((today.getDay() + 6) % 7))
      return { start: s, end: now, label: 'Esta semana' }
    }
    case 'month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end:   now,
        label: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      return { start: s, end: e, label: 'Mês anterior' }
    }
    case 'quarter': {
      const s = new Date(today)
      s.setDate(today.getDate() - 89)
      return { start: s, end: now, label: 'Últimos 90 dias' }
    }
    case 'custom':
      return {
        start: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
        end:   to   ? new Date(`${to}T23:59:59`) : now,
        label: 'Período personalizado',
      }
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end:   now,
        label: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      }
  }
}

export default async function AdminFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp     = await searchParams
  const period = sp.period ?? 'month'
  const { start, end, label } = resolvePeriod(period, sp.from, sp.to)

  const ctx = await getTenantContext()
  assertPermission(ctx, 'financial', 'VIEW')

  const admin = createAdminClient()

  // Todas as filiais ativas do tenant
  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  const branches   = branchesRaw ?? []
  const branchIds  = branches.map(b => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Nenhuma filial ativa encontrada.
      </div>
    )
  }

  // Período anterior (para comparação nos KPIs)
  const prevDiff  = end.getTime() - start.getTime()
  const prevEnd   = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - prevDiff)

  const [
    { data: txsRaw },
    { data: prevTxsRaw },
    { data: commissionsRaw },
  ] = await Promise.all([
    admin
      .from('financial_transactions')
      .select('id, type, category, description, amount, payment_method, is_paid, paid_at, due_date, created_at, branch_id')
      .in('branch_id', branchIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false }),

    admin
      .from('financial_transactions')
      .select('type, amount, is_paid, branch_id')
      .in('branch_id', branchIds)
      .gte('created_at', prevStart.toISOString())
      .lte('created_at', prevEnd.toISOString()),

    admin
      .from('commissions')
      .select('id, amount, is_paid, professional_id, branch_id, created_at, users(name)')
      .in('branch_id', branchIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
  ])

  const txs         = (txsRaw         ?? []) as any[]
  const prevTxs     = (prevTxsRaw     ?? []) as any[]
  const commissions = (commissionsRaw ?? []) as any[]

  // KPIs consolidados
  const totalRevenue  = txs.filter(t => t.type === 'INCOME'  && t.is_paid).reduce((s: number, t: any) => s + Number(t.amount), 0)
  const totalExpenses = txs.filter(t => t.type === 'EXPENSE' && t.is_paid).reduce((s: number, t: any) => s + Number(t.amount), 0)
  const totalComm     = commissions.filter((c: any) => c.is_paid).reduce((s: number, c: any) => s + Number(c.amount), 0)

  const prevRevenue  = prevTxs.filter(t => t.type === 'INCOME'  && t.is_paid).reduce((s: number, t: any) => s + Number(t.amount), 0)
  const prevExpenses = prevTxs.filter(t => t.type === 'EXPENSE' && t.is_paid).reduce((s: number, t: any) => s + Number(t.amount), 0)

  // KPIs por filial
  const branchNameMap = Object.fromEntries(branches.map(b => [b.id, b.name]))
  const branchSlugMap = Object.fromEntries(branches.map(b => [b.id, b.slug]))

  const branchStats = branches.map(branch => {
    const bTxs  = txs.filter((t: any) => t.branch_id === branch.id)
    const bComm = commissions.filter((c: any) => c.branch_id === branch.id)
    const revenue  = bTxs.filter((t: any) => t.type === 'INCOME'  && t.is_paid).reduce((s: number, t: any) => s + Number(t.amount), 0)
    const expenses = bTxs.filter((t: any) => t.type === 'EXPENSE' && t.is_paid).reduce((s: number, t: any) => s + Number(t.amount), 0)
    const comm     = bComm.filter((c: any) => c.is_paid).reduce((s: number, c: any) => s + Number(c.amount), 0)
    return {
      id:          branch.id,
      name:        branch.name,
      slug:        branch.slug,
      revenue,
      expenses,
      result:      revenue - expenses,
      commissions: comm,
      txCount:     bTxs.length,
    }
  })

  // Transações enriquecidas com nome da filial
  const transactions = txs.map((t: any) => ({
    ...t,
    branchName: branchNameMap[t.branch_id] ?? '—',
    amount:     Number(t.amount),
  }))

  return (
    <>
      <RealtimeRefresher tables={['financial_transactions', 'commissions']} />
      <AdminFinancialView
        period={period}
        periodLabel={label}
        customFrom={sp.from}
        customTo={sp.to}
        totalRevenue={totalRevenue}
        totalExpenses={totalExpenses}
        totalResult={totalRevenue - totalExpenses}
        totalCommissions={totalComm}
        prevRevenue={prevRevenue}
        prevExpenses={prevExpenses}
        branchStats={branchStats}
        transactions={transactions}
        branchSlugMap={branchSlugMap}
        branches={branches}
        canWrite={ctx.permissions.financial === 'MANAGE'}
      />
    </>
  )
}
