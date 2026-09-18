import { getTenantContext, assertAnyPermission, can, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminFinancialView } from '@/components/admin/admin-financial-view'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { resolvePeriod, getCore, getByBranch, EMPTY_CORE } from '@/lib/metrics'
import { getOpenCashRegistersByBranch } from '@/lib/cash-register'
import { CaixasDaRede } from '@/components/admin/caixas-da-rede'

export default async function AdminFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp     = await searchParams
  const period = sp.period ?? 'month'
  // Janela e comparação vêm da camada de métricas: no fuso do negócio e com o
  // período anterior de mesma duração. A resolução local antes montava "custom"
  // com o início em UTC e o fim no fuso do processo — duas convenções na mesma
  // função — e comparava o mês parcial com uma janela de tamanho diferente.
  const { from: start, to: end, prevFrom: prevStart, prevTo: prevEnd, label } =
    resolvePeriod(period, sp.from, sp.to)

  const ctx = await getTenantContext()
  // Quem opera o caixa entra: é aqui que ele abre e fecha o caixa das unidades.
  // Exigir `financial` deixava um cargo com `cashier: Gerenciar` e abrangência de
  // rede sem nenhuma tela onde trabalhar.
  assertAnyPermission(ctx, ['financial', 'cashier'], 'VIEW')

  const veFinanceiro = can(ctx, 'financial', 'VIEW')
  const operaCaixa   = can(ctx, 'cashier', 'MANAGE')

  // Alcance "só as próprias comissões" não tem como virar um consolidado da
  // rede meio filtrado — sairiam números com cara de total que não são total.
  const soAsProprias = veFinanceiro && isOwnScope(ctx, 'financial')

  const admin = createAdminClient()

  // Todas as filiais ativas do tenant. Falha de consulta não é rede sem filial —
  // mesmo tratamento de /admin/agenda.
  const { data: branchesRaw, error: branchesError } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  if (branchesError) {
    console.error('[admin/financeiro] branches:', branchesError.message)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Não foi possível carregar as unidades agora. Tente recarregar em instantes.
      </div>
    )
  }

  const branches   = branchesRaw ?? []
  const branchIds  = branches.map(b => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // Caixa de cada unidade — o portal da rede abre e fecha daqui, sem entrar na
  // unidade. Sem isto, todo recebimento feito pela rede caía fora de qualquer
  // fechamento, porque `getOpenCashRegisterId` não achava caixa aberto.
  const caixas = operaCaixa ? await getOpenCashRegistersByBranch(branchIds) : []

  // Quem só vê as próprias comissões não recebe o consolidado — mas continua
  // com o caixa, que é dele. Antes a tela inteira virava um beco sem saída
  // mandando "abra pelo portal da unidade", portal que quem é da rede não tem.
  if (soAsProprias || !veFinanceiro) {
    return (
      <>
        <RealtimeRefresher tables={['financial_transactions', 'cash_registers']} />
        <CaixasDaRede caixas={caixas} branches={branches} operaCaixa={operaCaixa} />
        {soAsProprias && (
          <p style={{ padding: '24px 4px', color: 'var(--text-muted)', fontSize: 14 }}>
            Seu cargo vê apenas as próprias comissões, que aparecem no seu perfil —
            o consolidado da rede não é exibido aqui.
          </p>
        )}
      </>
    )
  }
  const metricArgs = { tenantId: ctx.tenantId!, branchIds, from: start, to: end }

  const [core, prevCore, branchMetrics, { data: txsRaw }, { data: clientsRaw }] = await Promise.all([
    getCore(metricArgs),
    getCore({ ...metricArgs, from: prevStart, to: prevEnd }),
    getByBranch({ tenantId: ctx.tenantId!, from: start, to: end }),

    // A lista de lançamentos continua sendo lida direto — é extrato, não KPI.
    admin
      .from('financial_transactions')
      .select('id, type, category, description, amount, payment_method, is_paid, paid_at, due_date, created_at, branch_id, notes')
      .in('branch_id', branchIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(500),

    // Clientes da rede, para o crédito interno. Só quem recebe precisa.
    ctx.permissions.financial === 'MANAGE'
      ? admin.from('clients').select('id, name')
          .eq('tenant_id', ctx.tenantId!).eq('is_active', true)
          .order('name').limit(500)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])

  const txs = (txsRaw ?? []) as any[]

  // KPIs consolidados
  const totalRevenue  = core.revenueCash
  const totalExpenses = core.expensesCash
  // Comissões geradas no período (abertas + pagas). Antes a query filtrava
  // `commissions.is_paid` e `commissions.created_at`, colunas que não existem:
  // o erro era descartado e o card mostrava R$ 0,00 permanentemente.
  const totalComm     = core.commissionsOpen + core.commissionsPaid

  const prevRevenue  = prevCore.revenueCash
  const prevExpenses = prevCore.expensesCash

  // KPIs por filial
  const branchNameMap = Object.fromEntries(branches.map(b => [b.id, b.name]))
  const branchSlugMap = Object.fromEntries(branches.map(b => [b.id, b.slug]))

  const branchStats = branchMetrics.map(b => ({
    id:          b.branchId,
    name:        b.branchName,
    slug:        b.branchSlug,
    revenue:     b.revenueCash,
    expenses:    b.expensesCash,
    result:      b.revenueCash - b.expensesCash,
    commissions: b.commissionsOpen + b.commissionsPaid,
    txCount:     b.transactionsCount,
  }))

  // Transações enriquecidas com nome da filial
  const transactions = txs.map((t: any) => ({
    ...t,
    branchName: branchNameMap[t.branch_id] ?? '—',
    amount:     Number(t.amount),
  }))

  return (
    <>
      <RealtimeRefresher tables={['financial_transactions', 'commissions', 'cash_registers']} />
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
        unidadeInicial={branches.find(b => b.id === sp.unidade || b.slug === sp.unidade)?.id ?? ""}
        canWrite={ctx.permissions.financial === 'MANAGE'}
        canPay={operaCaixa || ctx.permissions.financial === 'MANAGE'}
        podeDarCredito={ctx.permissions.financial === 'MANAGE'}
        canReverse={ctx.permissions.financial === 'MANAGE'}
        clients={(clientsRaw ?? []) as { id: string; name: string }[]}
        caixas={<CaixasDaRede caixas={caixas} branches={branches} operaCaixa={operaCaixa} />}
      />
    </>
  )
}
