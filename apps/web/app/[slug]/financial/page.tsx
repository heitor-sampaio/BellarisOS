import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { FinancialHub } from '@/components/branch/financial-hub'
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

export default async function FinancialPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { slug } = await params
  const sp       = await searchParams
  const period   = sp.period ?? 'month'
  const { start, end, label } = resolvePeriod(period, sp.from, sp.to)

  const ctx = await getTenantContext()
  assertPermission(ctx, 'financial', 'VIEW')

  const supabase = await createSupabase()

  const { data: branch } = await supabase
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single()
  if (!branch) notFound()

  const { data: transactions } = await supabase
    .from('financial_transactions')
    .select('id, type, category, description, amount, payment_method, is_paid, paid_at, due_date, notes, created_at, appointment_id')
    .eq('branch_id', branch.id)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false })

  const prevDiff  = end.getTime() - start.getTime()
  const prevEnd   = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - prevDiff)

  const { data: prevTxs } = await supabase
    .from('financial_transactions')
    .select('type, amount, is_paid')
    .eq('branch_id', branch.id)
    .gte('created_at', prevStart.toISOString())
    .lte('created_at', prevEnd.toISOString())

  // Comissões do período (registros individuais)
  const { data: commissionsRaw } = await supabase
    .from('commissions')
    .select('id, amount, is_paid, professional_id, created_at, users(name)')
    .eq('branch_id', branch.id)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('professional_id')
    .order('created_at', { ascending: false })

  const commissions = (commissionsRaw ?? []).map((c: any) => ({
    id:               c.id as string,
    professionalId:   c.professional_id as string,
    professionalName: (c.users?.name ?? 'Profissional') as string,
    amount:           Number(c.amount),
    isPaid:           c.is_paid as boolean,
    createdAt:        c.created_at as string,
  }))

  const canWrite   = ctx.permissions.financial === 'MANAGE'
  const canReverse = canWrite

  const { data: clientsRaw } = canWrite
    ? await supabase
        .from('clients')
        .select('id, name')
        .eq('branch_id', branch.id)
        .eq('is_active', true)
        .order('name')
        .limit(300)
    : { data: [] }

  const clients = (clientsRaw ?? []).map((c: any) => ({ id: c.id as string, name: c.name as string }))

  return (
    <>
      <RealtimeRefresher tables={['financial_transactions', 'cash_registers', 'commissions']} />
      <FinancialHub
        branchId={branch.id}
        branchName={branch.name}
        slug={slug}
        period={period}
        periodLabel={label}
        periodStart={start.toISOString()}
        customFrom={sp.from}
        customTo={sp.to}
        transactions={(transactions ?? []) as any}
        prevTransactions={(prevTxs ?? []) as any}
        commissions={commissions}
        canReverse={canReverse}
        canWrite={canWrite}
        clients={clients}
      />
    </>
  )
}
