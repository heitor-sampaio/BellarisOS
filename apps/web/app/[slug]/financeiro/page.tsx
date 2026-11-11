import { notaDoEstornoParcial, notaDoUsoDeCredito, type LancamentoParaNota } from '@/lib/financeiro/notas-do-lancamento'
import { notFound, redirect } from 'next/navigation'
import { getTenantContext, assertPermission, ownerFilter } from '@/lib/auth'
import { recorteDosModulos } from '@/lib/metrics/escopo'
import { createClient as createSupabase } from '@/lib/supabase/server'

import type { ComponentProps } from 'react'
import { FinancialHub } from '@/components/branch/financial-hub'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { dayKeyTZ } from '@/lib/datetime'
import { nomeDoCsvDosLancamentos } from '@/lib/financeiro/csv-dos-lancamentos'
import { resolvePeriod, getCommissionsDetail, getCore, getComposicaoFinanceira, getSeries, getAPagar, getEmAberto, getTicketMedio, getResultadoDoEstoque, getAReceberEmAberto, getAPagarEmAberto } from '@/lib/metrics'
import { extrasDoCsv, type LancamentoParaOCsv } from '@/lib/financeiro/extras-do-csv'
import { granularidadeDoPeriodo } from '@/lib/financeiro/barras'
import { ler, lerTodas } from '@/lib/db'
import { nomesDosRegistros } from '@/lib/nomes-dos-registros'
import { descontosDosLancamentos } from '@/lib/financeiro/desconto-do-lancamento'
import { pagosSemDinheiro, type LancamentoSemDinheiro } from '@/lib/financeiro/pago-sem-dinheiro'
import { getTaxaDosLancamentos } from '@/lib/metrics/contadora'
import { getAReceberDaOperadora, getParcelasDaOperadora } from '@/lib/metrics/operadora'
import { getFluxoDeCaixa } from '@/lib/metrics/fluxo-de-caixa'
import { getTotalDosAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { getAReceberVencido } from '@/lib/metrics/vencidas'
import { startOfDayTZ } from '@/lib/datetime'
import { situacaoDoVencimento } from '@/lib/financeiro/vencimentos'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'

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
  /** A38 da 8ª: a lista de todo o a receber em aberto, de qualquer vencimento. */
  // D13 da 9ª: ou só as VENCIDAS (o vencimento antes de hoje), de qualquer mês.
  const soAsVencidas = sp.aberto === 'vencidas'
  // A43 da 12ª: ou todo o A PAGAR em aberto, de qualquer vencimento (a despesa).
  const soAPagar = sp.aberto === 'a-pagar'
  const soOEmAberto = sp.aberto === 'todos' || soAsVencidas || soAPagar

  const ctx = await getTenantContext()
  // `cashier` governa RECEBER — no atendimento e no checkout do plano. Esta
  // tela é o financeiro da unidade, e pede o módulo dela.
  assertPermission(ctx, 'financial', 'VIEW')
  // Com o financeiro "só os meus", o financeiro é só "Minhas comissões" (A52,
  // como o da rede): o consolidado meio filtrado não existe.
  if (ownerFilter(ctx, 'financial')) redirect(`/${slug}/financeiro/comissoes`)

  const supabase = await createSupabase()

  const branch = await ler(supabase
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single(), 'buscar a unidade')
  if (!branch) notFound()

  // Janela no fuso da UNIDADE (F62) e período anterior de mesma duração decorrida.
  const fuso = await fusoDaUnidade(ctx.tenantId, branch.id as string)
  const { from: start, to: end, fullTo: fimDoPeriodo, prevFrom: prevStart, prevTo: prevEnd, label } =
    resolvePeriod(period, sp.from, sp.to, new Date(), fuso)

  // Os totais do período vêm do MESMO lugar que alimenta o dashboard e os
  // relatórios: agregados no Postgres, eixo em `paid_at`, estorno fora dos dois
  // lados. Somar a lista abaixo daria outro número assim que existisse uma
  // parcela criada num mês e paga no outro — e o checkout de plano cria
  // exatamente isso.
  const argsDoNucleo = { tenantId: ctx.tenantId!, branchIds: [branch.id as string] }
  const [totais, totaisAnteriores, composicao, serie, emAberto, aPagarAnterior, ticket, estoque, estoqueAnterior, aReceberEmAberto, operadora, parcelasDaOperadora, concluidosSemPagamento] = await Promise.all([
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
    // D-14: todo o a receber em aberto, de qualquer vencimento — no escopo do
    // financeiro (com ele "só os meus", o dos atendimentos dela).
    getAReceberEmAberto({ ...argsDoNucleo, professionalId: recorteDosModulos(ctx).financeiro }),
    // F2c: o cartão em N vezes que a OPERADORA ainda deposita, mês a mês, pelo
    // vencimento — separado do a receber da cliente (ela já pagou tudo).
    getAReceberDaOperadora({ ...argsDoNucleo, from: start, to: fimDoPeriodo }),
    getParcelasDaOperadora({ ...argsDoNucleo, from: start, to: fimDoPeriodo }),
    // "Reforça", item 4: os concluídos sem pagamento, separados dos
    // lançamentos (só apareciam no Fechamento), no escopo do financeiro.
    getTotalDosAtendimentosAReceber({ tenantId: ctx.tenantId!, unidadeId: branch.id as string, profissionalId: recorteDosModulos(ctx).financeiro }),
  ])
  // D13 da 9ª: o que já venceu (antes de hoje), no escopo do financeiro.
  const vencidas = await getAReceberVencido({ ...argsDoNucleo, professionalId: recorteDosModulos(ctx).financeiro })

  // Em páginas (2026-10-22): o PostgREST corta em 1000, e o extrato do período
  // perdia os lançamentos mais antigos — a busca e os filtros da lista também.
  const unidadeId = branch.id as string
  const lancamentos = await lerTodas((de, ate) => soAsVencidas
    ? doPeriodo(de, ate).lt('due_date', startOfDayTZ(new Date(), fuso).toISOString())
    : doPeriodo(de, ate), 'carregar os lançamentos')
  function doPeriodo(de: number, ate: number) {
    return supabase
    .from('financial_transactions')
    .select('id, type, category, description, amount, payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, due_date, notes, estorno_motivo, product_sale_id, credito_vendido_id, sale_discount, desconto_motivo, client_package_id, procedure_sale_id, treatment_plan_id, created_at, appointment_id, data_de_referencia, parcela_numero, parcela_total, client_id, vencimentos_anteriores, loyalty_discount, fornecedor, nota_fiscal, valor_antes_do_estorno')
    .eq('branch_id', unidadeId)
    .or(soOEmAberto ? 'notes.is.null,notes.neq.Estornada' : 'is_paid.eq.true,amount.neq.0')
    // A38 da 8ª: "Ver e dar baixa" — todo o a receber em aberto, de qualquer
    // vencimento (a parcela do mês que vem não aparecia em lugar nenhum).
    // Senão, o período é pela DATA DE REFERÊNCIA (2026-09-30): o pago, no dia
    // do pagamento; o em aberto, no vencimento — e até o fim do PERÍODO, não
    // "agora" (o relógio do Postgres está à frente do do app).
    .gte(soOEmAberto ? 'amount' : 'data_de_referencia', soOEmAberto ? 0.01 : start.toISOString())
    .lte('data_de_referencia', soOEmAberto ? '9999-12-31' : fimDoPeriodo.toISOString())
    .in('type', soAPagar ? ['EXPENSE'] : soOEmAberto ? ['INCOME'] : ['INCOME', 'EXPENSE'])
    .in('is_paid', soOEmAberto ? [false] : [true, false])
    .order('data_de_referencia', { ascending: soOEmAberto }).order('id')
    .range(de, ate)
  }

  // O nome da cliente NÃO vem pelo join da sessão (D2 da simulação de
  // 2026-11-01): a RLS mostra a ficha só à unidade de CADASTRO, e a venda da
  // cliente de outra unidade aparecia com "—". Os lançamentos acima já são os
  // desta unidade, ao alcance da sessão; daqui saem só os nomes.
  const nomes = await nomesDosRegistros(ctx.tenantId!, {
    clientes: (lancamentos ?? []).map(t => t.client_id as string | null),
  })
  // O desconto embaixo do valor (fin-01).
  const descontos = await descontosDosLancamentos(lancamentos ?? [])
  // A23 e A31 da 10ª: o pago com voucher/pontos e a taxa e o líquido de cada receita (do banco).
  // A44 da 12ª: o desconto em reais e a profissional de cada lançamento, para o CSV;
  // A43: todo o a pagar em aberto da unidade.
  const [semDinheiro, taxas, extras, aPagarEmAberto] = await Promise.all([
    pagosSemDinheiro((lancamentos ?? []) as LancamentoSemDinheiro[]),
    getTaxaDosLancamentos(ctx.tenantId!, (lancamentos ?? []).map(t => t.id as string)),
    extrasDoCsv(ctx.tenantId!, (lancamentos ?? []) as unknown as LancamentoParaOCsv[]),
    getAPagarEmAberto({ tenantId: ctx.tenantId!, branchIds: [unidadeId] }),
  ])
  const transactions = (lancamentos ?? []).map(({ client_id, ...t }) => ({
    ...t,
    desconto_texto: descontos[t.id as string] ?? null,
    pago_sem_dinheiro: semDinheiro[t.id as string] ?? null,
    // A36 e A37 da 11ª: o pago e o estornado em parte; o uso do crédito não é receita.
    estorno_parcial_texto: notaDoEstornoParcial(t as unknown as LancamentoParaNota),
    uso_de_credito_texto: notaDoUsoDeCredito(t as unknown as LancamentoParaNota),
    taxa: taxas[t.id as string]?.taxa ?? null,
    liquido: taxas[t.id as string]?.liquido ?? null,
    // D9 e A45 da 12ª: o que ele conta no caixa (do banco; nulo = não conta).
    no_caixa: taxas[t.id as string]?.noCaixa ?? null,
    desconto_valor: extras[t.id as string]?.desconto ?? null,
    profissional_nome: extras[t.id as string]?.profissional ?? null,
    unidade_nome: branch.name as string,
    // D13 da 9ª: a vencida decidida aqui (o dia de Brasília), não no navegador.
    vencida: !t.is_paid && situacaoDoVencimento(t.due_date as string | null) === 'VENCIDA',
    cliente: client_id && nomes.clientes[client_id] ? { name: nomes.clientes[client_id] } : null,
  }))



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
        .eq('branch_id', unidadeId)
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
        aReceberEmAberto={aReceberEmAberto.total}
        concluidosSemPagamento={concluidosSemPagamento}
        aReceberDaOperadora={operadora.total}
        parcelasDaOperadora={parcelasDaOperadora}
        fluxoDeCaixa={ownFinancial ? undefined : (await getFluxoDeCaixa({ ...argsDoNucleo, meses: 12 })).total}
        composicao={composicao}
        branchId={branch.id}
        branchName={branch.name}
        slug={slug}
        period={period}
        periodLabel={label}
        periodStart={start.toISOString()}
        customFrom={sp.from}
        customTo={sp.to}
        transactions={transactions as unknown as Props['transactions']}
        soOEmAberto={soOEmAberto}
        soAsVencidas={soAsVencidas}
        soAPagar={soAPagar}
        aPagarEmAberto={aPagarEmAberto.total}
        vencidas={vencidas.total}
        nomeDoCsv={soOEmAberto ? nomeDoCsvDosLancamentos(null, null) : nomeDoCsvDosLancamentos(dayKeyTZ(start, fuso), dayKeyTZ(fimDoPeriodo, fuso))}
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
