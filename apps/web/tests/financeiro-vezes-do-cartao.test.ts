import { describe, it, expect } from 'vitest'
import { maximoDeVezes, recusaDasVezes, opcoesDeVezes } from '@/lib/financeiro/vezes-do-cartao'

/**
 * D-15 (decisão do Heitor, 2026-10-29): "A clínica configura 'parcela até
 * Nx'. O padrão é o maior número de parcelas com taxa cadastrada." Sem
 * nenhuma taxa do crédito, o de hoje: 12x.
 */
describe('até quantas vezes a clínica parcela no crédito', () => {
  it('sem valor gravado, é a maior parcela do crédito com taxa', () => {
    expect(maximoDeVezes(null, [1, 3, 6])).toBe(6)
    expect(maximoDeVezes(null, [1])).toBe(1)
  })

  it('sem nenhuma taxa do crédito, 12x', () => {
    expect(maximoDeVezes(null, [])).toBe(12)
  })

  it('o que a clínica gravou vence o padrão', () => {
    expect(maximoDeVezes(4, [1, 3, 6])).toBe(4)
    expect(maximoDeVezes(10, [1, 3])).toBe(10)
  })

  it('fica sempre entre 1 e 12', () => {
    expect(maximoDeVezes(30, [])).toBe(12)
    expect(maximoDeVezes(0, [2])).toBe(2)
    expect(maximoDeVezes(null, [18])).toBe(12)
  })

  it('as opções do seletor vão de à vista ao máximo', () => {
    expect(opcoesDeVezes(3)).toEqual([1, 2, 3])
  })

  it('acima do limite é recusado, com o limite na frase', () => {
    expect(recusaDasVezes(6, 3)).toBe('A clínica parcela no cartão de crédito em até 3x.')
    expect(recusaDasVezes(3, 3)).toBeNull()
    expect(recusaDasVezes(1, 1)).toBeNull()
    expect(recusaDasVezes(2, 1)).toBe('A clínica não parcela no cartão de crédito: só à vista.')
  })
})
