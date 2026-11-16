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
  /** A venda do produto (vendido): o crediário e o a receber dele saem com a comanda (2026-11-16). */
  vendaId?:   string | null
  /** D2 da 18ª: a venda do produto foi estornada (quando); nulo: não foi. */
  estornadoEm:     string | null
  /** D2 da 18ª: no estorno, o produto voltou ao estoque; nulo sem estorno. */
  voltouAoEstoque: boolean | null
}

type Admin = ReturnType<typeof createAdminClient>

export async function itensDaComanda(tenantId: string, comandaId: string, admin: Admin = createAdminClient()): Promise<ItemDaComanda[]> {
  const linhas = await ler(admin.from('comanda_itens')
    .select('id, product_id, quantidade, product_sale_id, products(name, unit, sale_price), product_sales(estornada_em, produto_voltou)')
    .eq('tenant_id', tenantId).eq('comanda_id', comandaId)
    .order('acrescentado_em').order('id'), 'carregar os produtos da comanda') ?? []
  return linhas.map(l => {
    const p = l.products as unknown as { name: string; unit: string; sale_price: number | string | null } | null
    const venda = l.product_sales as unknown as { estornada_em: string | null; produto_voltou: boolean | null } | null
    return {
      id: l.id as string, produtoId: l.product_id as string, nome: p?.name ?? 'Produto', unidade: p?.unit ?? 'un',
      quantidade: Number(l.quantidade), preco: Number(p?.sale_price ?? 0), vendido: !!l.product_sale_id,
      vendaId: (l.product_sale_id as string | null) ?? null,
      estornadoEm: venda?.estornada_em ?? null, voltouAoEstoque: venda?.estornada_em ? !!venda.produto_voltou : null,
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

/**
 * O que já cobre o atendimento (2026-11-16, as várias formas e o crediário no
 * avulso): os lançamentos vivos dele — pagos, ou a receber do crediário e do
 * "a receber" —, com o desconto e a fidelidade de cada um. A comanda reaberta
 * pelo estorno de UMA das formas cobra só o resto. A mesma régua de
 * `confirmar_pagamento_do_atendimento` (o a receber sem forma do "Concluir"
 * antigo, sem notas, não cobre).
 */
export async function jaCobertoDoAtendimento(agendamentoId: string, admin: Admin = createAdminClient()): Promise<number> {
  const linhas = await ler(admin.from('financial_transactions')
    .select('amount, loyalty_discount, sale_discount, is_paid, notes')
    .eq('appointment_id', agendamentoId).eq('type', 'INCOME').is('estorno_de', null)
    .or('notes.is.null,notes.neq.Estornada'), 'ler o que já cobre o atendimento') as {
      amount: number | string; loyalty_discount: number | string | null; sale_discount: number | string | null; is_paid: boolean; notes: string | null
    }[] | null
  const centavos = (linhas ?? [])
    .filter(l => l.is_paid || l.notes !== null)
    .reduce((s, l) => s + Math.round((Number(l.amount) + Number(l.loyalty_discount ?? 0) + Number(l.sale_discount ?? 0)) * 100), 0)
  return centavos / 100
}
