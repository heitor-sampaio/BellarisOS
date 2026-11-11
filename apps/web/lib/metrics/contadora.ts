import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/**
 * O que a contadora exporta (A31 da 10ª simulação, 2026-11-10): a taxa e o
 * líquido de cada receita paga, e as entradas de estoque do período (a compra,
 * que nunca é despesa — D13 revisto — e por isso não aparecia para ela). As
 * contas moram no banco; aqui só se leem.
 */

const n = (v: unknown) => Number(v ?? 0)

/** O que um lançamento conta no caixa, com a taxa e o líquido da receita (do banco). */
export interface CaixaDoLancamento {
  /** Nulo no que não é receita (ou estorno de receita) paga. */
  taxa:    number | null
  liquido: number | null
  /**
   * F59 (D9 e A45 da 12ª): o que ele conta no CAIXA, com o sinal (+ entrou,
   * − saiu); nulo, não conta — o em aberto, o uso do crédito na clínica, o pago
   * todo em pontos. O pagamento conta pelo valor que entrou, no dia dele; o
   * estorno, no dia em que foi feito (D2) — somado no período, é o caixa dele.
   */
  noCaixa: number | null
}

/**
 * O caixa, a taxa da maquininha e o líquido de cada lançamento (por id), pela
 * MESMA conta do lucro e do Fechamento (`metrics_caixa_dos_lancamentos`: a régua
 * `metrics_movimentos_pagos`, lançamento a lançamento; as taxas como
 * `metrics_custos_da_venda`).
 */
export async function getTaxaDosLancamentos(tenantId: string, ids: string[]): Promise<Record<string, CaixaDoLancamento>> {
  const saida: Record<string, CaixaDoLancamento> = {}
  if (!ids.length) return saida
  const admin = createAdminClient()
  // A lista de ids vai no CORPO (rpc é POST): no .in() ela iria na URL.
  type Linha = { id: string; taxa: number | string | null; liquido: number | string | null; no_caixa: number | string | null }
  const linhas = await lerTodas<Linha>((de, ate) => admin.rpc('metrics_caixa_dos_lancamentos', { p_tenant: tenantId, p_ids: ids })
    .order('id').range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
  'ler o caixa dos lançamentos')
  for (const l of linhas) {
    saida[l.id] = {
      taxa: l.taxa == null ? null : n(l.taxa), liquido: l.liquido == null ? null : n(l.liquido),
      noCaixa: l.no_caixa == null ? null : n(l.no_caixa),
    }
  }
  return saida
}

export interface EntradaDeEstoqueDoPeriodo {
  dia:        string
  unidade:    string
  produto:    string
  embalagens: number
  embalagem:  string
  custo:      number
  fornecedor: string | null
  notaFiscal: string | null
}

/** As entradas de estoque do período, ao custo do movimento, e o total (do banco). */
export async function getEntradasDeEstoque(args: { tenantId: string; branchIds: string[] | null; from: Date; to: Date }): Promise<{ linhas: EntradaDeEstoqueDoPeriodo[]; total: number }> {
  const admin = createAdminClient()
  type Linha = {
    movimento: string | null; dia: string | null; unidade: string | null; produto: string | null
    embalagens: number | string | null; embalagem: string | null; custo: number | string | null
    fornecedor: string | null; nota_fiscal: string | null
  }
  const linhas = await lerTodas<Linha>((de, ate) => admin.rpc('metrics_entradas_de_estoque', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  }).order('dia', { ascending: true, nullsFirst: false }).order('movimento').range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
  'ler as entradas de estoque')
  const total = linhas.find(l => l.movimento == null)
  return {
    total: n(total?.custo),
    linhas: linhas.filter(l => l.movimento != null).map(l => ({
      dia: l.dia!, unidade: l.unidade ?? '', produto: l.produto ?? '', embalagens: n(l.embalagens), embalagem: l.embalagem ?? '',
      custo: n(l.custo), fornecedor: l.fornecedor, notaFiscal: l.nota_fiscal,
    })),
  }
}
