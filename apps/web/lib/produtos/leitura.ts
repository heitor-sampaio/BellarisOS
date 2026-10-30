import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { ProdutoAVenda } from '@/components/shared/vender'

/**
 * Os produtos que a ficha oferece para VENDER (D4, decisão do Heitor,
 * 2026-10-29): os de REVENDA ou de uso duplo (D-6), ativos, com preço de
 * venda — e quantas embalagens INTEIRAS há na unidade (a aberta não se vende;
 * `produto_vender` confere de novo, com a linha travada).
 */
export async function produtosAVenda(tenantId: string, branchId: string | null): Promise<ProdutoAVenda[]> {
  if (!branchId) return []
  type Linha = {
    id: string; name: string; sale_price: number | string | null; unit: string
    consumption_unit: string | null; units_per_package: number | string | null
    branch_product_stock: { branch_id: string; current_stock: number | string; current_rendimento: number | string | null }[] | null
  }
  const linhas = (await ler(createAdminClient().from('products')
    .select('id, name, sale_price, unit, consumption_unit, units_per_package, branch_product_stock(branch_id, current_stock, current_rendimento)')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .in('uso', ['REVENDA', 'AMBOS'])
    .not('sale_price', 'is', null)
    .order('name'), 'carregar os produtos à venda') ?? []) as Linha[]
  return linhas.map(p => {
    const saldo = (p.branch_product_stock ?? []).find(s => s.branch_id === branchId)
    const upp = Number(p.units_per_package ?? 0)
    const temConsumo = upp > 0 && !!(p.consumption_unit ?? '').trim()
    const embalagens = Number(saldo?.current_stock ?? 0)
    const rendimento = saldo?.current_rendimento != null ? Number(saldo.current_rendimento) : embalagens * upp
    const disponivel = Math.max(0, Math.floor(temConsumo ? Math.round(rendimento / upp * 1e6) / 1e6 : embalagens))
    return { id: p.id, name: p.name, price: Number(p.sale_price ?? 0), unidade: p.unit, disponivel }
  })
}
