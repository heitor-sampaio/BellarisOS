import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'

import { FinancialHub } from '@/components/branch/financial-hub'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { resolvePeriod, getCommissionsDetail } from '@/lib/metrics'

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
  // Janela no fuso do negócio e período anterior de mesma duração decorrida.
  const { from: start, to: end, prevFrom: prevStart, prevTo: prevEnd, label } =
    resolvePeriod(period, sp.from, sp.to)

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


  const { data: prevTxs } = await supabase
    .from('financial_transactions')
    .select('type, amount, is_paid, notes, category')
    .eq('branch_id', branch.id)
    .gte('created_at', prevStart.toISOString())
    .lte('created_at', prevEnd.toISOString())

  // Comissões do período (registros individuais).
  // `commissions` não tem `created_at` nem `is_paid` — a consulta anterior
  // pedia as duas, o PostgREST devolvia erro 42703, o erro era descartado e o
  // card ficava zerado. O período vem do atendimento e o pagamento, de `status`.
  const commissions = (await getCommissionsDetail({
    tenantId: ctx.tenantId!, branchIds: [branch.id], from: start, to: end,
  })).map(c => ({
    id:               c.id,
    professionalId:   c.professionalId,
    professionalName: c.professionalName,
    amount:           c.amount,
    isPaid:           c.isPaid,
    createdAt:        c.referenceAt,
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
