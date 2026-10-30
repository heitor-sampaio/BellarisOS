/**
 * As categorias do lançamento manual (receita e despesa). Puro: a tela do
 * financeiro, o Copilot e o núcleo do lançamento (`lancamento.ts`) usam a
 * MESMA lista — a tela tinha a sua cópia.
 *
 * "Compra de estoque" (decisão do Heitor, 2026-10-29): a despesa da compra
 * conta no CAIXA (o que saiu) e NÃO no lucro, que já desconta o insumo
 * CONSUMIDO — senão o produto seria descontado duas vezes. A movimentação do
 * estoque nunca gera despesa: a compra paga, se a clínica quiser no
 * financeiro, é este lançamento. O banco reconhece a mesma categoria
 * (`metrics_resultado`), sem caixa, e também a antiga "Estoque" (a que a
 * Entrada do estoque gravava até 2026-10-28).
 *
 * "Contas (energia, água, internet)" (J-50, 2026-10-30) é despesa operacional
 * comum: conta no caixa e no lucro.
 */

export const CATEGORIA_COMPRA_DE_ESTOQUE = 'Compra de estoque'

export const CATEGORIAS_DE_RECEITA = ['Atendimento', 'Venda de produto', 'Taxa de agendamento', 'Pacote de sessões', 'Outro'] as const
export const CATEGORIAS_DE_DESPESA = [
  'Fornecedores', CATEGORIA_COMPRA_DE_ESTOQUE, 'Aluguel', 'Contas (energia, água, internet)', 'Salários', 'Equipamentos', 'Manutenção', 'Marketing', 'Material de escritório', 'Outro',
] as const

/** A categoria é de compra de estoque (fica no caixa, fora do lucro)? O espelho do predicado de `metrics_resultado`. */
export function ehCompraDeEstoque(categoria: string | null | undefined): boolean {
  const c = (categoria ?? '').trim().toLowerCase()
  return c === 'compra de estoque' || c === 'estoque'
}
