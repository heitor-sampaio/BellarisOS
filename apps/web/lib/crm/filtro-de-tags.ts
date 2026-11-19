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

/**
 * O card tem TODAS as tags escolhidas, sem distinguir a caixa. Era "alguma"
 * (OU) e a lista de Clientes, o inbox e o Financeiro usam E: o mesmo filtro
 * funciona igual em todo lugar (princípio 7; 18/11, noite).
 */
export function temTodasAsTags(tags: readonly string[] | null | undefined, escolhidas: readonly string[]): boolean {
  if (!escolhidas.length) return true
  if (!tags?.length) return false
  const tem = new Set(tags.map(chave))
  return escolhidas.every(t => tem.has(chave(t)))
}
