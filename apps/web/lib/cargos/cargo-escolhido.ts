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
