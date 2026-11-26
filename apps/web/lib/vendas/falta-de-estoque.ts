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

/** O produto à venda como a comanda o conhece: o que há (em embalagens inteiras) na unidade. */
export interface ProdutoComSaldo { id: string; name: string; unidade: string; disponivel: number }

/**
 * R04 (o Heitor, 26/11: "e tb não deixa realizar a venda de produto sem
 * estoque"): acrescentar na comanda do atendimento mais do que há — somando o
 * que já está nela, ainda não vendido (o banco soma do mesmo jeito em
 * `comanda_acrescentar_item`). A tela desliga o "Acrescentar" com o motivo.
 */
export function faltaAoAcrescentarNaComanda(produto: ProdutoComSaldo | null | undefined, quantidade: number, jaNaComanda: number): string | null {
  if (!produto || !(quantidade > 0)) return null
  return faltaDeEstoqueNaVenda([{ nome: produto.name, quantidade: jaNaComanda + quantidade, disponivel: produto.disponivel, unidade: produto.unidade }])
}

/**
 * R04: o que está na comanda, ainda não vendido, e passou do que há agora (o
 * saldo caiu depois de acrescentar: outra venda, um ajuste). O "Receber" da
 * comanda desliga com o motivo; o servidor recusa do mesmo jeito
 * (`confirmar_pagamento_do_atendimento` → `produto_vender_itens`). O produto
 * fora da lista (já não está à venda) fica com o servidor.
 */
export function faltaDosProdutosDaComanda(
  itens: readonly { produtoId: string; nome: string; unidade: string; quantidade: number; vendido: boolean }[],
  produtos: readonly ProdutoComSaldo[] | null | undefined,
): string | null {
  if (!produtos) return null
  return faltaDeEstoqueNaVenda(itens.filter(i => !i.vendido).flatMap(i => {
    const p = produtos.find(x => x.id === i.produtoId)
    return p ? [{ nome: i.nome, quantidade: i.quantidade, disponivel: p.disponivel, unidade: p.unidade }] : []
  }))
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
