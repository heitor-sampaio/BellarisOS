import { situacaoDoVencimento, textoDoVencimento } from '@/lib/financeiro/vencimentos'
import { anterioresEmAbertoEmTexto, type ParcelaParaAdiantar } from '@/lib/pdv/situacoes'
import type { TenantContext } from '@estetica-os/types'
import { can, isOwnScope, podeReceber, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { formaDoLancamento, rotuloDaForma } from '@/lib/financeiro/formas'
import { juntarAsFormasDaParcela, formasDaParcelaEmTexto } from '@/lib/financeiro/formas-da-parcela'
import { vendaDeProdutoNaoPontua } from '@/lib/fidelidade/leitura'
import { ordenarTransacoesDaFicha } from '@/lib/clientes/ordem-das-transacoes'
import { getAtendimentosAReceber, type ListaAReceber } from '@/lib/metrics/a-receber'
import type { ProfileTransaction, ProfileInternalCredit } from '@/components/branch/client-profile'

/**
 * O financeiro da ficha da cliente — o mesmo nos dois portais (a ficha da
 * unidade e a da rede repetiam a leitura).
 *
 * Quem vê: o financeiro ou quem recebe (simulação de 2026-10-20: a aba abria
 * para o SDR). Com `financial: só os próprios` e sem receber — a Profissional,
 * que tem o financeiro para ver as comissões DELA —, só o que é dos
 * atendimentos dela, totais incluídos (D6 da simulação de 2026-10-27; ela via
 * o total pago e a receber de todos). Quem recebe vê tudo: recebe de todos.
 *
 * Os totais vêm do banco (`metrics_financeiro_do_cliente`): a aba somava na
 * tela as últimas 50 linhas.
 */
export interface FinanceiroDaFicha {
  veFinanceiro:    boolean
  /** Recortado pelos atendimentos de quem vê. */
  soOsProprios:    boolean
  transactions:    ProfileTransaction[]
  internalCredits: ProfileInternalCredit[]
  totais:          { pago: number; aReceber: number; credito: number | null }
  aReceber:        ListaAReceber
  /**
   * CX3: a comanda do PDV a que o "Receber no PDV" da ficha leva — a do
   * atendimento a receber mais antigo numa unidade ao alcance de quem lê.
   */
  comandaParaReceber: { comandaId: string | null; unidadeId: string; slug: string } | null
  /**
   * A2 da 25ª: os planos ACEITOS e ainda não recebidos — não estão no "A
   * receber" (o aceite não lança dinheiro; o plano é venda quando é pago), e a
   * ficha diz quais, quanto (`metrics_financeiro_do_plano`) e a comanda do PDV.
   */
  planosNaoRecebidos: PlanoNaoRecebido[]
}

export interface PlanoNaoRecebido {
  id: string; nome: string; valor: number
  comandaId: string | null; unidadeId: string; slug: string
}

const VAZIO: ListaAReceber = { itens: [], total: { n: 0, valor: 0 } }

type Linha = {
  id: string; type: string; description: string; amount: number | string; payment_method: string | null
  cartao_vezes: number | null; cartao_bandeira: string | null; is_paid: boolean; paid_at: string | null; created_at: string; due_date: string | null
  notes: string | null; category: string | null; appointment_id: string | null; parcela_numero: number | null
  parcela_total: number | null
  product_sale_id: string | null
  credito_vendido_id: string | null
  client_package_id: string | null; procedure_sale_id: string | null; treatment_plan_id: string | null
  branch_id: string | null
  appointment: { scheduled_at: string; professional_id: string | null; procedures: { name: string } | null } | null
}

export async function financeiroDaFicha(ctx: TenantContext, clientId: string): Promise<FinanceiroDaFicha> {
  const veFinanceiro = can(ctx, 'financial', 'VIEW') || podeReceber(ctx)
  if (!veFinanceiro) {
    return { veFinanceiro, soOsProprios: false, transactions: [], internalCredits: [], totais: { pago: 0, aReceber: 0, credito: null }, aReceber: VAZIO, comandaParaReceber: null, planosNaoRecebidos: [] }
  }
  const soOsProprios = isOwnScope(ctx, 'financial') && ctx.permissions.cashier !== 'MANAGE'
  const meu = soOsProprios ? (ctx.internalUserId ?? '00000000-0000-0000-0000-000000000000') : null
  const admin = createAdminClient()

  const [linhas, totaisRaw, aReceber, creditos, planosNaoRecebidos] = await Promise.all([
    lerTodas<unknown>((de, ate) => {
      let q = admin.from('financial_transactions')
        .select(`id, type, description, amount, payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_at, due_date, notes, category, appointment_id, parcela_numero, parcela_total, product_sale_id, credito_vendido_id, client_package_id, procedure_sale_id, treatment_plan_id, branch_id,
          branches!inner(tenant_id),
          appointment:appointments!financial_transactions_appointment_id_fkey${meu ? '!inner' : ''}(scheduled_at, professional_id, procedures(name))`)
        .eq('client_id', clientId).eq('branches.tenant_id', ctx.tenantId!)
      if (meu) q = q.eq('appointment.professional_id', meu)
      return q.order('created_at', { ascending: false }).order('id').range(de, ate)
    }, 'carregar os lançamentos da cliente'),
    ler(admin.rpc('metrics_financeiro_do_cliente', { p_tenant: ctx.tenantId!, p_client: clientId, p_profissional: meu }),
      'calcular os totais da cliente'),
    getAtendimentosAReceber({ tenantId: ctx.tenantId!, clienteId: clientId, profissionalId: meu }),
    soOsProprios ? Promise.resolve([]) : ler(admin.from('internal_credits')
      .select('id, amount, description, created_at, concedido, transaction_id, credito_vendido_id').eq('client_id', clientId)
      .order('created_at', { ascending: false }), 'carregar o crédito interno'),
    // A2 da 25ª: o plano não é dos atendimentos de ninguém — "só os meus" não o lê.
    soOsProprios ? Promise.resolve([] as PlanoNaoRecebido[]) : planosAceitosNaoRecebidos(ctx.tenantId!, clientId),
  ])

  const t = ((totaisRaw ?? []) as { pago: number | string; a_receber: number | string; credito: number | string | null }[])[0]
  // A40 da 6ª simulação: com a fidelidade ligada e a venda de produto sem
  // pontuar (a regra de padrão, D4), o lançamento da venda diz por quê — a
  // ficha mostrava o pago e nada sobre os pontos que não vieram.
  const produtoNaoPontua = await vendaDeProdutoNaoPontua(ctx.tenantId!, admin)
  // O "hoje" do vencimento é o da unidade do lançamento (F64, C4).
  const fusos = new Map<string, string>()
  for (const b of new Set((linhas as Linha[]).map(l => l.branch_id ?? ''))) fusos.set(b, await fusoDaUnidade(ctx.tenantId, b || null))
  // A3 da 21ª (o A5 da 20ª no PDV): a parcela recebida antes das anteriores da
  // mesma venda avisa também no "Receber" da ficha. As parcelas em aberto, como o PDV as lê.
  const vendaDaLinha = (l: Linha) => l.client_package_id ?? l.procedure_sale_id ?? l.product_sale_id ?? l.credito_vendido_id ?? l.treatment_plan_id ?? l.appointment_id ?? null
  const emAberto: ParcelaParaAdiantar[] = (linhas as Linha[])
    .filter(l => l.type === 'INCOME' && !l.is_paid && l.notes !== 'Estornada' && l.parcela_numero != null)
    .map(l => ({
      id: l.id, numero: l.parcela_numero, total: l.parcela_total, venda: vendaDaLinha(l),
      vencimento: textoDoVencimento(l.due_date, new Date(), fusos.get(l.branch_id ?? '')),
    }))
  const adiantadaDe = (l: Linha) => {
    const p = emAberto.find(o => o.id === l.id)
    return p ? anterioresEmAbertoEmTexto(p, emAberto) : null
  }
  // D7 da 10ª: em ordem pela data que a linha mostra (ordenarTransacoesDaFicha).
  // Limite da 21ª: a parcela recebida em várias formas é UMA linha (o total e cada forma).
  const transactions: ProfileTransaction[] = ordenarTransacoesDaFicha(juntarAsFormasDaParcela(linhas as Linha[]).map(l => ({
    id:            l.id,
    description:   l.description,
    amount:        Number(l.amount),
    paymentMethod: l.payment_method,
    cartaoVezes:   l.cartao_vezes,
    semPontos:     produtoNaoPontua && !!l.product_sale_id && l.is_paid && l.type === 'INCOME' && l.notes !== 'Estornada',
    // D6: a parcela do crediário sem meio diz "Com a clínica".
    forma:         formaDoLancamento({ metodo: l.payment_method, vezes: l.cartao_vezes, bandeira: l.cartao_bandeira, pago: l.is_paid, parcela: l.parcela_numero }),
    isPaid:        l.is_paid,
    paidAt:        l.paid_at,
    createdAt:     l.created_at,
    procedureName: l.appointment?.procedures?.name ?? null,
    scheduledAt:   l.appointment?.scheduled_at ?? null,
    dueDate:       l.due_date,
    // D13 da 9ª: "Vencida em 05/11" (o dia decidido aqui, no servidor).
    vencida:       l.type === 'INCOME' && !l.is_paid && l.notes !== 'Estornada' && situacaoDoVencimento(l.due_date, new Date(), fusos.get(l.branch_id ?? '')) === 'VENCIDA',
    isCheckout:    !l.appointment_id && l.category !== 'Estorno',
    // O estorno com o sinal certo e o original marcado (D6, 2026-10-28).
    estornada:     l.notes === 'Estornada',
    estorno:       l.category === 'Estorno',
    saida:         l.type === 'EXPENSE',
    parcela:       l.parcela_numero,
    // A32 da 12ª: o estorno pela ficha abre a janela certa.
    vendaDeProduto: !!l.product_sale_id,
    vendaDeCredito: !!l.credito_vendido_id,
    doAtendimento:  !!l.appointment_id,
    adiantada:      adiantadaDe(l),
    formas:         l.formasDaParcela
      ? { texto: formasDaParcelaEmTexto(l.formasDaParcela), itens: l.formasDaParcela.map(f => ({ id: f.id, rotulo: rotuloDaForma(f.forma, f.vezes), valor: f.valor, metodo: f.forma })) }
      : null,
  })))

  const primeira = aReceber.itens.find(a => alcancaUnidade(ctx, a.branchId)) ?? null
  return {
    veFinanceiro, soOsProprios, transactions, aReceber, planosNaoRecebidos,
    comandaParaReceber: primeira ? { comandaId: primeira.comandaId, unidadeId: primeira.branchId, slug: primeira.branchSlug } : null,
    internalCredits: ((creditos ?? []) as { id: string; amount: number | string; description: string; created_at: string; concedido: boolean | null; transaction_id: string | null; credito_vendido_id: string | null }[])
      // A41 da 9ª: de onde veio cada crédito (o concedido nunca teve dinheiro).
      // A29 da 10ª: o comprado (o "vale" do Vender), que entra no Investido total na compra.
      .map(c => ({ id: c.id, amount: Number(c.amount), description: c.description, createdAt: c.created_at, concedido: !!c.concedido, transactionId: c.transaction_id, comprado: !!c.credito_vendido_id })),
    totais: {
      pago:     Number(t?.pago ?? 0),
      aReceber: Number(t?.a_receber ?? 0),
      credito:  t?.credito == null ? null : Number(t.credito),
    },
  }
}

/**
 * A2 da 25ª: os planos aceitos da cliente sem recebimento nenhum — a mesma
 * régua do resumo do plano (`getResumoDoPlano`: nenhum lançamento de receita
 * vivo). O valor é o do plano (`metrics_financeiro_do_plano`).
 */
async function planosAceitosNaoRecebidos(tenantId: string, clientId: string): Promise<PlanoNaoRecebido[]> {
  const admin = createAdminClient()
  const planos = ((await ler(admin.from('treatment_plans').select('id, name, branch_id, branches!inner(tenant_id, slug)')
    .eq('client_id', clientId).eq('status', 'ACCEPTED').eq('branches.tenant_id', tenantId)
    .order('created_at'), 'buscar os planos aceitos da cliente')) ?? []) as unknown as
    { id: string; name: string | null; branch_id: string; branches: { slug: string } | null }[]
  if (!planos.length) return []
  const ids = planos.map(p => p.id)
  const [vivos, comandas] = await Promise.all([
    ler(admin.from('financial_transactions').select('treatment_plan_id').in('treatment_plan_id', ids).eq('type', 'INCOME')
      .is('estorno_de', null).or('notes.is.null,notes.neq.Estornada'), 'conferir se os planos foram recebidos'),
    ler(admin.from('comandas').select('id, treatment_plan_id').in('treatment_plan_id', ids).is('cancelada_em', null),
      'buscar as comandas dos planos'),
  ])
  const recebidos = new Set(((vivos ?? []) as { treatment_plan_id: string }[]).map(v => v.treatment_plan_id))
  const comandaDo = new Map(((comandas ?? []) as { id: string; treatment_plan_id: string }[]).map(c => [c.treatment_plan_id, c.id]))
  const faltam = planos.filter(p => !recebidos.has(p.id))
  const valores = await Promise.all(faltam.map(p =>
    ler(admin.rpc('metrics_financeiro_do_plano', { p_tenant: tenantId, p_plan: p.id }).maybeSingle(), 'o valor do plano')))
  return faltam.map((p, i) => ({
    id: p.id, nome: p.name?.trim() || 'Plano de tratamento',
    valor: Number((valores[i] as { valor?: number | string } | null)?.valor ?? 0),
    comandaId: comandaDo.get(p.id) ?? null, unidadeId: p.branch_id, slug: p.branches?.slug ?? '',
  }))
}
