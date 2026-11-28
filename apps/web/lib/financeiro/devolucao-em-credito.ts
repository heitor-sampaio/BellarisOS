import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/**
 * A parte de cada pagamento de uma venda de produto que virou CRÉDITO INTERNO
 * na devolução de parte da venda (D6 da 41ª; EX-11 e PR-08). Na devolução em
 * crédito (`produto_devolver_itens`, destino CREDITO) o pagamento fica como
 * estava — o dinheiro fica no caixa — e a cliente ganha o crédito, sem
 * ligação com o lançamento. A linha do lançamento diz o que aconteceu: a conta
 * vem do RETRATO que o banco gravou (`product_sale_returns.retrato.devolver`),
 * e se põe nos pagamentos da venda do mais recente para trás, na ordem em que
 * o banco os pega na devolução por estorno (decisão do Claude, 28/11).
 */

export interface DevolucaoLida {
  sale_id:    string
  created_at: string
  retrato:    { destino?: string | null; devolver?: number | string | null } | null
}

const centavos = (v: unknown) => Math.round((Number(v) || 0) * 100)

/**
 * O crédito das devoluções de cada venda. A função grava o retrato em cada
 * ITEM devolvido: a mesma devolução (a mesma venda, o mesmo instante) conta
 * uma vez só.
 */
export function creditoDasDevolucoesPorVenda(linhas: readonly DevolucaoLida[]): Map<string, number> {
  const vistas = new Set<string>()
  const por = new Map<string, number>()
  for (const l of linhas) {
    if (l.retrato?.destino !== 'CREDITO') continue
    const chave = `${l.sale_id}|${l.created_at}`
    if (vistas.has(chave)) continue
    vistas.add(chave)
    por.set(l.sale_id, (por.get(l.sale_id) ?? 0) + centavos(l.retrato.devolver))
  }
  return new Map([...por].filter(([, c]) => c > 0).map(([v, c]) => [v, c / 100]))
}

export interface PagamentoDaVenda {
  id: string; product_sale_id: string | null; type: string; is_paid: boolean; amount: number | string
  notes?: string | null; category?: string | null; paid_at: string | null; created_at: string
}

/** O crédito da venda, pelos pagamentos vivos dela, do mais recente para trás, até o valor de cada um. */
export function creditoPorLancamento(pagamentos: readonly PagamentoDaVenda[], porVenda: ReadonlyMap<string, number>): Record<string, number> {
  const saida: Record<string, number> = {}
  const vivos = pagamentos.filter(p => p.product_sale_id && porVenda.has(p.product_sale_id) && p.type === 'INCOME' && p.is_paid
    && p.notes !== 'Estornada' && p.category !== 'Estorno' && Number(p.amount) > 0)
    .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at)
      || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
  const resto = new Map([...porVenda].map(([v, valor]) => [v, centavos(valor)]))
  for (const p of vivos) {
    const r = resto.get(p.product_sale_id!) ?? 0
    if (r <= 0) continue
    const aqui = Math.min(r, centavos(p.amount))
    saida[p.id] = aqui / 100
    resto.set(p.product_sale_id!, r - aqui)
  }
  return saida
}

const LOTE = 100
const lotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE))

/** O crédito das devoluções em cada lançamento da lista (id → valor), das vendas de produto da REDE. */
export async function creditoDasDevolucoesDosLancamentos(
  tenantId: string, lancamentos: readonly { product_sale_id?: string | null }[],
): Promise<Record<string, number>> {
  const vendas = [...new Set(lancamentos.map(l => l.product_sale_id).filter((v): v is string => !!v))]
  if (!vendas.length) return {}
  const admin = createAdminClient()
  const devolucoes = (await Promise.all(lotes(vendas).map(ids => lerTodas((de, ate) => admin.from('product_sale_returns')
    .select('sale_id, created_at, retrato').eq('tenant_id', tenantId).in('sale_id', ids)
    .order('created_at').order('id').range(de, ate), 'ler as devoluções das vendas')))).flat() as unknown as DevolucaoLida[]
  const porVenda = creditoDasDevolucoesPorVenda(devolucoes)
  if (!porVenda.size) return {}
  const comCredito = [...porVenda.keys()]
  const pagamentos = (await Promise.all(lotes(comCredito).map(ids => lerTodas((de, ate) => admin.from('financial_transactions')
    .select('id, product_sale_id, type, is_paid, amount, notes, category, paid_at, created_at, branches!inner(tenant_id)')
    .eq('branches.tenant_id', tenantId).in('product_sale_id', ids).eq('type', 'INCOME').eq('is_paid', true)
    .order('created_at').order('id').range(de, ate), 'ler os pagamentos das vendas devolvidas')))).flat() as unknown as PagamentoDaVenda[]
  return creditoPorLancamento(pagamentos, porVenda)
}
