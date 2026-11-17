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
  const c = await ler(admin.from('comandas').select('product_sale_id, procedure_sale_id, treatment_plan_id')
    .eq('id', comandaId).eq('tenant_id', tenantId).maybeSingle(), 'ler a venda da comanda') as
    { product_sale_id: string | null; procedure_sale_id: string | null; treatment_plan_id: string | null } | null
  if (!c) return linhaDaComanda(null)
  let venda: VendaDaLinha | null = null
  if (c.product_sale_id) {
    const [v, itens] = await Promise.all([
      ler(admin.from('product_sales').select('quantity, preco_unitario, price')
        .eq('id', c.product_sale_id).eq('tenant_id', tenantId).maybeSingle(), 'ler a venda de produto da comanda') as
        Promise<{ quantity: number | null; preco_unitario: number | string | null; price: number | string | null } | null>,
      ler(admin.from('product_sale_items').select('id').eq('sale_id', c.product_sale_id).eq('tenant_id', tenantId),
        'contar os produtos da venda') as Promise<{ id: string }[] | null>,
    ])
    if (v) venda = {
      tipo: 'PRODUTO', quantidade: Number(v.quantity ?? 1), total: Number(v.price ?? 0), itens: (itens ?? []).length,
      precoUnitario: v.preco_unitario == null ? null : Number(v.preco_unitario),
    }
  } else if (c.procedure_sale_id) {
    const v = await ler(admin.from('procedure_sales').select('quantity, preco_unitario_tabela, price')
      .eq('id', c.procedure_sale_id).eq('tenant_id', tenantId).maybeSingle(), 'ler o pré-pago da comanda') as
      { quantity: number | null; preco_unitario_tabela: number | string | null; price: number | string | null } | null
    if (v) venda = {
      tipo: 'PRE_PAGO', quantidade: Number(v.quantity ?? 1), total: Number(v.price ?? 0),
      precoUnitario: v.preco_unitario_tabela == null ? null : Number(v.preco_unitario_tabela),
    }
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
