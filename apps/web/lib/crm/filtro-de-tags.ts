/**
 * O filtro de Tags do quadro de oportunidades (D14 da 25ª; CLAUDE.md §1,
 * Tags: o filtro personalizado da rede vale onde houver filtro).
 *
 * As opções são o vocabulário da rede (as tags ativas, de Configurações →
 * Tags) mais as tags dos cards que não estão nele (uma arquivada que ficou no
 * card) — antes eram só as dos cards, e o filtro sumia se nenhum card tinha
 * tag. A caixa não distingue: "VIP" e "vip" são a mesma tag. Puro.
 */
const chave = (t: string) => t.trim().toLocaleLowerCase('pt-BR')

export function opcoesDeTagDoQuadro(
  vocabulario: readonly string[],
  tagsDosCards: readonly (readonly string[] | null | undefined)[],
): string[] {
  const porChave = new Map<string, string>()
  for (const t of vocabulario) if (t.trim() && !porChave.has(chave(t))) porChave.set(chave(t), t.trim())
  for (const tags of tagsDosCards) {
    for (const t of tags ?? []) if (t.trim() && !porChave.has(chave(t))) porChave.set(chave(t), t.trim())
  }
  return [...porChave.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** O card tem alguma das tags escolhidas (sem distinguir a caixa). */
export function temAlgumaTag(tags: readonly string[] | null | undefined, escolhidas: readonly string[]): boolean {
  if (!tags?.length || !escolhidas.length) return false
  const quero = new Set(escolhidas.map(chave))
  return tags.some(t => quero.has(chave(t)))
}
