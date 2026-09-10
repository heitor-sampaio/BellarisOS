import { notFound } from 'next/navigation'
import { getTenantContext, assertAnyPermission, can, ownerFilter } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'

import { FinancialHub } from '@/components/branch/financial-hub'
import { CashRegisterWidget } from '@/components/branch/cash-register-widget'
import { getOpenCashRegister, getCashRegisterTotals } from '@/lib/cash-register'
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
  // Quem só opera o caixa entra aqui para abrir e fechar, sem ver o financeiro
  // da unidade — antes o gate era só `financial`, e um cargo de recepção com
  // `cashier: MANAGE` não tinha nenhuma tela onde abrir o caixa.
  assertAnyPermission(ctx, ['financial', 'cashier'], 'VIEW')
  const canSeeFinancials = can(ctx, 'financial', 'VIEW')

  const supabase = await createSupabase()

  const { data: branch } = await supabase
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single()
  if (!branch) notFound()

  const { data: transactions } = canSeeFinancials ? await supabase
    .from('financial_transactions')
    .select('id, type, category, description, amount, payment_method, is_paid, paid_at, due_date, notes, created_at, appointment_id')
    .eq('branch_id', branch.id)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false }) : { data: [] }


  const { data: prevTxs } = canSeeFinancials ? await supabase
    .from('financial_transactions')
    .select('type, amount, is_paid, notes, category')
    .eq('branch_id', branch.id)
    .gte('created_at', prevStart.toISOString())
    .lte('created_at', prevEnd.toISOString()) : { data: [] }

  // Comissões do período (registros individuais).
  // `commissions` não tem `created_at` nem `is_paid` — a consulta anterior
  // pedia as duas, o PostgREST devolvia erro 42703, o erro era descartado e o
  // card ficava zerado. O período vem do atendimento e o pagamento, de `status`.
  // Alcance "só as próprias comissões": o cargo continua entrando na tela, mas
  // ela se resume ao que é dele. O resto (receita, despesas, lançamentos da
  // filial) não é renderizado — ver `ownScope` no hub.
  const ownFinancial = ownerFilter(ctx, 'financial')

  const commissions = (canSeeFinancials ? await getCommissionsDetail({
    tenantId: ctx.tenantId!, branchIds: [branch.id], from: start, to: end,
  }) : []).filter(c => !ownFinancial || c.professionalId === ownFinancial).map(c => ({
    id:               c.id,
    professionalId:   c.professionalId,
    professionalName: c.professionalName,
    amount:           c.amount,
    isPaid:           c.isPaid,
    createdAt:        c.referenceAt,
  }))

  // Lançar e estornar são do financeiro; receber é do caixa. Antes as três
  // coisas saíam do mesmo nível, e quem operava o caixa também estornava.
  const canWrite   = ctx.permissions.financial === 'MANAGE' && !ownFinancial
  const canReverse = canWrite
  const canPay     = ctx.permissions.cashier === 'MANAGE'

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

  // Caixa da unidade. Os totais são do MOVIMENTO DESTE CAIXA (via
  // `cash_register_id`), não do período escolhido no filtro acima: um caixa
  // fecha com o que passou por ele, não com o que aconteceu no mês.
  const cashRegister = canPay ? await getOpenCashRegister(branch.id) : null
  const cashTotals   = cashRegister
    ? await getCashRegisterTotals(cashRegister.id)
    : { income: 0, expense: 0 }

  return (
    <>
      <RealtimeRefresher tables={['financial_transactions', 'cash_registers', 'commissions']} />

      {canPay && (
        <div style={{ marginBottom: 20 }}>
          <CashRegisterWidget
            branchId={branch.id}
            slug={slug}
            register={cashRegister}
            totalIncome={cashTotals.income}
            totalExpense={cashTotals.expense}
          />
        </div>
      )}

      {canSeeFinancials && <FinancialHub
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
        canPay={canPay}
        ownScope={!!ownFinancial}
        clients={clients}
      />}
    </>
  )
}
