import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O relatório de PERDAS do estoque (D-7, 2026-10-30): o que saiu por perda no
 * período — por motivo e produto, a quantidade (na unidade do movimento e em
 * embalagens) e o custo; o total de cada motivo e o geral. A conta é do banco
 * (`metrics_perdas`, grouping sets): a tela não soma.
 */
export interface PerdaPorProduto {
  motivo:     string
  produtoId:  string
  produto:    string
  unidade:    string
  embalagem:  string
  quantidade: number
  embalagens: number
  custo:      number
}

export interface RelatorioDePerdas {
  /** Uma por motivo × produto, do maior custo para o menor. */
  linhas:   PerdaPorProduto[]
  /** O total de cada motivo (custo e quantos movimentos). */
  motivos:  { motivo: string; custo: number; movimentos: number }[]
  total:    { custo: number; movimentos: number }
}

export async function getPerdas(args: {
  tenantId: string; branchIds: string[]; from: Date; to: Date
}): Promise<RelatorioDePerdas> {
  type Linha = {
    motivo: string | null; product_id: string | null; produto: string | null; unidade: string | null; embalagem: string | null
    quantidade: number | string | null; embalagens: number | string | null; custo: number | string; movimentos: number | string
  }
  const data = (await ler(createAdminClient().rpc('metrics_perdas', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds,
    p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  }), 'calcular as perdas do estoque') ?? []) as Linha[]

  const linhas = data.filter(l => l.motivo && l.product_id).map(l => ({
    motivo: l.motivo!, produtoId: l.product_id!, produto: l.produto ?? '—', unidade: l.unidade ?? '', embalagem: l.embalagem ?? '',
    quantidade: Number(l.quantidade ?? 0), embalagens: Number(l.embalagens ?? 0), custo: Number(l.custo),
  })).sort((a, b) => b.custo - a.custo)
  const motivos = data.filter(l => l.motivo && !l.product_id)
    .map(l => ({ motivo: l.motivo!, custo: Number(l.custo), movimentos: Number(l.movimentos) }))
    .sort((a, b) => b.custo - a.custo)
  const geral = data.find(l => !l.motivo && !l.product_id)
  return { linhas, motivos, total: { custo: Number(geral?.custo ?? 0), movimentos: Number(geral?.movimentos ?? 0) } }
}
