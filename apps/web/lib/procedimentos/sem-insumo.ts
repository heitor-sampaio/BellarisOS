/**
 * Os procedimentos ativos sem insumo ligado, pelo nome (A23 da 21ª simulação):
 * a faixa do catálogo dizia só "3 procedimentos ativos sem insumo ligado", e
 * contava a Avaliação e a Massagem, que não usam insumo. Com os nomes, a rede
 * vê quais são e decide.
 */
export function nomesDosSemInsumo(nomes: readonly string[], max = 4): string {
  if (nomes.length <= 1) return nomes[0] ?? ''
  if (nomes.length <= max) return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`
}

/**
 * Os que a faixa e o selo contam (A7 da 23ª = A23 da 21ª; princípio 1): ativos,
 * sem insumo ligado e SEM a marca "Este procedimento não usa insumo"
 * (`procedures.sem_insumo`), que a rede põe na Avaliação e na Massagem.
 */
export function procedimentosSemInsumoLigado<T extends {
  is_active: boolean; sem_insumo?: boolean | null; procedure_products: readonly unknown[]
}>(procs: readonly T[]): T[] {
  return procs.filter(p => p.is_active && !p.procedure_products.length && !p.sem_insumo)
}

/** A marca só vale sem insumo ligado: com insumo, o procedimento usa insumo. */
export function marcaSemInsumo(marcado: boolean, insumos: number): boolean {
  return marcado && insumos === 0
}
