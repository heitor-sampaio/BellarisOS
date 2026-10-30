import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { unidadeDoInsumo, type UnidadesDoProduto } from '@/lib/estoque/unidade-de-consumo'

/**
 * Procedimentos e insumos que alimentam o editor de plano de tratamento.
 *
 * Mora aqui porque o editor agora aparece em três lugares — tela do
 * atendimento, aba do cliente e planejamento aberto de qualquer atendimento — e
 * a regra do que pode entrar num plano é uma só: procedimento ativo da rede,
 * **fora os de avaliação** (vender a própria consulta dentro do plano que ela
 * gerou não faz sentido).
 *
 * O insumo vai na unidade de CONSUMO (`unidadeDoInsumo`, D9 de 2026-10-29):
 * "5 ml", como no atendimento — não "5 frasco".
 */
export async function procedimentosParaPlano(tenantId: string) {
  const admin = createAdminClient()

  const [procsRaw, prodsRaw] = await Promise.all([
    ler(admin
      .from('procedures')
      .select('id, name, category, duration_min, price, procedure_products(product_id, quantity, products(id, name, unit, consumption_unit, units_per_package))')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      // A avaliação deixou de ser uma entidade e não precisa mais ser
      // excluída à mão: se ela vale como item de plano é escolha de quem monta
      // o plano, como qualquer outro procedimento (2026-09-25).
      .order('name'), 'carregar os procedimentos'),
    ler(admin
      .from('products')
      .select('id, name, unit, consumption_unit, units_per_package')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      // Só os insumos: o produto só de revenda não entra no plano (D-6).
      .neq('uso', 'REVENDA')
      .order('name'), 'carregar os produtos'),
  ])

  type Produto = { id: string; name: string } & UnidadesDoProduto
  type RawProd = { product_id: string; quantity: number; products: Produto | null }
  type RawProc = {
    id: string; name: string; category: string; duration_min: number; price: number
    procedure_products: RawProd[]
  }

  const procedures = ((procsRaw ?? []) as unknown as RawProc[]).map(p => ({
    id:          p.id,
    name:        p.name,
    category:    p.category,
    durationMin: p.duration_min,
    price:       Number(p.price),
    products:    (p.procedure_products ?? [])
      .filter(pp => pp.products !== null)
      .map(pp => ({
        productId: pp.product_id,
        name:      pp.products!.name,
        unit:      unidadeDoInsumo(pp.products!),
        quantity:  Number(pp.quantity),
      })),
  }))

  const products = ((prodsRaw ?? []) as Produto[])
    .map(p => ({ id: p.id, name: p.name, unit: unidadeDoInsumo(p) }))

  return { procedures, products }
}

/**
 * A unidade de consumo dos produtos de um plano JÁ GRAVADO (D9): o plano
 * guarda a unidade que a tela mandou, e até 2026-10-29 ela era a da
 * embalagem. A quantidade gravada sempre esteve na de consumo — então a
 * unidade mostrada é a do produto, lida agora; o texto gravado só vale para
 * o produto que não existe mais.
 */
export async function unidadesDosInsumos(tenantId: string, productIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const rows = await ler(admin
    .from('products')
    .select('id, unit, consumption_unit, units_per_package')
    .eq('tenant_id', tenantId)
    .in('id', ids), 'carregar a unidade dos insumos')
  return new Map(((rows ?? []) as ({ id: string } & UnidadesDoProduto)[]).map(p => [p.id, unidadeDoInsumo(p)]))
}
