import { nomesDasMaquininhas } from '@/lib/financeiro/vezes-da-rede'
import { maquininhaDoRotulo } from '@/lib/financeiro/formas'
import { notaDoEstornoParcial, notaDoUsoDeCredito, type LancamentoParaNota } from '@/lib/financeiro/notas-do-lancamento'
import { notFound, redirect } from 'next/navigation'
import { comAviso } from '@/lib/aviso-da-url'
import { getTenantContext, assertPermission, assertUnidade, ownerFilter, temRecurso, alcancaUnidade } from '@/lib/auth'
import { podeDarBaixa } from '@/lib/financeiro/so-os-meus'
import { abaDoFinanceiro } from '@/lib/financeiro/abas'
import { createAdminClient } from '@/lib/supabase/admin'
import { recorteDosModulos } from '@/lib/metrics/escopo'

import type { ComponentProps } from 'react'
import { FinancialHub } from '@/components/branch/financial-hub'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { dayKeyTZ } from '@/lib/datetime'
import { nomeDoCsvDosLancamentos } from '@/lib/financeiro/csv-dos-lancamentos'
import { resolvePeriod, getCommissionsDetail, getCore, getComposicaoFinanceira, getSeries, getEmAberto, getTicketMedio, getResultadoDoEstoque, getAReceberEmAberto, getAPagarEmAberto, getTaxasDoPeriodo } from '@/lib/metrics'
import { extrasDoCsv, type LancamentoParaOCsv } from '@/lib/financeiro/extras-do-csv'
import { granularidadeDoPeriodo } from '@/lib/financeiro/barras'
import { ler, lerTodas } from '@/lib/db'
import { nomesDosRegistros } from '@/lib/nomes-dos-registros'
import { descontosDosLancamentos, type LancamentoComDesconto } from '@/lib/financeiro/desconto-do-lancamento'
import { pagosSemDinheiro, type LancamentoSemDinheiro } from '@/lib/financeiro/pago-sem-dinheiro'
import { getTaxaDosLancamentos } from '@/lib/metrics/contadora'
import { getAReceberDaOperadora, getParcelasDaOperadora } from '@/lib/metrics/operadora'
import { comOProcedimento, parcelasComOProcedimento } from '@/lib/financeiro/procedimento-do-lancamento'
import { getFluxoDeCaixa } from '@/lib/metrics/fluxo-de-caixa'
import { getTotalDosAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { getAReceberVencido } from '@/lib/metrics/vencidas'
import { startOfDayTZ } from '@/lib/datetime'
import { situacaoDoVencimento } from '@/lib/financeiro/vencimentos'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { tagsDaUrl } from '@/lib/tags/filtro-na-url'
import { tagsAtivasDaRede } from '@/lib/tags/vocabulario'
import { selectComAsTags, comAsTags } from '@/lib/financeiro/filtro-de-tags'

/**
 * Uma linha da lista, como o select pede. Com as Tags o select é montado
 * (`selectComAsTags`) e o tipo deixa de sair do texto: os campos lidos aqui
 * vão nomeados; o resto segue para a tela como antes.
 */
type LancamentoLido = Record<string, unknown> & LancamentoComDesconto & {
  id: string; client_id: string | null; maquininha_id: string | null
  is_paid: boolean; due_date: string | null; description?: unknown; appointment_id?: unknown
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
  // FI1 (a revisão do Heitor, 2026-11-13): as abas Resumo · A receber · A
  // pagar · Movimentações (· Comissões, a página dela). Abre no Resumo.
  const pedida = abaDoFinanceiro(sp)
  const aba = pedida.aba
  /** A38 da 8ª / FI3: o A receber é todo o a receber em aberto, de qualquer vencimento. */
  // D13 da 9ª: ou só as VENCIDAS (o vencimento antes de hoje), de qualquer mês.
  const soAsVencidas = pedida.soAsVencidas
  // A43 da 12ª / FI4: o A pagar é todo o a pagar em aberto, de qualquer vencimento (a despesa).
  const soAPagar = aba === 'a-pagar'
  const soOEmAberto = aba === 'a-receber' || soAPagar
  // As Tags (CLAUDE.md §1): a lista só com os lançamentos das clientes com
  // TODAS as tags marcadas — na consulta (comAsTags); o Resumo não tem a lista.
  const tags = aba === 'resumo' ? [] : tagsDaUrl(sp.tags)

  const ctx = await getTenantContext()
  // `cashier` governa RECEBER — no atendimento e no checkout do plano. Esta
  // tela é o financeiro da unidade, e pede o módulo dela.
  assertPermission(ctx, 'financial', 'VIEW')
  // Com o financeiro "só os meus", o financeiro é só "Minhas comissões" (A52,
  // como o da rede): o consolidado meio filtrado não existe.
  if (ownerFilter(ctx, 'financial')) redirect(`/${slug}/financeiro/comissoes`)
  // Os links antigos (`?aberto=todos|vencidas|a-pagar`) levam à aba nova (FI1).
  if (pedida.destino) redirect(`/${slug}/financeiro${pedida.destino}`)

  const branch = await ler(createAdminClient()
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single(), 'buscar a unidade')
  if (!branch) notFound()
  // A sessão só lê sinais (o Heitor, 19/11, "vai na 2"): a unidade se lê pelo
  // servidor, e a abrangência que a RLS conferia se confere aqui.
  if (!alcancaUnidade(ctx, branch.id as string)) notFound()
  // F75: os lançamentos se leem pelo SERVIDOR (a sessão não lê
  // financial_transactions — a política dava o caixa da unidade a todo membro,
  // sem o módulo). Daí o alcance conferido aqui, não pela RLS.
  assertUnidade(ctx, branch.id as string)
  // A14 da 13ª simulação (F70): "?unidade=<outra>" aqui abria ESTA unidade
  // calado — a pessoa achava que via a outra. O filtro de unidade é do portal
  // da rede; aqui, o aviso (princípio 3) e a URL sem ele.
  if (sp.unidade && sp.unidade !== slug && sp.unidade !== branch.id) {
    const resto = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== 'unidade'))
    const busca = resto.toString()
    redirect(comAviso(`/${slug}/financeiro${busca ? `?${busca}` : ''}`, 'filtro-de-unidade'))
  }

  // Janela no fuso da UNIDADE (F62) e período anterior de mesma duração decorrida.
  const fuso = await fusoDaUnidade(ctx.tenantId, branch.id as string)
  const { from: start, to: end, fullTo: fimDoPeriodo, prevFrom: prevStart, prevTo: prevEnd, prevFullTo, label } =
    resolvePeriod(period, sp.from, sp.to, new Date(), fuso)

  // Os totais do período vêm do MESMO lugar que alimenta o dashboard e os
  // relatórios: agregados no Postgres, eixo em `paid_at`, cada lado do estorno no
  // seu dia (F59). Somar a lista abaixo daria outro número assim que existisse uma
  // parcela criada num mês e paga no outro — e o checkout de plano cria
  // exatamente isso.
  const argsDoNucleo = { tenantId: ctx.tenantId!, branchIds: [branch.id as string] }
  const [totais, totaisAnteriores, composicao, serie, emAberto, emAbertoAnterior, ticket, estoque, estoqueAnterior, aReceberEmAberto, operadora, parcelasDaOperadora, concluidosSemPagamento] = await Promise.all([
    getCore({ ...argsDoNucleo, from: start,     to: end }),
    getCore({ ...argsDoNucleo, from: prevStart, to: prevEnd }),
    // Formas de pagamento e categorias: também do banco (a tela somava a lista).
    getComposicaoFinanceira({ ...argsDoNucleo, from: start, to: end }),
    // O gráfico e o "A pagar" também (2026-10-21): eram somados na lista.
    getSeries({ ...argsDoNucleo, from: start, to: end, granularity: granularidadeDoPeriodo(period) }),
    // A receber e a pagar pelo VENCIMENTO, até o fim do período, e o próximo
    // vencimento de cada lado (A34, 2026-10-27).
    getEmAberto({ ...argsDoNucleo, from: start, to: fimDoPeriodo }),
    // O anterior INTEIRO, pela mesma régua (C46 da F68): era o a pagar só do
    // trecho decorrido, contra o período atual inteiro.
    getEmAberto({ ...argsDoNucleo, from: prevStart, to: prevFullTo }),
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
    getParcelasDaOperadora({ ...argsDoNucleo, from: start, to: fimDoPeriodo })
      .then(ps => parcelasComOProcedimento(ctx.tenantId!, ps)),
    // "Reforça", item 4: os concluídos sem pagamento, separados dos
    // lançamentos (só apareciam no Fechamento), no escopo do financeiro.
    getTotalDosAtendimentosAReceber({ tenantId: ctx.tenantId!, unidadeId: branch.id as string, profissionalId: recorteDosModulos(ctx).financeiro }),
  ])
  // D13 da 9ª: o que já venceu (antes de hoje), no escopo do financeiro.
  const vencidas = await getAReceberVencido({ ...argsDoNucleo, professionalId: recorteDosModulos(ctx).financeiro })

  // Em páginas (2026-10-22): o PostgREST corta em 1000, e o extrato do período
  // perdia os lançamentos mais antigos — a busca e os filtros da lista também.
  const unidadeId = branch.id as string
  // FI2: o Resumo não tem a lista — só as outras abas a leem.
  // A26 da 24ª: o lançamento do atendimento diz o procedimento ("Atendimento concluído" não dizia).
  const lancamentos = aba === 'resumo' ? [] : await comOProcedimento(ctx.tenantId!, (await lerTodas((de, ate) => soAsVencidas
    ? doPeriodo(de, ate).lt('due_date', startOfDayTZ(new Date(), fuso).toISOString())
    : doPeriodo(de, ate), 'carregar os lançamentos')) as unknown as LancamentoLido[] ?? [])
  function doPeriodo(de: number, ate: number) {
    // As Tags: a cliente pelo embed INNER e o `cs` (todas) — lib/financeiro/filtro-de-tags.
    return comAsTags(createAdminClient()
    .from('financial_transactions')
    .select(selectComAsTags('id, type, category, description, amount, payment_method, cartao_vezes, cartao_bandeira, maquininha_id, is_paid, paid_at, due_date, notes, estorno_motivo, product_sale_id, credito_vendido_id, sale_discount, desconto_motivo, client_package_id, procedure_sale_id, treatment_plan_id, created_at, appointment_id, data_de_referencia, parcela_numero, parcela_total, client_id, vencimentos_anteriores, loyalty_discount, fornecedor, nota_fiscal, valor_antes_do_estorno', tags))
    .eq('branch_id', unidadeId), tags)
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
  const [semDinheiro, taxas, extras, aPagarEmAberto, maquininhas] = await Promise.all([
    pagosSemDinheiro((lancamentos ?? []) as unknown as LancamentoSemDinheiro[]),
    getTaxaDosLancamentos(ctx.tenantId!, (lancamentos ?? []).map(t => t.id as string)),
    extrasDoCsv(ctx.tenantId!, (lancamentos ?? []) as unknown as LancamentoParaOCsv[]),
    getAPagarEmAberto({ tenantId: ctx.tenantId!, branchIds: [unidadeId] }),
    // A18 da 14ª: com mais de uma maquininha, a lista e o CSV dizem qual.
    nomesDasMaquininhas(ctx.tenantId!),
  ])
  // As opções do filtro de Tags: o vocabulário da rede, lido aqui (quem só tem
  // o Financeiro também as vê); o Resumo não tem o filtro.
  const tagsDaRede = aba === 'resumo' ? [] : await tagsAtivasDaRede(ctx.tenantId!)
  const transactions = (lancamentos ?? []).map(({ client_id, maquininha_id, ...t }) => ({
    ...t,
    maquininha_nome: maquininhaDoRotulo(maquininhas, maquininha_id as string | null),
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
    vendedor_nome: extras[t.id as string]?.vendedor ?? null,
    unidade_nome: branch.name as string,
    // D13 da 9ª: a vencida decidida aqui (o dia de Brasília), não no navegador.
    vencida: !t.is_paid && situacaoDoVencimento(t.due_date as string | null, new Date(), fuso) === 'VENCIDA',
    cliente: client_id && nomes.clientes[client_id] ? { name: nomes.clientes[client_id] } : null,
  }))



  // Comissões do período (registros individuais).
  // `commissions` não tem `created_at` nem `is_paid` — a consulta anterior
  // pedia as duas, o PostgREST devolvia erro 42703, o erro era descartado e o
  // card ficava zerado. O período vem do atendimento e o pagamento, de `status`.
  // Alcance "só as próprias comissões": o cargo continua entrando na tela, mas
  // ela se resume ao que é dele. O resto (receita, despesas, lançamentos da
  // unidade) não é renderizado — ver `ownScope` no hub.
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

  // Lançar e estornar são do financeiro. Dar baixa é do PDV ou do Financeiro em
  // Gerenciar de todos (CX2, o Heitor, 13/11: o Financeiro "dá baixa só no que
  // entra sem passar pelo balcão"; era só o PDV, C33).
  const canWrite   = ctx.permissions.financial === 'MANAGE' && !ownFinancial
  const canReverse = canWrite
  const canPay     = podeDarBaixa(ctx)

  type Props = ComponentProps<typeof FinancialHub>

  return (
    <>
      <RealtimeRefresher tables={['financeiro_sinais', 'comissoes_sinais']} />

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
        soAsVencidas={soAsVencidas}
        aPagarEmAberto={aPagarEmAberto.total}
        vencidas={vencidas.total}
        nomeDoCsv={soOEmAberto ? nomeDoCsvDosLancamentos(null, null) : nomeDoCsvDosLancamentos(dayKeyTZ(start, fuso), dayKeyTZ(fimDoPeriodo, fuso))}
        serie={serie}
        emAberto={emAberto}
        emAbertoAnterior={emAbertoAnterior}
        commissions={commissions}
        canReverse={canReverse}
        canWrite={canWrite}
        canPay={canPay}
        ownScope={!!ownFinancial}
        // CX6 (2026-11-14): as taxas estimadas e a venda sem taxa do período, da unidade.
        taxasDoPeriodo={ownFinancial ? undefined : (await getTaxasDoPeriodo({ ...argsDoNucleo, from: start, to: end })).total}
        aba={aba}
        tagsDaRede={tagsDaRede}
        tags={tags}
        comComissoes={temRecurso(ctx, 'comissoes')}
      />
    </>
  )
}
