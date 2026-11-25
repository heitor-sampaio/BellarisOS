import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { linhaDaComanda, type LinhaDaComanda, type VendaDaLinha } from './linha-da-comanda'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O que a linha da comanda diz (D3 e A5 da 21ª simulação): a venda de produto,
 * o pré-pago e o plano da comanda, lidos pela chave dela (`comandas`). A
 * comanda do atendimento, do pacote e do crédito é um. A rede é conferida na
 * comanda; as vendas se leem pelo id que ela guarda.
 */
export async function linhaDaComandaDoPdv(admin: Admin, tenantId: string, comandaId: string): Promise<LinhaDaComanda> {
  const c = await ler(admin.from('comandas').select('product_sale_id, procedure_sale_id, treatment_plan_id, client_package_id')
    .eq('id', comandaId).eq('tenant_id', tenantId).maybeSingle(), 'ler a venda da comanda') as
    { product_sale_id: string | null; procedure_sale_id: string | null; treatment_plan_id: string | null; client_package_id: string | null } | null
  if (!c) return linhaDaComanda(null)
  let venda: VendaDaLinha | null = null
  if (c.product_sale_id) {
    const [v, itens] = await Promise.all([
      ler(admin.from('product_sales').select('quantity, preco_unitario, price, desconto')
        .eq('id', c.product_sale_id).eq('tenant_id', tenantId).maybeSingle(), 'ler a venda de produto da comanda') as
        Promise<{ quantity: number | null; preco_unitario: number | string | null; price: number | string | null; desconto: number | string | null } | null>,
      // D9 da 29ª: e o que voltou de cada um (a devolução de parte, PR-08). O valor_devolvido da
      // venda é a soma do dos itens (`produto_devolver_itens` grava os dois juntos).
      ler(admin.from('product_sale_items').select('id, devolvidas, valor_devolvido, products(name)').eq('sale_id', c.product_sale_id).eq('tenant_id', tenantId)
        .order('sort_order'), 'contar os produtos da venda') as
        Promise<{ id: string; devolvidas: number | null; valor_devolvido: number | string | null; products: { name: string } | null }[] | null>,
    ])
    const devolvidos = (itens ?? []).filter(i => Number(i.devolvidas ?? 0) > 0)
      .map(i => `${Number(i.devolvidas)}× ${i.products?.name ?? 'Produto'}`)
    const valorDevolvido = Math.round((itens ?? []).reduce((s, i) => s + Number(i.valor_devolvido ?? 0) * 100, 0)) / 100
    if (v) venda = {
      tipo: 'PRODUTO', quantidade: Number(v.quantity ?? 1), total: Number(v.price ?? 0), itens: (itens ?? []).length,
      precoUnitario: v.preco_unitario == null ? null : Number(v.preco_unitario),
      desconto: v.desconto == null ? undefined : Number(v.desconto),
      devolvido: { valor: valorDevolvido, itens: devolvidos.length ? devolvidos.join(' + ') : null },
    }
  } else if (c.procedure_sale_id) {
    const v = await ler(admin.from('procedure_sales').select('quantity, preco_unitario_tabela, price, desconto')
      .eq('id', c.procedure_sale_id).eq('tenant_id', tenantId).maybeSingle(), 'ler o pré-pago da comanda') as
      { quantity: number | null; preco_unitario_tabela: number | string | null; price: number | string | null; desconto: number | string | null } | null
    if (v) venda = {
      tipo: 'PRE_PAGO', quantidade: Number(v.quantity ?? 1), total: Number(v.price ?? 0),
      precoUnitario: v.preco_unitario_tabela == null ? null : Number(v.preco_unitario_tabela),
      desconto: v.desconto == null ? undefined : Number(v.desconto),
    }
  } else if (c.client_package_id) {
    // A15 da 24ª: o pacote vendido com desconto (o item cheio e a linha do desconto).
    const v = await ler(admin.from('client_packages').select('desconto')
      .eq('id', c.client_package_id).maybeSingle(), 'ler o pacote da comanda') as
      { desconto: number | string | null } | null
    if (v) venda = { tipo: 'PACOTE', desconto: Number(v.desconto ?? 0) }
  } else if (c.treatment_plan_id) {
    const sessoes = await ler(admin.from('treatment_plan_sessions')
      .select('sort_order, treatment_plan_session_procedures(sort_order, procedures(name))')
      .eq('plan_id', c.treatment_plan_id).order('sort_order'), 'ler as sessões do plano da comanda') as
      { treatment_plan_session_procedures: { sort_order: number | null; procedures: { name: string } | null }[] | null }[] | null
    venda = {
      tipo: 'PLANO',
      sessoes: (sessoes ?? []).map(s => ({
        procedimentos: [...(s.treatment_plan_session_procedures ?? [])]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(p => p.procedures?.name).filter((n): n is string => !!n),
      })),
    }
  }
  return linhaDaComanda(venda)
}
