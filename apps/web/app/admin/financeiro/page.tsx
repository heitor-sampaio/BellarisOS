import { redirect } from 'next/navigation'
import { getTenantContext, assertPermission, can, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminFinancialView } from '@/components/admin/admin-financial-view'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { resolvePeriod, getCore, getByBranch, getMovimentacoes, getEmAberto, getResultadoDoEstoque } from '@/lib/metrics'
import { lerTodas } from '@/lib/db'
import { resultadoDoPeriodo, SEM_ESTOQUE_NO_RESULTADO } from '@/lib/metrics/resultado'

/** Lançamento como o select pede. */
type LancamentoLido = {
  id: string; type: string; category: string | null; description: string; amount: number | string
  payment_method: string | null; cartao_vezes: number | null; is_paid: boolean; paid_at: string | null; due_date: string | null
  created_at: string; branch_id: string; notes: string | null
  cliente: { name: string } | null
}

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
  const { from: start, to: end, fullTo: fimDoPeriodo, prevFrom: prevStart, prevTo: prevEnd, label } =
    resolvePeriod(period, sp.from, sp.to)

  const ctx = await getTenantContext()
  // Esta tela é do financeiro. `cashier` governa RECEBER — no atendimento e no
  // checkout do plano —, não ler o consolidado da rede.
  assertPermission(ctx, 'financial', 'VIEW')

  const operaCaixa = can(ctx, 'cashier', 'MANAGE')

  // Alcance "só as próprias comissões" não tem como virar um consolidado da
  // rede meio filtrado — sairiam números com cara de total que não são total.
  const soAsProprias = isOwnScope(ctx, 'financial')

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
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Não foi possível carregar as unidades agora. Tente recarregar em instantes.
      </div>
    )
  }

  const branches   = branchesRaw ?? []
  const branchIds  = branches.map(b => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // Alcance "só as próprias" não vira consolidado meio filtrado: sairiam
  // números com cara de total que não são total. A pessoa vai para as
  // comissões dela — a tela para a qual este aviso apontava não existia.
  if (soAsProprias) redirect('/admin/financeiro/comissoes')
  const metricArgs = { tenantId: ctx.tenantId!, branchIds, from: start, to: end }

  const [core, prevCore, branchMetrics, txsRaw, clientsRaw, movimentacoes, emAbertoPorUnidade, estoqueNoResultado, estoquePorUnidade] = await Promise.all([
    getCore(metricArgs),
    getCore({ ...metricArgs, from: prevStart, to: prevEnd }),
    getByBranch({ tenantId: ctx.tenantId!, from: start, to: end }),

    // A lista de lançamentos continua sendo lida direto — é extrato, não KPI.
    // Inteira, em páginas (2026-10-22): tinha teto de 500. Consulta que falha
    // PARA, em vez de virar um extrato vazio.
    lerTodas((de, ate) => admin
      .from('financial_transactions')
      .select('id, type, category, description, amount, payment_method, cartao_vezes, is_paid, paid_at, due_date, created_at, branch_id, notes, estorno_motivo, data_de_referencia, parcela_numero, parcela_total, cliente:clients!financial_transactions_client_id_fkey(name)')
      .in('branch_id', branchIds)
      // O período é pela DATA DE REFERÊNCIA (2026-09-30): o pago, no dia do
    // pagamento; o em aberto, no vencimento. Cada parcela aparece no mês dela —
    // pela criação, o parcelado inteiro caía no mês da venda. O saldo zerado
    // (substituído no check-in) é histórico: fica fora da lista.
      .or('is_paid.eq.true,amount.neq.0')
      .gte('data_de_referencia', start.toISOString())
    // Fim do PERÍODO, não "agora": o `to` do resolvePeriod é a janela
    // DECORRIDA, que existe para o delta comparar coisas de mesmo tamanho. Numa
    // LISTA ele vira um bug de corrida — o relógio do Postgres está à frente do
    // relógio do app (medi 0,2s), então um lançamento feito neste segundo nasce
    // com `created_at` no futuro e some da tela que acabou de criá-lo.
      .lte('data_de_referencia', fimDoPeriodo.toISOString())
      .order('data_de_referencia', { ascending: false }).order('id')
      .range(de, ate), 'carregar os lançamentos da rede'),

    // Clientes da rede, para o crédito interno. Só quem recebe precisa.
    ctx.permissions.financial === 'MANAGE'
      ? lerTodas((de, ate) => admin.from('clients').select('id, name')
          .eq('tenant_id', ctx.tenantId!).eq('is_active', true)
          .order('name').order('id').range(de, ate), 'carregar os clientes da rede')
      : Promise.resolve([] as { id: string; name: string }[]),

    // As movimentações com a regra da LISTA (data de referência até o fim do
    // período): a coluna da unidade e o total contam o mesmo (D34).
    getMovimentacoes({ tenantId: ctx.tenantId!, branchIds, from: start, to: fimDoPeriodo }),

    // "A receber" e "A pagar" por unidade, pelo VENCIMENTO até o fim do
    // período, com o próximo vencimento (getEmAberto, A34 de 2026-10-27) — a
    // mesma conta do financeiro da unidade. Uma chamada por unidade, e a
    // clínica típica tem uma.
    Promise.all(branchIds.map(async id => [id, await getEmAberto({ tenantId: ctx.tenantId!, branchIds: [id], from: start, to: fimDoPeriodo })] as const)),
    // O resultado desconta o insumo consumido e deixa a compra de estoque no
    // caixa (2026-10-29): o total das ativas e cada unidade (as de getByBranch).
    getResultadoDoEstoque(metricArgs),
    getResultadoDoEstoque({ ...metricArgs, branchIds: null }),
  ])
  const emAbertoDe = Object.fromEntries(emAbertoPorUnidade)
  const emAbertoDaRede = await getEmAberto({ tenantId: ctx.tenantId!, branchIds, from: start, to: fimDoPeriodo })

  const txs = (txsRaw ?? []) as unknown as LancamentoLido[]

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

  // Unidade desativada só entra se teve movimento no período (o dinheiro
  // aconteceu); sem nada, era ruído no ranking (simulação de 2026-10-20).
  const branchStats = branchMetrics.filter(b => b.isActive || b.revenueCash || b.revenuePending || b.expensesCash || b.appointmentsTotal).map(b => ({
    id:          b.branchId,
    name:        b.branchName,
    slug:        b.branchSlug,
    revenue:     b.revenueCash,
    expenses:    b.expensesCash,
    result:      resultadoDoPeriodo({ ...b, ...(estoquePorUnidade.porUnidade[b.branchId] ?? SEM_ESTOQUE_NO_RESULTADO) }).lucro,
    commissions: b.commissionsOpen + b.commissionsPaid,
    aReceber:    emAbertoDe[b.branchId]?.aReceber ?? 0,
    aPagar:      emAbertoDe[b.branchId]?.aPagar ?? 0,
    proximoAReceber: emAbertoDe[b.branchId]?.proximoAReceber ?? null,
    proximoAPagar:   emAbertoDe[b.branchId]?.proximoAPagar ?? null,
    txCount:     movimentacoes.porUnidade[b.branchId] ?? 0,
  }))

  // Transações enriquecidas com nome da filial
  const transactions = txs.map(t => ({
    ...t,
    branchName: branchNameMap[t.branch_id] ?? '—',
    clienteNome: t.cliente?.name ?? null,
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
        totalResult={resultadoDoPeriodo({ ...core, ...estoqueNoResultado.total }).lucro}
        totalCommissions={totalComm}
        totalAReceber={emAbertoDaRede.aReceber}
        totalAPagar={emAbertoDaRede.aPagar}
        totalProximoAReceber={emAbertoDaRede.proximoAReceber}
        totalProximoAPagar={emAbertoDaRede.proximoAPagar}
        totalMovimentacoes={movimentacoes.total}
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
      />
    </>
  )
}
