/** O que vem depois de "N membros" no cabeçalho da Equipe. */
export type ComplementoDaContagem = 'cadastrados' | 'encontrados' | 'em toda a rede'

/**
 * "1 membro cadastrado", "2 membros encontrados" (J-8, 2026-10-30): a Equipe
 * dizia "1 membro cadastrados". O particípio concorda com o número; "em toda
 * a rede" não flexiona.
 */
export function contagemDeMembros(total: number, complemento: ComplementoDaContagem): string {
  const um = total === 1
  const fim = complemento === 'em toda a rede' || !um ? complemento : complemento.slice(0, -1)
  return `${total} ${um ? 'membro' : 'membros'} ${fim}`
}
