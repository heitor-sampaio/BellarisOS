import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/**
 * Os lotes com saldo nas unidades da tela de Estoque (J-45, simulação de
 * 2026-10-28/29): número, validade, quanto sobra e o custo da embalagem.
 *
 * O lote não guarda custo próprio: o custo é o do movimento de ENTRADA que o
 * criou (ligado em `stock_movement_batches` desde 20261029001301). O lote que
 * veio por transferência, ou de antes da ligação, fica sem custo ("—").
 */
export interface LoteDoProduto {
  id:          string
  produtoId:   string
  unidadeId:   string
  numero:      string | null
  validade:    string | null
  /** Embalagens que sobram no lote. */
  quantidade:  number
  /** O custo de UMA embalagem (o do consumo × o rendimento), ou nulo. */
  custoPorEmbalagem: number | null
}

type Admin = ReturnType<typeof createAdminClient>

export async function lotesComSaldo(
  admin: Admin, branchIds: string[], produtos: { id: string; fator: number }[],
): Promise<LoteDoProduto[]> {
  if (!branchIds.length || !produtos.length) return []
  const fator = new Map(produtos.map(p => [p.id, p.fator]))
  type Linha = {
    id: string; product_id: string; branch_id: string; batch_number: string | null; expires_at: string | null
    quantity: number | string
    stock_movement_batches: { stock_movements: { type: string; unit_cost: number | string | null } | null }[] | null
  }
  const linhas = await lerTodas<Linha>((de, ate) => admin.from('product_batches')
    .select('id, product_id, branch_id, batch_number, expires_at, quantity, stock_movement_batches(stock_movements(type, unit_cost))')
    .in('branch_id', branchIds)
    .gt('quantity', 0)
    .order('expires_at', { ascending: true, nullsFirst: false }).order('id')
    .range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
  'carregar os lotes')
  return linhas
    .filter(l => fator.has(l.product_id))
    .map(l => {
      const entrada = (l.stock_movement_batches ?? []).find(v => v.stock_movements?.type === 'PURCHASE')?.stock_movements
      const custo = entrada?.unit_cost != null ? Number(entrada.unit_cost) * (fator.get(l.product_id) ?? 1) : null
      return {
        id: l.id, produtoId: l.product_id, unidadeId: l.branch_id,
        numero: l.batch_number, validade: l.expires_at, quantidade: Number(l.quantity),
        custoPorEmbalagem: custo != null && custo > 0 ? Math.round(custo * 100) / 100 : null,
      }
    })
}

/** Os lotes que vencem até a data (os já vencidos entram — é o alerta). */
export function lotesVencendo(lotes: LoteDoProduto[], ate: Date): LoteDoProduto[] {
  return lotes.filter(l => l.validade && new Date(l.validade).getTime() <= ate.getTime())
}
