import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O preço do procedimento NA UNIDADE (D2 da 9ª simulação, 2026-11-07;
 * decidido pelo princípio 3: "o que a tela mostra é o que vale na conta").
 *
 * O cadastro do procedimento grava o preço de cada unidade em
 * `procedure_branch_pricing` ("1 unidade com preço próprio"), e até aqui
 * nenhum caminho de preço o lia: na Menino Deus a criolipólise de R$ 590 era
 * listada, agendada, cobrada e comissionada a R$ 650. A regra é UMA: o preço
 * da unidade, quando ela tem um; senão o da rede. Quem lê preço de
 * procedimento para uma unidade passa por aqui — o agendar (o núcleo), o
 * Vender (pré-pago e o rateio do pacote), o editor do plano, o app da cliente,
 * o CRM e o Copilot. No banco, o espelho é `private.preco_na_unidade`.
 */
export function precoNaUnidade(precoDaRede: number | string | null | undefined, daUnidade: number | string | null | undefined): number {
  const v = daUnidade ?? precoDaRede
  return v == null ? 0 : Number(v)
}

/** Os preços próprios de uma unidade (procedimento → preço). Sem unidade, nenhum. */
export async function precosDaUnidade(admin: Admin, branchId: string | null | undefined): Promise<Map<string, number>> {
  if (!branchId) return new Map()
  // Uma linha por procedimento com preço próprio ali — o catálogo da rede, não uma lista que cresce.
  const linhas = await ler(admin.from('procedure_branch_pricing')
    .select('procedure_id, price').eq('branch_id', branchId).not('price', 'is', null),
  'carregar os preços da unidade') as { procedure_id: string; price: number | string }[] | null
  return new Map((linhas ?? []).map(l => [l.procedure_id, Number(l.price)]))
}

/** A lista com o `price` de cada procedimento trocado pelo da unidade, quando ela tem um. */
export async function comPrecoDaUnidade<T extends { id: string; price: number | string | null }>(
  admin: Admin, branchId: string | null | undefined, procedimentos: T[],
): Promise<T[]> {
  const proprios = await precosDaUnidade(admin, branchId)
  if (proprios.size === 0) return procedimentos
  return procedimentos.map(p => (proprios.has(p.id) ? { ...p, price: proprios.get(p.id)! } : p))
}

/** O preço de UM procedimento numa unidade. */
export async function precoDoProcedimentoNaUnidade(
  admin: Admin, procedureId: string, branchId: string | null | undefined, precoDaRede: number | string | null | undefined,
): Promise<number> {
  if (!branchId) return precoNaUnidade(precoDaRede, null)
  const linha = await ler(admin.from('procedure_branch_pricing')
    .select('price').eq('procedure_id', procedureId).eq('branch_id', branchId).maybeSingle(),
  'buscar o preço da unidade') as { price: number | string | null } | null
  return precoNaUnidade(precoDaRede, linha?.price ?? null)
}
