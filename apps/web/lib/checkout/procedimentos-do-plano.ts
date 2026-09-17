import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Procedimentos e insumos que alimentam o editor de plano de tratamento.
 *
 * Mora aqui porque o editor agora aparece em três lugares — tela do
 * atendimento, aba do cliente e planejamento aberto de qualquer atendimento — e
 * a regra do que pode entrar num plano é uma só: procedimento ativo da rede,
 * **fora os de avaliação** (vender a própria consulta dentro do plano que ela
 * gerou não faz sentido).
 */
export async function procedimentosParaPlano(tenantId: string) {
  const admin = createAdminClient()

  const [{ data: procsRaw }, { data: prodsRaw }] = await Promise.all([
    admin
      .from('procedures')
      .select('id, name, category, duration_min, price, procedure_products(product_id, quantity, products(id, name, unit))')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('is_evaluation', false)
      .order('name'),
    admin
      .from('products')
      .select('id, name, unit')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name'),
  ])

  type RawProd = { product_id: string; quantity: number; products: { id: string; name: string; unit: string } | null }
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
        unit:      pp.products!.unit,
        quantity:  Number(pp.quantity),
      })),
  }))

  const products = ((prodsRaw ?? []) as { id: string; name: string; unit: string }[])
    .map(p => ({ id: p.id, name: p.name, unit: p.unit }))

  return { procedures, products }
}
