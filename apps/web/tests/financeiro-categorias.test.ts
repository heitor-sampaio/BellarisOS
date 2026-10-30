import { describe, it, expect } from 'vitest'
import { CATEGORIAS_DE_DESPESA, CATEGORIA_COMPRA_DE_ESTOQUE, ehCompraDeEstoque } from '@/lib/financeiro/categorias'

/**
 * A despesa da categoria "Compra de estoque" conta no CAIXA e NÃO no lucro
 * (decisão do Heitor, 2026-10-29): o lucro desconta o insumo consumido, e a
 * compra descontada de novo seria o produto pago duas vezes. A categoria
 * precisa existir no lançamento para a clínica poder usá-la — e é a MESMA que
 * o banco reconhece (`metrics_resultado`: "compra de estoque" e a antiga
 * "estoque", sem caixa).
 */
describe('a categoria "Compra de estoque"', () => {
  it('está entre as categorias de despesa do lançamento', () => {
    expect(CATEGORIAS_DE_DESPESA).toContain(CATEGORIA_COMPRA_DE_ESTOQUE)
    expect(CATEGORIA_COMPRA_DE_ESTOQUE).toBe('Compra de estoque')
  })
  it('é reconhecida sem caixa e com a antiga "Estoque"; o resto não é compra de estoque', () => {
    expect(ehCompraDeEstoque('Compra de estoque')).toBe(true)
    expect(ehCompraDeEstoque('  compra de ESTOQUE ')).toBe(true)
    expect(ehCompraDeEstoque('Estoque')).toBe(true)
    expect(ehCompraDeEstoque('Aluguel')).toBe(false)
    expect(ehCompraDeEstoque(null)).toBe(false)
  })
})

/**
 * "Contas (energia, água, internet)" (J-50, 2026-10-30): a conta de luz não
 * tinha categoria. É despesa operacional comum — conta no caixa E no lucro;
 * só a compra de estoque fica fora do lucro.
 */
describe('a categoria "Contas"', () => {
  it('está entre as categorias de despesa e não é compra de estoque', () => {
    expect(CATEGORIAS_DE_DESPESA).toContain('Contas (energia, água, internet)')
    expect(ehCompraDeEstoque('Contas (energia, água, internet)')).toBe(false)
  })
})
