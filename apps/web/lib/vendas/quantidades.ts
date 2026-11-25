import { LIMITE_DO_INTEIRO, LIMITE_DO_INTEIRO_CURTO, acimaDoRegistro, avisoAcimaDoComum } from '@/lib/acima-do-comum'

/**
 * As quantidades do que se vende: o produto (na "Nova venda" e na comanda do
 * PDV), o pré-pago e a devolução de parte da venda. Uma regra só, lida pelas
 * telas e pelas actions.
 *
 * Recusava-se mais de 100 de cada produto, mais de 100 unidades e mais de 20
 * produtos numa venda (a comanda: 100 de cada, 20 produtos), mais de 100
 * sessões no pré-pago e, na devolução, mais de 100 de cada e mais de 20 linhas.
 * O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
 * feito."
 *
 * Decisão do Claude, 25/11: o "comum" é o antigo teto — acima dele a tela
 * avisa e o servidor grava. O impossível:
 * - a quantidade de cada produto e o total da venda: zero, negativo,
 *   fracionário e acima do registro (`product_sale_items.quantity`,
 *   `product_sales.quantity` e `comanda_itens.quantidade` são `integer`). O
 *   estoque já barra antes, em português ("Estoque insuficiente…");
 * - as sessões do pré-pago: cada uma vira UMA LINHA em `procedure_sale_units`
 *   — até 32.767 (`LIMITE_DO_INTEIRO_CURTO`, o mesmo do crediário);
 * - o número de produtos: sem limite próprio (não há motivo técnico — o laço é
 *   por produto, e cada produto entra uma vez, somado): não passa do catálogo;
 * - o valor: cada pagamento grava em `financial_transactions.amount`
 *   (numeric(10,2)) e a venda em `preco_tabela` (numeric(12,2)) — acima disso
 *   o banco estouraria em inglês.
 */

export const QUANTIDADE_COMUM_DE_UM_PRODUTO = 100
export const UNIDADES_COMUNS_NA_VENDA = 100
export const PRODUTOS_COMUNS_NA_VENDA = 20
export const SESSOES_COMUNS_NO_PRE_PAGO = 100

/** `integer` no banco: a quantidade de cada produto e o total da venda. */
export const LIMITE_DA_QUANTIDADE = LIMITE_DO_INTEIRO
/** Uma linha por sessão (`procedure_sale_units`). */
export const LIMITE_DE_SESSOES_NO_PRE_PAGO = LIMITE_DO_INTEIRO_CURTO
/** O maior numeric(10,2): um lançamento. */
export const LIMITE_DO_VALOR_DE_UM_PAGAMENTO = 99_999_999.99
/** O maior numeric(12,2): o valor de tabela da venda. */
export const LIMITE_DO_VALOR_DA_VENDA = 9_999_999_999.99

export const QUANTIDADE_INVALIDA = 'Quantidade inválida: um número inteiro, a partir de 1.'
const SESSOES_INVALIDAS = 'Quantidade inválida: um número inteiro de sessões, a partir de 1.'
const QUANTAS_VOLTAM = 'Diga quantas unidades de cada produto voltam.'
const ACIMA_DO_REGISTRO_DE_CADA = acimaDoRegistro(LIMITE_DA_QUANTIDADE, 'unidades de cada produto')

/** Nulo = a quantidade de um produto se grava (a venda e a comanda). */
export function recusaDaQuantidadeDoProduto(q: number): string | null {
  if (!Number.isInteger(q) || q < 1) return QUANTIDADE_INVALIDA
  if (q > LIMITE_DA_QUANTIDADE) return ACIMA_DO_REGISTRO_DE_CADA
  return null
}

/** "Acima do comum (mais de 100 unidades)…" — ou nulo. */
export function avisoDaQuantidadeDoProduto(q: number): string | null {
  return avisoAcimaDoComum(q, QUANTIDADE_COMUM_DE_UM_PRODUTO, 'unidades')
}

const soma = (qs: number[]) => qs.reduce((s, q) => s + q, 0)

/** Nulo = os itens da venda se gravam (as quantidades já somadas por produto). */
export function recusaDosItensDaVenda(quantidades: number[]): string | null {
  if (!quantidades.length) return 'Escolha ao menos um produto.'
  for (const q of quantidades) {
    const recusa = recusaDaQuantidadeDoProduto(q)
    if (recusa) return recusa
  }
  if (soma(quantidades) > LIMITE_DA_QUANTIDADE) return acimaDoRegistro(LIMITE_DA_QUANTIDADE, 'unidades numa venda')
  return null
}

/** Os avisos da venda inteira: o total de unidades e o número de produtos. */
export function avisosDosItensDaVenda(quantidades: number[]): { unidades: string | null; produtos: string | null } {
  return {
    unidades: avisoAcimaDoComum(soma(quantidades), UNIDADES_COMUNS_NA_VENDA, 'unidades na venda'),
    produtos: avisoAcimaDoComum(quantidades.length, PRODUTOS_COMUNS_NA_VENDA, 'produtos'),
  }
}

/** Nulo = as sessões do pré-pago se gravam. */
export function recusaDasSessoesDoPrePago(q: number): string | null {
  if (!Number.isInteger(q) || q < 1) return SESSOES_INVALIDAS
  if (q > LIMITE_DE_SESSOES_NO_PRE_PAGO) return acimaDoRegistro(LIMITE_DE_SESSOES_NO_PRE_PAGO, 'sessões')
  return null
}

/** "Acima do comum (mais de 100 sessões)…" — ou nulo. */
export function avisoDasSessoesDoPrePago(q: number): string | null {
  return avisoAcimaDoComum(q, SESSOES_COMUNS_NO_PRE_PAGO, 'sessões')
}

/**
 * Quantas de um produto voltam na devolução de parte da venda: de 0 ao
 * registro. O que passa do que ainda está com a cliente o banco recusa
 * ("De Sérum, voltam até 2 unidade(s).").
 */
export function recusaDaQuantidadeQueVolta(q: number): string | null {
  if (!Number.isInteger(q) || q < 0) return QUANTAS_VOLTAM
  if (q > LIMITE_DA_QUANTIDADE) return ACIMA_DO_REGISTRO_DE_CADA
  return null
}

/** Nulo = o valor cabe no registro: a venda (de tabela) e cada pagamento dela. */
export function recusaDoValorDaVenda(tabela: number, pagamentos: number[]): string | null {
  if (tabela > LIMITE_DO_VALOR_DA_VENDA) return acimaDoRegistro(LIMITE_DO_VALOR_DA_VENDA, 'reais numa venda')
  if (pagamentos.some(v => v > LIMITE_DO_VALOR_DE_UM_PAGAMENTO)) return acimaDoRegistro(LIMITE_DO_VALOR_DE_UM_PAGAMENTO, 'reais num pagamento')
  return null
}
