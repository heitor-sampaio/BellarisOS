/**
 * O saldo de um produto depois de uma saída — puro.
 *
 * Uma cópia só: a conclusão do atendimento (insumo, em unidade de consumo) e a
 * entrega do produto de um voucher de fidelidade (a embalagem inteira) passam
 * por aqui, e o banco grava o que sair (`concluir_atendimento`,
 * `entregar_voucher_produto`). Duas contas de estoque divergiriam — é questão
 * de quando.
 *
 * Produto com unidade de consumo (`units_per_package` + `consumption_unit`): o
 * que sai está em unidades de consumo (2 UI, 5 ml), o rendimento cai e as
 * embalagens arredondam PARA LONGE do zero — sobra parcial ainda ocupa uma
 * embalagem aberta; falta parcial já é uma embalagem devida. Sem unidade de
 * consumo, o que sai são embalagens.
 *
 * Faltar não impede: o saldo fica negativo, para a falta aparecer no estoque.
 */
export interface EstadoDoEstoque {
  /** Embalagens em estoque (`branch_product_stock.current_stock`). */
  embalagens:       number
  /** Rendimento em unidades de consumo, se o produto tem (`current_rendimento`). */
  rendimento:       number | null
  /** Unidades de consumo por embalagem; nulo = o produto conta em embalagens. */
  unidadesPorEmbalagem: number | null
}

export interface SaldoDepois {
  embalagens: number
  rendimento: number | null
  /** O `balance_after` do movimento: em consumo, se há unidade de consumo; senão em embalagens. */
  saldoApos:  number
}

/** @param quantidade o que sai — em unidades de consumo quando o produto tem; senão em embalagens. */
export function saldoDepoisDaSaida(e: EstadoDoEstoque, quantidade: number): SaldoDepois {
  const upp = e.unidadesPorEmbalagem
  if (upp) {
    // Sem rendimento gravado, assume as embalagens cheias.
    const rendimentoAtual = e.rendimento ?? e.embalagens * upp
    const rendimento = rendimentoAtual - quantidade
    const embalagens = rendimento >= 0 ? Math.ceil(rendimento / upp) : Math.floor(rendimento / upp)
    return { embalagens, rendimento, saldoApos: rendimento }
  }
  const embalagens = e.embalagens - quantidade
  return { embalagens, rendimento: null, saldoApos: embalagens }
}
