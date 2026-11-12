import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/** Produto como as duas telas de Estoque o leem, com o saldo por unidade embutido. */
export type ProdutoDoEstoque = {
  id: string; name: string; sku: string | null; barcode: string | null
  category: string | null; category_id: string | null; unit: string; supplier: string | null
  fornecedor_id: string | null
  cost_price: number | string | null; sale_price: number | string | null
  consumption_unit: string | null; units_per_package: number | string | null; is_active: boolean
  uso: string | null
  min_stock: number | string | null
  branch_product_stock: {
    current_stock: number; min_stock: number; current_rendimento: number | null
    branches: { id: string; name: string; slug: string } | null
  }[] | null
}

/**
 * Os produtos das telas de Estoque (a da rede e a da unidade), em páginas
 * (C26: era uma leitura só, e o PostgREST corta em 1000 calado).
 *
 * D1 do levantamento das regras (princípios 3 e 2): o produto DESATIVADO com
 * saldo continua na lista — o frasco está lá, e o valor em estoque o conta
 * (`metrics_valor_em_estoque`) —, marcado "Inativo". Sem saldo, sai.
 */
export async function produtosDoEstoque(tenantId: string): Promise<ProdutoDoEstoque[]> {
  const admin = createAdminClient()
  const todos = await lerTodas((de, ate) => admin
    .from('products')
    .select(`
      id, name, sku, barcode, category, category_id, unit, supplier, fornecedor_id,
      cost_price, sale_price, consumption_unit, units_per_package, is_active, uso, min_stock,
      branch_product_stock(
        current_stock, min_stock, current_rendimento,
        branches(id, name, slug)
      )
    `)
    .eq('tenant_id', tenantId)
    .order('name').order('id')
    .range(de, ate), 'carregar os produtos') as unknown as ProdutoDoEstoque[]
  return todos.filter(p => p.is_active || (p.branch_product_stock ?? []).some(s =>
    Number(s.current_stock) > 0 || Number(s.current_rendimento ?? 0) > 0))
}

/** C76: a lista de fornecedores da rede, sem os arquivados (eles saem das opções). */
export async function fornecedoresDaRede(tenantId: string): Promise<{ id: string; nome: string }[]> {
  return (await todosOsFornecedores(tenantId)).filter(f => !f.arquivado).map(({ id, nome }) => ({ id, nome }))
}

/** C76: a lista inteira, com os arquivados — para a janela de Fornecedores. */
export async function todosOsFornecedores(tenantId: string): Promise<{ id: string; nome: string; arquivado: boolean }[]> {
  const linhas = await lerTodas((de, ate) => createAdminClient().from('fornecedores').select('id, nome, arquivado_em')
    .eq('tenant_id', tenantId).order('nome').order('id').range(de, ate), 'carregar os fornecedores') as { id: string; nome: string; arquivado_em: string | null }[]
  return linhas.map(f => ({ id: f.id, nome: f.nome, arquivado: !!f.arquivado_em }))
}
