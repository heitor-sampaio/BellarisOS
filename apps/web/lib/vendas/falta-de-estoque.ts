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

/**
 * A18 da 24ª (princípio 3): sem estoque, o resumo de cima seguia dizendo "sai
 * do estoque agora, pelo lote que vence primeiro", e o "Vender" desligado não
 * dizia por quê ao lado do botão. Com falta, o resumo não promete a saída, e o
 * motivo do botão diz a falta (o aviso com a Entrada fica acima).
 */
export function fimDoResumoDoProduto(falta: string | null): string | null {
  return falta ? null : 'sai do estoque agora, pelo lote que vence primeiro'
}

export function motivoDaFaltaNoBotao(falta: string | null): string | null {
  return falta ? 'Falta estoque nesta unidade.' : null
}
