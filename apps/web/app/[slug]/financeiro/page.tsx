import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'

import type { ComponentProps } from 'react'
import { FinancialHub } from '@/components/branch/financial-hub'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { resolvePeriod, getCommissionsDetail, getCore, getComposicaoFinanceira, getSeries, getAPagar, getEmAberto, getTicketMedio, getResultadoDoEstoque } from '@/lib/metrics'
import { granularidadeDoPeriodo } from '@/lib/financeiro/barras'
import { ler, lerTodas } from '@/lib/db'

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
  const [totais, totaisAnteriores, composicao, serie, emAberto, aPagarAnterior, ticket, estoque, estoqueAnterior] = await Promise.all([
    getCore({ ...argsDoNucleo, from: start,     to: end }),
    getCore({ ...argsDoNucleo, from: prevStart, to: prevEnd }),
    // Formas de pagamento e categorias: também do banco (a tela somava a lista).
    getComposicaoFinanceira({ ...argsDoNucleo, from: start, to: end }),
    // O gráfico e o "A pagar" também (2026-10-21): eram somados na lista.
    getSeries({ ...argsDoNucleo, from: start, to: end, granularity: granularidadeDoPeriodo(period) }),
    // A receber e a pagar pelo VENCIMENTO, até o fim do período, e o próximo
    // vencimento de cada lado (A34, 2026-10-27).
    getEmAberto({ ...argsDoNucleo, from: start, to: fimDoPeriodo }),
    getAPagar({ ...argsDoNucleo, from: prevStart, to: prevEnd }),
    // Ticket médio = o pago pelas clientes ÷ as que pagaram (2026-10-29), a conta do sistema.
    getTicketMedio({ ...argsDoNucleo, from: start, to: end }),
    // O lucro desconta o insumo consumido e deixa a compra de estoque no caixa (2026-10-29).
    getResultadoDoEstoque({ ...argsDoNucleo, from: start, to: end }),
    getResultadoDoEstoque({ ...argsDoNucleo, from: prevStart, to: prevEnd }),
  ])

  // Em páginas (2026-10-22): o PostgREST corta em 1000, e o extrato do período
  // perdia os lançamentos mais antigos — a busca e os filtros da lista também.
  const transactions = await lerTodas((de, ate) => supabase
    .from('financial_transactions')
    .select('id, type, category, description, amount, payment_method, cartao_vezes, is_paid, paid_at, due_date, notes, estorno_motivo, created_at, appointment_id, data_de_referencia, parcela_numero, parcela_total, cliente:clients!financial_transactions_client_id_fkey(name)')
    .eq('branch_id', branch.id)
    // O período é pela DATA DE REFERÊNCIA (2026-09-30): o pago, no dia do
    // pagamento; o em aberto, no vencimento. Cada parcela aparece no mês dela —
    // pela criação, o parcelado inteiro caía no mês da venda. O saldo zerado
    // (substituído no check-in) é histórico: fica fora da lista.
    .or('is_paid.eq.true,amount.neq.0')
    .gte('data_de_referencia', start.toISOString())
    // Fim do PERÍODO, não "agora" — ver o mesmo comentário no financeiro da
    // rede. O relógio do Postgres está à frente do relógio do app, e um
    // lançamento feito neste segundo sumia da tela que acabou de criá-lo.
    .lte('data_de_referencia', fimDoPeriodo.toISOString())
    .order('data_de_referencia', { ascending: false }).order('id')
    .range(de, ate), 'carregar os lançamentos')



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

  // Por `ler`: sem checar o erro, uma falha virava "nenhum cliente" no
  // lançamento de crédito, sem nada acusando.
  // Todas as clientes ativas da unidade (eram as 300 primeiras do alfabeto).
  const clientsRaw = canWrite
    ? await lerTodas((de, ate) => supabase
        .from('clients')
        .select('id, name')
        .eq('branch_id', branch.id)
        .eq('is_active', true)
        .order('name').order('id')
        .range(de, ate), 'carregar os clientes da unidade')
    : []

  const clients = ((clientsRaw ?? []) as { id: string; name: string }[]).map(c => ({ id: c.id, name: c.name }))

  type Props = ComponentProps<typeof FinancialHub>

  return (
    <>
      <RealtimeRefresher tables={['financial_transactions', 'commissions']} />

      <FinancialHub
        totais={totais}
        totaisAnteriores={totaisAnteriores}
        ticketMedio={ticket.total.valor}
        estoqueNoResultado={estoque.total}
        estoqueNoResultadoAnterior={estoqueAnterior.total}
        composicao={composicao}
        branchId={branch.id}
        branchName={branch.name}
        slug={slug}
        period={period}
        periodLabel={label}
        periodStart={start.toISOString()}
        customFrom={sp.from}
        customTo={sp.to}
        transactions={(transactions ?? []) as unknown as Props['transactions']}
        serie={serie}
        emAberto={emAberto}
        aPagarAnterior={aPagarAnterior}
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
