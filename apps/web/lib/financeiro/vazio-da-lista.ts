/**
 * A frase da lista vazia do Financeiro (A12 da 27ª simulação; CLAUDE.md §14:
 * o que a pessoa não pode usar, a tela não oferece). "Lance uma nova transação"
 * aparecia a quem só vê o Financeiro, que não tem o "Novo lançamento". Quem
 * lança ouve o nome do botão; quem não lança, só os filtros.
 */
export function vazioDaListaDoFinanceiro(podeLancar: boolean): string {
  return podeLancar ? 'Ajuste os filtros ou use o “Novo lançamento”.' : 'Ajuste os filtros.'
}
