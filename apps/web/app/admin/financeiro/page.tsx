import { notaDoEstornoParcial, notaDoUsoDeCredito, type LancamentoParaNota } from '@/lib/financeiro/notas-do-lancamento'
import { redirect } from 'next/navigation'
import { getTenantContext, assertPermission, can, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminFinancialView } from '@/components/admin/admin-financial-view'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { dayKeyTZ, startOfDayTZ } from '@/lib/datetime'
import { situacaoDoVencimento } from '@/lib/financeiro/vencimentos'
import { getAReceberVencido } from '@/lib/metrics/vencidas'
import { nomeDoCsvDosLancamentos } from '@/lib/financeiro/csv-dos-lancamentos'
import { resolvePeriod, getCore, getByBranch, getMovimentacoes, getEmAberto, getResultadoDoEstoque, getAReceberEmAberto, getAPagarEmAberto, getComposicaoFinanceira } from '@/lib/metrics'
import { extrasDoCsv, type LancamentoParaOCsv } from '@/lib/financeiro/extras-do-csv'
import { lerTodas } from '@/lib/db'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'
import { getAReceberDaOperadora, getParcelasDaOperadora } from '@/lib/metrics/operadora'
import { getFluxoDeCaixa } from '@/lib/metrics/fluxo-de-caixa'
import { getTotalDosAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { resultadoDoPeriodo, SEM_ESTOQUE_NO_RESULTADO } from '@/lib/metrics/resultado'
import { descontosDosLancamentos, type LancamentoComDesconto } from '@/lib/financeiro/desconto-do-lancamento'
import { pagosSemDinheiro, type LancamentoSemDinheiro } from '@/lib/financeiro/pago-sem-dinheiro'
import { getTaxaDosLancamentos } from '@/lib/metrics/contadora'

/** Lançamento como o select pede. */
type LancamentoLido = {
  loyalty_discount?: number | string | null; fornecedor?: string | null; nota_fiscal?: string | null
  id: string; type: string; category: string | null; description: string; amount: number | string
  payment_method: string | null; cartao_vezes: number | null; is_paid: boolean; paid_at: string | null; due_date: string | null
  created_at: string; branch_id: string; notes: string | null
  cliente: { name: string } | null
} & LancamentoComDesconto

export default async function AdminFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp     = await searchParams
  /** A38 da 8ª: a lista de todo o a receber em aberto, de qualquer vencimento. */
  // D13 da 9ª: ou só as VENCIDAS (o vencimento antes de hoje), de qualquer mês.
  const soAsVencidas = sp.aberto === 'vencidas'
  // A43 da 12ª: ou todo o A PAGAR em aberto, de qualquer vencimento (a despesa).
  const soAPagar = sp.aberto === 'a-pagar'
  const soOEmAberto = sp.aberto === 'todos' || soAsVencidas || soAPagar
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

  // A lista do período (ou de todo o em aberto, A38 da 8ª), lida em páginas.
  const daLista = (de: number, ate: number) => admin
      .from('financial_transactions')
      .select('id, type, category, description, amount, payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, due_date, created_at, branch_id, notes, estorno_motivo, product_sale_id, credito_vendido_id, sale_discount, desconto_motivo, client_package_id, procedure_sale_id, treatment_plan_id, appointment_id, data_de_referencia, parcela_numero, parcela_total, vencimentos_anteriores, loyalty_discount, fornecedor, nota_fiscal, valor_antes_do_estorno, cliente:clients!financial_transactions_client_id_fkey(name)')
      .in('branch_id', branchIds)
      // A38 da 8ª: "Ver e dar baixa" — todo o a receber em aberto, de qualquer
      // vencimento. Senão, o período é pela DATA DE REFERÊNCIA (2026-09-30): o
      // pago, no dia do pagamento; o em aberto, no vencimento. O saldo zerado
      // (substituído no check-in) é histórico: fica fora da lista.
      .or(soOEmAberto ? 'notes.is.null,notes.neq.Estornada' : 'is_paid.eq.true,amount.neq.0')
      .gte(soOEmAberto ? 'amount' : 'data_de_referencia', soOEmAberto ? 0.01 : start.toISOString())
      .in('type', soAPagar ? ['EXPENSE'] : soOEmAberto ? ['INCOME'] : ['INCOME', 'EXPENSE'])
      .in('is_paid', soOEmAberto ? [false] : [true, false])
    // Fim do PERÍODO, não "agora": o `to` do resolvePeriod é a janela
    // DECORRIDA, que existe para o delta comparar coisas de mesmo tamanho. Numa
    // LISTA ele vira um bug de corrida — o relógio do Postgres está à frente do
    // relógio do app (medi 0,2s), então um lançamento feito neste segundo nasce
    // com `created_at` no futuro e some da tela que acabou de criá-lo.
      .lte('data_de_referencia', soOEmAberto ? '9999-12-31' : fimDoPeriodo.toISOString())
      .order('data_de_referencia', { ascending: soOEmAberto }).order('id')
      .range(de, ate)

  const [core, prevCore, branchMetrics, txsRaw, clientsRaw, movimentacoes, emAbertoPorUnidade, estoqueNoResultado, estoquePorUnidade, aReceberEmAberto, operadora, parcelasDaOperadora, concluidosSemPagamento, composicao] = await Promise.all([
    getCore(metricArgs),
    getCore({ ...metricArgs, from: prevStart, to: prevEnd }),
    getByBranch({ tenantId: ctx.tenantId!, from: start, to: end }),

    // A lista de lançamentos continua sendo lida direto — é extrato, não KPI.
    // Inteira, em páginas (2026-10-22): tinha teto de 500. Consulta que falha
    // PARA, em vez de virar um extrato vazio.
    lerTodas((de, ate) => soAsVencidas
      ? daLista(de, ate).lt('due_date', startOfDayTZ(new Date()).toISOString())
      : daLista(de, ate), 'carregar os lançamentos da rede'),

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
    // D-14: todo o a receber em aberto, de qualquer vencimento — o total e
    // cada unidade, INCLUSIVE a desativada (ind-11, revisão de 2026-11-02: "a
    // unidade pode ter sido desativada comercialmente mas ainda tem contas a
    // receber"). Era só o das ativas, como o número do mês.
    getAReceberEmAberto({ tenantId: ctx.tenantId!, branchIds: null }),
    // F2c: o cartão em N vezes que a OPERADORA ainda deposita, mês a mês, pelo
    // vencimento até o fim do período — o total das ativas e cada unidade.
    getAReceberDaOperadora({ tenantId: ctx.tenantId!, branchIds, from: start, to: fimDoPeriodo }),
    getParcelasDaOperadora({ tenantId: ctx.tenantId!, branchIds, from: start, to: fimDoPeriodo }),
    // "Reforça", item 4: os concluídos sem pagamento da rede inteira,
    // separados dos lançamentos (só apareciam no Fechamento).
    getTotalDosAtendimentosAReceber({ tenantId: ctx.tenantId! }),
    // A38 da 11ª: o débito do período, que conta como recebido no dia (a nota do "A receber da operadora").
    getComposicaoFinanceira(metricArgs),
  ])
  // E de cada unidade, para o recorte da tela (uma chamada por unidade, como o em aberto).
  const concluidosSemPagamentoDe = Object.fromEntries(await Promise.all(branchMetrics.map(async b =>
    [b.branchId, await getTotalDosAtendimentosAReceber({ tenantId: ctx.tenantId!, unidadeId: b.branchId })] as const)))
  const emAbertoDe = Object.fromEntries(emAbertoPorUnidade)
  // D13 da 9ª: o que já venceu (antes de hoje) — o total e cada unidade.
  const vencidas = await getAReceberVencido({ tenantId: ctx.tenantId!, branchIds: null })
  const emAbertoDaRede = await getEmAberto({ tenantId: ctx.tenantId!, branchIds, from: start, to: fimDoPeriodo })
  // A43 da 12ª: todo o a pagar em aberto, de qualquer vencimento — o total e cada unidade.
  const aPagarEmAberto = await getAPagarEmAberto({ tenantId: ctx.tenantId!, branchIds: null })

  const txs = (txsRaw ?? []) as unknown as LancamentoLido[]
  // O resultado da rede e as parcelas dele (D8 da 8ª: a conta embaixo do cartão).
  const totalConta = resultadoDoPeriodo({ ...core, ...estoqueNoResultado.total })

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
  // E a desativada com conta em aberto (ind-11): o dinheiro ainda vai entrar.
  const branchStats = branchMetrics.filter(b => b.isActive || b.revenueCash || b.revenuePending || b.expensesCash || b.appointmentsTotal
    || (aReceberEmAberto.porUnidade[b.branchId] ?? 0) > 0).map(b => ({
    id:          b.branchId,
    name:        b.branchName,
    slug:        b.branchSlug,
    revenue:     b.revenueCash,
    expenses:    b.expensesCash,
    ...(conta => ({ result: conta.lucro, conta }))(resultadoDoPeriodo({ ...b, ...(estoquePorUnidade.porUnidade[b.branchId] ?? SEM_ESTOQUE_NO_RESULTADO) })),
    commissions: b.commissionsOpen + b.commissionsPaid,
    aReceber:    emAbertoDe[b.branchId]?.aReceber ?? 0,
    aReceberEmAberto: aReceberEmAberto.porUnidade[b.branchId] ?? 0,
    vencidas: vencidas.porUnidade[b.branchId],
    concluidosSemPagamento: concluidosSemPagamentoDe[b.branchId],
    aPagar:      emAbertoDe[b.branchId]?.aPagar ?? 0,
    aPagarEmAberto: aPagarEmAberto.porUnidade[b.branchId] ?? 0,
    proximoAReceber: emAbertoDe[b.branchId]?.proximoAReceber ?? null,
    proximoAPagar:   emAbertoDe[b.branchId]?.proximoAPagar ?? null,
    txCount:     movimentacoes.porUnidade[b.branchId] ?? 0,
  }))

  // Transações enriquecidas com nome da filial — e o desconto embaixo do valor (fin-01).
  const descontos = await descontosDosLancamentos(txs)
  // A23 e A31 da 10ª: o pago com voucher/pontos e a taxa e o líquido de cada receita (do banco).
  // A44 da 12ª: o desconto em reais e a profissional de cada lançamento, para o CSV.
  const [semDinheiro, taxas, extras] = await Promise.all([
    pagosSemDinheiro(txs as unknown as LancamentoSemDinheiro[]),
    getTaxaDosLancamentos(ctx.tenantId!, txs.map(t => t.id)),
    extrasDoCsv(ctx.tenantId!, txs as unknown as LancamentoParaOCsv[]),
  ])
  const transactions = txs.map(t => ({
    ...t,
    desconto_texto: descontos[t.id] ?? null,
    pago_sem_dinheiro: semDinheiro[t.id] ?? null,
    // A36 e A37 da 11ª: o pago e o estornado em parte; o uso do crédito não é receita.
    estorno_parcial_texto: notaDoEstornoParcial(t as unknown as LancamentoParaNota),
    uso_de_credito_texto: notaDoUsoDeCredito(t as unknown as LancamentoParaNota),
    taxa: taxas[t.id]?.taxa ?? null,
    liquido: taxas[t.id]?.liquido ?? null,
    // D9 e A45 da 12ª: o que ele conta no caixa (do banco; nulo = não conta).
    no_caixa: taxas[t.id]?.noCaixa ?? null,
    desconto_valor: extras[t.id]?.desconto ?? null,
    profissional_nome: extras[t.id]?.profissional ?? null,
    // D13 da 9ª: a vencida decidida aqui (o dia de Brasília), não no navegador.
    vencida: !t.is_paid && situacaoDoVencimento(t.due_date) === 'VENCIDA',
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
        totalResult={totalConta.lucro}
        totalConta={totalConta}
        totalCommissions={totalComm}
        totalAReceber={emAbertoDaRede.aReceber}
        totalAReceberEmAberto={aReceberEmAberto.total}
        totalVencidas={vencidas.total}
        totalConcluidosSemPagamento={concluidosSemPagamento}
        totalAPagar={emAbertoDaRede.aPagar}
        totalAPagarEmAberto={aPagarEmAberto.total}
        soAPagar={soAPagar}
        aReceberDaOperadora={operadora}
        debitoNoPeriodo={composicao.formas.find(f => f.chave === 'DEBIT_CARD')?.valor ?? 0}
        parcelasDaOperadora={parcelasDaOperadora}
        fluxoDeCaixa={await getFluxoDeCaixa({ tenantId: ctx.tenantId!, branchIds, porUnidade: true, meses: 12 })}
        totalProximoAReceber={emAbertoDaRede.proximoAReceber}
        totalProximoAPagar={emAbertoDaRede.proximoAPagar}
        totalMovimentacoes={movimentacoes.total}
        prevRevenue={prevRevenue}
        prevExpenses={prevExpenses}
        branchStats={branchStats}
        umaUnidade={await redeTemUmaUnidade(ctx.tenantId!)}
        transactions={transactions}
        soOEmAberto={soOEmAberto}
        soAsVencidas={soAsVencidas}
        nomeDoCsv={soOEmAberto ? nomeDoCsvDosLancamentos(null, null) : nomeDoCsvDosLancamentos(dayKeyTZ(start), dayKeyTZ(fimDoPeriodo))}
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
