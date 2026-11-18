/**
 * A15 da 25ª simulação (princípio 7): na rede de duas ou mais unidades, os
 * "Próximos agendamentos" da ficha dizem ONDE (como os avisos à cliente — A28
 * da 6ª, `unidadeParaOAviso`). Com uma unidade só, nada a dizer. Puro.
 */
export function unidadeNaFicha(branchId: string | null | undefined, unidades: readonly { id: string; name: string }[]): string | null {
  if (!branchId || unidades.length < 2) return null
  return unidades.find(u => u.id === branchId)?.name ?? null
}
