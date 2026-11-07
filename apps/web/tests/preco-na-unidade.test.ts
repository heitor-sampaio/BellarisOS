import { describe, it, expect } from 'vitest'
import { precoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'

// D2 da 9ª simulação: o preço da unidade vale quando ela tem um; senão, o da rede.
describe('precoNaUnidade', () => {
  it('a unidade com preço próprio vale o dela', () => {
    expect(precoNaUnidade(650, 590)).toBe(590)
    expect(precoNaUnidade('650.00', '590.00')).toBe(590)
  })
  it('sem preço próprio, o da rede', () => {
    expect(precoNaUnidade(650, null)).toBe(650)
    expect(precoNaUnidade(650, undefined)).toBe(650)
  })
  it('o preço próprio de R$ 0 (gratuito na unidade) vale', () => {
    expect(precoNaUnidade(650, 0)).toBe(0)
  })
  it('sem preço nenhum, zero', () => {
    expect(precoNaUnidade(null, null)).toBe(0)
  })
})
