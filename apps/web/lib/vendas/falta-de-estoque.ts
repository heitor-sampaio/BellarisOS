/**
 * A15 da 23ª simulação (princípios 3 e 7): o seletor dizia "sem estoque" e o
 * "Vender" ficava ativo — a recusa só vinha ao clicar. A venda de produto diz,
 * antes, o que falta nesta unidade; a tela desliga o botão e aponta a Entrada.
 *
 * Puro: roda no navegador. O servidor segue conferindo (o estoque pode mudar
 * entre abrir a janela e vender).
 */
export interface ItemParaConferir { nome: string; quantidade: number; disponivel: number; unidade: string }

export function faltaDeEstoqueNaVenda(itens: readonly ItemParaConferir[]): string | null {
  const faltas = itens.filter(i => i.quantidade > 0 && i.quantidade > i.disponivel).map(i => i.disponivel < 1
    ? `Sem estoque de ${i.nome} nesta unidade.`
    : `Só há ${i.disponivel} ${i.unidade} de ${i.nome} nesta unidade.`)
  return faltas.length ? faltas.join(' ') : null
}
