/**
 * A unidade que um formulário já traz escolhida (sobra da F33, 8ª simulação,
 * 2026-11-06; princípio 3): a fixa de quem usa, se ela está na lista; senão,
 * a única da lista. Com duas ou mais, nenhuma — o agendar do CRM e o estoque
 * inicial do produto nasciam na primeira em ordem alfabética, e gravavam lá
 * sem a pessoa ter escolhido.
 */
export function unidadeInicial(unidades: readonly { id: string }[], fixa?: string | null): string {
  if (fixa && unidades.some(u => u.id === fixa)) return fixa
  return unidades.length === 1 ? unidades[0]!.id : ''
}
