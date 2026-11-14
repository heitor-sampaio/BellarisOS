import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/** Produto como as duas telas de Estoque o leem, com o saldo por unidade embutido. */
export type ProdutoDoEstoque = {
  id: string; name: string; sku: string | null; barcode: string | null
  category: string | null; category_id: string | null; unit: string
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
      id, name, sku, barcode, category, category_id, unit,
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

/** Um item de uma das três listas do Estoque (categorias, marcas, fornecedores). */
export type ItemDaLista = { id: string; nome: string }

/**
 * As três listas do Estoque (E1/E4/E5): categorias, marcas e fornecedores —
 * cadastros de texto livre da rede, com a mesma regra.
 */
export async function listasDoEstoque(tenantId: string): Promise<{ categorias: ItemDaLista[]; marcas: ItemDaLista[]; fornecedores: ItemDaLista[] }> {
  const admin = createAdminClient()
  const [categorias, marcas, fornecedores] = await Promise.all([
    lerTodas((de, ate) => admin.from('product_categories').select('id, name')
      .eq('tenant_id', tenantId).order('name').order('id').range(de, ate), 'carregar as categorias') as Promise<{ id: string; name: string }[]>,
    lerTodas((de, ate) => admin.from('marcas').select('id, nome')
      .eq('tenant_id', tenantId).order('nome').order('id').range(de, ate), 'carregar as marcas') as Promise<ItemDaLista[]>,
    lerTodas((de, ate) => admin.from('fornecedores').select('id, nome')
      .eq('tenant_id', tenantId).order('nome').order('id').range(de, ate), 'carregar os fornecedores') as Promise<ItemDaLista[]>,
  ])
  return { categorias: categorias.map(c => ({ id: c.id, nome: c.name })), marcas, fornecedores }
}

/**
 * E15 (o Heitor: "o filtro de marca ou fornecedor mostra os produtos que tem
 * alguma entrada dessa marca/fornecedor"): de cada produto, as marcas e os
 * fornecedores das ENTRADAS (a compra não desfeita), somados no banco.
 */
export async function marcasEFornecedoresDosProdutos(tenantId: string): Promise<Record<string, { marcaIds: string[]; fornecedorIds: string[] }>> {
  const admin = createAdminClient()
  const linhas = await lerTodas((de, ate) => admin.rpc('estoque_marcas_e_fornecedores_dos_produtos', { p_tenant: tenantId })
    .order('product_id').order('marca_id').order('fornecedor_id').range(de, ate),
  'carregar as marcas e os fornecedores das entradas') as { product_id: string; marca_id: string | null; fornecedor_id: string | null }[]
  const porProduto: Record<string, { marcaIds: string[]; fornecedorIds: string[] }> = {}
  for (const l of linhas) {
    const p = (porProduto[l.product_id] ??= { marcaIds: [], fornecedorIds: [] })
    if (l.marca_id && !p.marcaIds.includes(l.marca_id)) p.marcaIds.push(l.marca_id)
    if (l.fornecedor_id && !p.fornecedorIds.includes(l.fornecedor_id)) p.fornecedorIds.push(l.fornecedor_id)
  }
  return porProduto
}
