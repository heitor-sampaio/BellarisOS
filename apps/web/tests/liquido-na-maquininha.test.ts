import { describe, it, expect } from 'vitest'
import { liquidoNaMaquininha } from '@/lib/metrics/resultado'

// A40 da 8ª simulação: a taxa e o líquido ao escolher o cartão e as vezes.
describe('A40: o líquido na maquininha', () => {
  it('R$ 100 a 2,97%: R$ 2,97 de taxa, R$ 97,03 para a clínica', () => {
    expect(liquidoNaMaquininha(100, 2.97)).toEqual({ taxa: 2.97, liquido: 97.03 })
  })
  it('em centavos: R$ 180 a 2,97% são R$ 5,35', () => {
    expect(liquidoNaMaquininha(180, 2.97)).toEqual({ taxa: 5.35, liquido: 174.65 })
  })
  it('a taxa nunca passa do valor (sem teto de taxa, F16-3)', () => {
    expect(liquidoNaMaquininha(100, 120)).toEqual({ taxa: 100, liquido: 0 })
  })
})
