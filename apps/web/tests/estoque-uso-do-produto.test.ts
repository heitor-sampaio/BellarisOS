import { describe, it, expect } from 'vitest'
import { checkboxesIniciais } from '@/lib/estoque/uso'

/**
 * Onde o produto está disponível (E2): o produto NOVO nasce sem nenhuma caixa
 * marcada — a pessoa escolhe Insumo, Venda direta ou os dois (o Heitor, 25/11:
 * "ok" à proposta 6 de docs/para-o-heitor.md; era "nasce Insumo"). O que já
 * existe abre como está gravado; o lido sem a coluna, pelo preço de venda.
 */
describe('as caixas do uso ao abrir o formulário do produto', () => {
  it('o produto novo: nenhuma marcada', () => {
    expect(checkboxesIniciais(undefined)).toEqual({ insumo: false, vendaDireta: false })
    expect(checkboxesIniciais(null)).toEqual({ insumo: false, vendaDireta: false })
  })
  it('o que já existe abre como está gravado', () => {
    expect(checkboxesIniciais({ uso: 'INSUMO', sale_price: null })).toEqual({ insumo: true, vendaDireta: false })
    expect(checkboxesIniciais({ uso: 'REVENDA', sale_price: 50 })).toEqual({ insumo: false, vendaDireta: true })
    expect(checkboxesIniciais({ uso: 'AMBOS', sale_price: 50 })).toEqual({ insumo: true, vendaDireta: true })
  })
  it('o que existe sem a coluna: pelo preço de venda', () => {
    expect(checkboxesIniciais({ uso: null, sale_price: 80 })).toEqual({ insumo: true, vendaDireta: true })
    expect(checkboxesIniciais({ uso: null, sale_price: null })).toEqual({ insumo: true, vendaDireta: false })
  })
})
