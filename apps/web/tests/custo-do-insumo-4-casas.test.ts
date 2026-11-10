import { describe, it, expect } from 'vitest'
import { custoDoInsumoNoCampo, lerCustoDoInsumo } from '@/lib/estoque/custo-do-insumo'

// D6 da 11ª simulação (2026-11-10): R$ 0,038/g da cera virava R$ 0,04.
describe('o custo do insumo com até 4 casas (D6)', () => {
  it('mostra as casas que o custo tem, pelo menos 2', () => {
    expect(custoDoInsumoNoCampo(0.038)).toBe('0,038')
    expect(custoDoInsumoNoCampo(0.0395)).toBe('0,0395')
    expect(custoDoInsumoNoCampo(380)).toBe('380,00')
    expect(custoDoInsumoNoCampo(1400)).toBe('1.400,00')
  })
  it('lê o que se digita com até 4 casas', () => {
    expect(lerCustoDoInsumo('0,038')).toBeCloseTo(0.038, 6)
    expect(lerCustoDoInsumo('0,0395')).toBeCloseTo(0.0395, 6)
    expect(lerCustoDoInsumo('380,00')).toBe(380)
    expect(Number.isNaN(lerCustoDoInsumo('0,03951'))).toBe(true)
  })
})
