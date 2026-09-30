import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { descontoEmReais, ratear, recusaDoDesconto, type Desconto } from '@/lib/vendas/desconto'

/**
 * O desconto do checkout do plano (2026-09-30), lido no servidor: o subtotal é
 * a soma dos procedimentos do plano pelo preço de ANTES do desconto
 * (`preco_tabela`, que só existe depois de um checkout — antes, é o próprio
 * `price`). Os documentos do checkout e o checkout usam esta mesma conta; se
 * cada um somasse do seu jeito, o contrato citaria um desconto e o checkout
 * lançaria outro, e a trava de "pagamento diferente do assinado" dispararia.
 */
export interface PrecosDoPlano {
  subtotal: number
  itens:    { id: string; tabela: number }[]
}

export async function precosDoPlano(planId: string): Promise<PrecosDoPlano> {
  const linhas = await ler(createAdminClient()
    .from('treatment_plan_sessions')
    .select('sort_order, treatment_plan_session_procedures(id, price, preco_tabela, sort_order)')
    .eq('plan_id', planId)
    .order('sort_order'), 'ler os preços do plano')
  type P = { id: string; price: number | string; preco_tabela: number | string | null; sort_order: number | null }
  const itens = ((linhas ?? []) as unknown as { treatment_plan_session_procedures: P[] }[])
    .flatMap(s => [...(s.treatment_plan_session_procedures ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
    .map(p => ({ id: p.id, tabela: Math.round(Number(p.preco_tabela ?? p.price) * 100) / 100 }))
  const subtotal = Math.round(itens.reduce((s, i) => s + i.tabela * 100, 0)) / 100
  return { subtotal, itens }
}

/** O desconto em reais sobre o plano, ou a recusa. */
export function descontoDoPlano(precos: PrecosDoPlano, d: Desconto | null | undefined): { reais: number } | { error: string } {
  const recusa = recusaDoDesconto(precos.subtotal, d)
  if (recusa) return { error: recusa }
  return { reais: descontoEmReais(precos.subtotal, d) }
}

/** O preço de cada procedimento depois do desconto — o que `plano_aplicar_desconto` grava. */
export function precosComDesconto(precos: PrecosDoPlano, reais: number): { id: string; preco: number }[] {
  const liquido = Math.round((precos.subtotal - reais) * 100) / 100
  const rateio = ratear(precos.itens.map(i => i.tabela), liquido)
  return precos.itens.map((i, n) => ({ id: i.id, preco: rateio[n]! }))
}
