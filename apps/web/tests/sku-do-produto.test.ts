import { describe, it, expect } from 'vitest'
import { prefixoDoSku } from '@/lib/estoque/sku'

/** A6 da 7ª simulação: o produto de revenda sem categoria entrava na sequência dos insumos. */
describe('o prefixo do SKU', () => {
  it('com categoria, as três primeiras letras dela (sem acento)', () => {
    expect(prefixoDoSku('Injetáveis', 'INSUMO')).toBe('INJ')
    expect(prefixoDoSku('Ácidos', 'REVENDA')).toBe('ACI')
  })
  it('sem categoria: o insumo segue OUT; o que se vende, REV', () => {
    expect(prefixoDoSku(null, 'INSUMO')).toBe('OUT')
    expect(prefixoDoSku(null)).toBe('OUT')
    expect(prefixoDoSku('', 'REVENDA')).toBe('REV')
    expect(prefixoDoSku(null, 'AMBOS')).toBe('REV')
  })
})
