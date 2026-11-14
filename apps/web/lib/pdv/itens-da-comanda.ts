import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Os produtos acrescentados na comanda do atendimento (PDV, fase 5b — o
 * desenho aprovado: "na saída ela levou um sérum, que se acrescenta na mesma
 * comanda"). Ainda na comanda, valem o preço de venda de HOJE — o mesmo que a
 * venda grava ao receber (`confirmar_pagamento_do_atendimento` →
 * `produto_vender_itens`); vendidos, a venda guarda o dela.
 */
export interface ItemDaComanda {
  id:         string
  produtoId:  string
  nome:       string
  unidade:    string
  quantidade: number
  /** O preço de uma unidade (o de venda do produto). */
  preco:      number
  /** Já vendido com a comanda paga. */
  vendido:    boolean
}

type Admin = ReturnType<typeof createAdminClient>

export async function itensDaComanda(tenantId: string, comandaId: string, admin: Admin = createAdminClient()): Promise<ItemDaComanda[]> {
  const linhas = await ler(admin.from('comanda_itens')
    .select('id, product_id, quantidade, product_sale_id, products(name, unit, sale_price)')
    .eq('tenant_id', tenantId).eq('comanda_id', comandaId)
    .order('acrescentado_em').order('id'), 'carregar os produtos da comanda') ?? []
  return linhas.map(l => {
    const p = l.products as unknown as { name: string; unit: string; sale_price: number | string | null } | null
    return {
      id: l.id as string, produtoId: l.product_id as string, nome: p?.name ?? 'Produto', unidade: p?.unit ?? 'un',
      quantidade: Number(l.quantidade), preco: Number(p?.sale_price ?? 0), vendido: !!l.product_sale_id,
    }
  })
}

/** O valor dos produtos ainda na comanda deste atendimento (os que vão junto ao receber), em reais. */
export async function valorDosItensDoAtendimento(tenantId: string, agendamentoId: string, admin: Admin = createAdminClient()): Promise<number> {
  const comanda = await ler(admin.from('comandas').select('id')
    .eq('tenant_id', tenantId).eq('appointment_id', agendamentoId).is('cancelada_em', null).maybeSingle(), 'buscar a comanda do atendimento')
  if (!comanda) return 0
  const itens = await itensDaComanda(tenantId, comanda.id as string, admin)
  const centavos = itens.filter(i => !i.vendido).reduce((s, i) => s + Math.round(i.preco * 100) * i.quantidade, 0)
  return centavos / 100
}
