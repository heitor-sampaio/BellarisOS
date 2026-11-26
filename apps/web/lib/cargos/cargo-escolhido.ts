/**
 * O cargo que a tela de Cargos abre escolhido (A18 da 20ª simulação;
 * princípio 3): recarregada a tela, a matriz voltava ao primeiro cargo ("O que
 * Financeiro acessa"), e o cargo recém-criado ficava só na lista ao lado. O
 * escolhido mora no endereço (`?cargo=`); o que não existe mais (excluído)
 * cai no primeiro editável. Puro, para a tela e o teste.
 */
export function cargoEscolhido(roles: readonly { id: string; is_system: boolean }[], pedido: string | null | undefined): string | null {
  if (pedido && roles.some(r => r.id === pedido)) return pedido
  const editaveis = roles.filter(r => !r.is_system)
  return editaveis[0]?.id ?? roles[0]?.id ?? null
}

/**
 * A lista de cargos da tela com os recém-criados (D5 da 27ª simulação;
 * princípio 3): depois do "Criar", o editor esperava a lista do servidor para
 * abrir o cargo novo — e, no Instituto Helicônia, o painel seguiu no
 * "Financeiro" (o primeiro editável), que recebeu os níveis pensados para o
 * "Comercial". O cargo que a action devolveu vale na lista até o servidor
 * mandá-la com ele; daí, vale a do servidor. Puro.
 */
export function comOsCriados<T extends { id: string }>(doServidor: readonly T[], criados: readonly T[]): T[] {
  const ja = new Set(doServidor.map(r => r.id))
  return [...doServidor, ...criados.filter(r => !ja.has(r.id))]
}

/**
 * O cargo que o endereço (`?cargo=`) pede e a tela ainda não abriu (A10 da 31ª
 * simulação; princípio 7). Montada a tela sem o cargo pedido na lista (o criado
 * ou o duplicado, antes de a lista do servidor chegar com ele), `cargoEscolhido`
 * cai no primeiro editável — e foi nele, o "Financeiro", que os níveis pensados
 * para o cargo novo se gravaram (24/11 e 25/11). O pedido fica esperando, e
 * abre quando a lista o traz. Não troca com alteração por salvar (o "Descartar
 * alterações?" decide) nem quando já está nele. Puro.
 */
export function cargoPedidoPeloEndereco({ roles, esperando, selecionado, ocupado }: {
  roles: readonly { id: string }[]
  esperando: string | null
  selecionado: string | null
  ocupado: boolean
}): string | null {
  if (!esperando || ocupado || esperando === selecionado) return null
  return roles.some(r => r.id === esperando) ? esperando : null
}
