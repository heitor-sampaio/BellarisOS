/**
 * Os procedimentos ativos sem insumo ligado, pelo nome (A23 da 21ª simulação):
 * a faixa do catálogo dizia só "3 procedimentos ativos sem insumo ligado", e
 * contava a Avaliação e a Massagem, que não usam insumo. Com os nomes, a rede
 * vê quais são e decide (não há marca de "não usa insumo": o aviso é só aviso).
 */
export function nomesDosSemInsumo(nomes: readonly string[], max = 4): string {
  if (nomes.length <= 1) return nomes[0] ?? ''
  if (nomes.length <= max) return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`
}
