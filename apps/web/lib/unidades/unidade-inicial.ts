import { unicaOpcao } from '@/lib/uma-opcao'
import { isUnitTag, unitTag } from '@estetica-os/utils'

/**
 * A unidade que um formulário já traz escolhida (sobra da F33, 8ª simulação,
 * 2026-11-06; princípio 3): a fixa de quem usa, se ela está na lista; senão,
 * a única da lista. Com duas ou mais, nenhuma — o agendar do CRM e o estoque
 * inicial do produto nasciam na primeira em ordem alfabética, e gravavam lá
 * sem a pessoa ter escolhido.
 */
export function unidadeInicial(unidades: readonly { id: string }[], fixa?: string | null): string {
  if (fixa && unidades.some(u => u.id === fixa)) return fixa
  return unicaOpcao(unidades)
}

/**
 * A unidade que a TAG do lead aponta (A25 da 14ª, F73; "a unidade da cliente é
 * a tag", F68): a tag "Unidade: X" de UMA unidade da lista. Sem tag de
 * unidade, com duas ou com a de uma unidade fora da lista, nenhuma — a pessoa
 * escolhe. Quem chama usa depois de `unidadeInicial` (a fixa e a única vencem).
 */
export function unidadeDaTag(unidades: readonly { id: string; name: string }[], tags: readonly string[]): string {
  const marcadas = new Set(tags.filter(isUnitTag))
  const achadas = unidades.filter(u => marcadas.has(unitTag(u.name)))
  return achadas.length === 1 ? achadas[0]!.id : ''
}
