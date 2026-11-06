import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { venceAte } from './validade'
import { addDaysTZ } from '@/lib/datetime'

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

/** Os lotes que vencem até a data, pelo DIA (os já vencidos entram — é o alerta; D1 da 7ª, `validade.ts`). */
export function lotesVencendo(lotes: LoteDoProduto[], ate: Date): LoteDoProduto[] {
  return lotes.filter(l => venceAte(l.validade, ate))
}

/** Um lote que vence logo, como o dashboard o mostra (A41 da 7ª simulação). */
export interface LoteVencendo extends LoteDoProduto {
  produto:  string
  /** A embalagem do produto ("frasco"): a quantidade do lote é nela. */
  embalagem: string
}

/**
 * Os lotes com saldo que vencem nos próximos `dias` (os já vencidos entram — é
 * o alerta), nas unidades do recorte: a MESMA conta do cartão "Validade em 30
 * dias" do Estoque (`lotesComSaldo` + `lotesVencendo`). O lote que vence em 10
 * dias aparecia só no Estoque (A41 da 7ª simulação, 2026-11-05); o dashboard
 * de quem tem o Estoque passa a mostrá-lo.
 */
export async function lotesVencendoDoRecorte(
  tenantId: string, branchIds: string[], dias = 30, agora: Date = new Date(),
): Promise<LoteVencendo[]> {
  if (!branchIds.length) return []
  const admin = createAdminClient()
  type Produto = { id: string; name: string; unit: string; consumption_unit: string | null; units_per_package: number | string | null }
  const produtos = await lerTodas<Produto>((de, ate) => admin.from('products')
    .select('id, name, unit, consumption_unit, units_per_package')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .order('name').order('id').range(de, ate) as unknown as PromiseLike<{ data: Produto[] | null; error: { message: string } | null }>,
  'carregar os produtos dos lotes')
  const fatorDe = (p: Produto) => (p.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : 1)
  const lotes = await lotesComSaldo(admin, branchIds, produtos.map(p => ({ id: p.id, fator: fatorDe(p) })))
  const ate = addDaysTZ(agora, dias)
  const porId = new Map(produtos.map(p => [p.id, p]))
  return lotesVencendo(lotes, ate).map(l => {
    const p = porId.get(l.produtoId)!
    return { ...l, produto: p.name, embalagem: p.unit }
  })
}
