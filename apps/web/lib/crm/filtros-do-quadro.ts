/** O que o selo do "Limpar" do quadro conta (os campos de `FiltersState` em `crm-board.tsx`). */
export type FiltrosParaContar = {
  sources: string[]; tags: string[]; owners: string[]; procedureIds: string[]; motivos: string[]
  situation: string; period: string
}

/**
 * Quantos filtros estão marcados no quadro de oportunidades (A10 da 38ª;
 * princípio 3): cada valor marcado conta — as duas tags são 2 —, como no
 * inbox (`contarFiltros`). A situação e o período, escolha única, contam 1
 * quando saem do "todas".
 */
export function contarFiltrosDoQuadro(f: FiltrosParaContar): number {
  return f.sources.length + f.tags.length + f.owners.length + f.procedureIds.length + f.motivos.length
    + (f.situation !== 'all' ? 1 : 0)
    + (f.period !== 'all' ? 1 : 0)
}
