import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * As TRANSFERÊNCIAS entre unidades no relatório de Estoque (A33 da 20ª
 * simulação, 2026-11-17: só a Auditoria as mostrava). Cada perna é da unidade
 * dela — "saiu para" a outra ou "entrou de" a outra —, com a quantidade (na
 * unidade do movimento e em embalagens) e o custo, que é o da saída nas duas
 * pernas (a transferência não muda o valor). A conta é do banco
 * (`metrics_transferencias_de_estoque`, grouping sets): a tela não soma.
 */
export interface TransferenciaPorProduto {
  branchId:   string
  unidade:    string
  direcao:    'SAIU' | 'ENTROU'
  outra:      string | null
  produtoId:  string
  produto:    string
  medida:     string
  embalagem:  string
  quantidade: number
  embalagens: number
  custo:      number
}

export interface RelatorioDeTransferencias {
  /** Uma por unidade × direção × outra unidade × produto, do maior custo para o menor. */
  linhas:     TransferenciaPorProduto[]
  /** O que saiu e o que entrou em cada unidade do recorte (o custo). */
  porUnidade: { branchId: string; unidade: string; saiu: number; entrou: number; movimentos: number }[]
  /** Quantos movimentos (pernas) no período — zero, a seção diz que não houve. */
  movimentos: number
}

export interface LinhaDoBanco {
  branch_id: string | null; unidade: string | null; direcao: string | null
  outra_id: string | null; outra: string | null
  product_id: string | null; produto: string | null; unidade_medida: string | null; embalagem: string | null
  quantidade: number | string | null; embalagens: number | string | null; custo: number | string | null; movimentos: number | string | null
}

/** As linhas do banco no relatório (a linha com produto é o detalhe; sem produto, o total da unidade × direção). */
export function montarTransferencias(data: readonly LinhaDoBanco[]): RelatorioDeTransferencias {
  const linhas = data.filter(l => l.branch_id && l.product_id && l.direcao).map(l => ({
    branchId: l.branch_id!, unidade: l.unidade ?? '—', direcao: l.direcao as 'SAIU' | 'ENTROU', outra: l.outra ?? null,
    produtoId: l.product_id!, produto: l.produto ?? '—', medida: l.unidade_medida ?? '', embalagem: l.embalagem ?? '',
    quantidade: Number(l.quantidade ?? 0), embalagens: Number(l.embalagens ?? 0), custo: Number(l.custo ?? 0),
  })).sort((a, b) => b.custo - a.custo)

  const porUnidade: RelatorioDeTransferencias['porUnidade'] = []
  for (const l of data) {
    if (!l.branch_id || l.product_id || !l.direcao) continue
    let u = porUnidade.find(x => x.branchId === l.branch_id)
    if (!u) { u = { branchId: l.branch_id, unidade: l.unidade ?? '—', saiu: 0, entrou: 0, movimentos: 0 }; porUnidade.push(u) }
    if (l.direcao === 'SAIU') u.saiu = Number(l.custo ?? 0)
    else u.entrou = Number(l.custo ?? 0)
    u.movimentos += Number(l.movimentos ?? 0)
  }
  return { linhas, porUnidade, movimentos: porUnidade.reduce((t, u) => t + u.movimentos, 0) }
}

export async function getTransferenciasDeEstoque(args: {
  tenantId: string; branchIds: string[]; from: Date; to: Date
}): Promise<RelatorioDeTransferencias> {
  const data = (await ler(createAdminClient().rpc('metrics_transferencias_de_estoque', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds,
    p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  }), 'contar as transferências entre unidades') ?? []) as LinhaDoBanco[]
  return montarTransferencias(data)
}
