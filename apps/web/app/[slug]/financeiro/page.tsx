import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'

import { FinancialHub } from '@/components/branch/financial-hub'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { resolvePeriod, getCommissionsDetail, getCore } from '@/lib/metrics'
import { ler } from '@/lib/db'

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
  const { from: start, to: end, fullTo: fimDoPeriodo, prevFrom: prevStart, prevTo: prevEnd, label } =
    resolvePeriod(period, sp.from, sp.to)

  const ctx = await getTenantContext()
  // `cashier` governa RECEBER — no atendimento e no checkout do plano. Esta
  // tela é o financeiro da unidade, e pede o módulo dela.
  assertPermission(ctx, 'financial', 'VIEW')

  const supabase = await createSupabase()

  const branch = await ler(supabase
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single(), 'buscar a unidade')
  if (!branch) notFound()

  // Os totais do período vêm do MESMO lugar que alimenta o dashboard e os
  // relatórios: agregados no Postgres, eixo em `paid_at`, estorno fora dos dois
  // lados. Somar a lista abaixo daria outro número assim que existisse uma
  // parcela criada num mês e paga no outro — e o checkout de plano cria
  // exatamente isso.
  const argsDoNucleo = { tenantId: ctx.tenantId!, branchIds: [branch.id as string] }
  const [totais, totaisAnteriores] = await Promise.all([
    getCore({ ...argsDoNucleo, from: start,     to: end }),
    getCore({ ...argsDoNucleo, from: prevStart, to: prevEnd }),
  ])

  const transactions = await ler(supabase
    .from('financial_transactions')
    .select('id, type, category, description, amount, payment_method, is_paid, paid_at, due_date, notes, created_at, appointment_id')
    .eq('branch_id', branch.id)
    .gte('created_at', start.toISOString())
    // Fim do PERÍODO, não "agora" — ver o mesmo comentário no financeiro da
    // rede. O relógio do Postgres está à frente do relógio do app, e um
    // lançamento feito neste segundo sumia da tela que acabou de criá-lo.
    .lte('created_at', fimDoPeriodo.toISOString())
    .order('created_at', { ascending: false }), 'carregar os lançamentos')


  const prevTxs = await ler(supabase
    .from('financial_transactions')
    .select('type, amount, is_paid, notes, category')
    .eq('branch_id', branch.id)
    .gte('created_at', prevStart.toISOString())
    .lte('created_at', prevEnd.toISOString()), 'carregar os lançamentos do período anterior')

  // Comissões do período (registros individuais).
  // `commissions` não tem `created_at` nem `is_paid` — a consulta anterior
  // pedia as duas, o PostgREST devolvia erro 42703, o erro era descartado e o
  // card ficava zerado. O período vem do atendimento e o pagamento, de `status`.
  // Alcance "só as próprias comissões": o cargo continua entrando na tela, mas
  // ela se resume ao que é dele. O resto (receita, despesas, lançamentos da
  // filial) não é renderizado — ver `ownScope` no hub.
  const ownFinancial = ownerFilter(ctx, 'financial')

  const commissions = (await getCommissionsDetail({
    tenantId: ctx.tenantId!, branchIds: [branch.id], from: start, to: end,
  })).filter(c => !ownFinancial || c.professionalId === ownFinancial).map(c => ({
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

  return (
    <>
      <RealtimeRefresher tables={['financial_transactions', 'commissions']} />

      <FinancialHub
        totais={totais}
        totaisAnteriores={totaisAnteriores}
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
      />
    </>
  )
}
