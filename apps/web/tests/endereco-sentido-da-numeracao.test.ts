import { describe, it, expect } from 'vitest'
import { enderecoComNumero, separarNumero } from '@/lib/unidades/endereco-com-numero'

/**
 * A32 da 32ª simulação (2026-11-26; princípio 3): o CEP 89801-000 (Chapecó)
 * preencheu "Avenida Getúlio Dorneles Vargas - N — Centro", e com o número a
 * unidade gravava "Avenida Getúlio Dorneles Vargas - N, 123 — Centro". O "- N"
 * vem dos Correios (o ViaCEP o põe no logradouro) e é dado de verdade: em
 * Chapecó a numeração tem sentido (N, S, L, O, E, D), e o endereço se escreve
 * "Av. Getúlio Vargas, 957-S" (é assim que a prefeitura escreve o dela). Tirar
 * a letra perderia o endereço; ela vai para depois do número.
 */
describe('A32: o sentido da numeração vai depois do número', () => {
  it('"Avenida X - N" com o número 123 é "Avenida X, 123-N"', () => {
    expect(enderecoComNumero('Avenida Getúlio Dorneles Vargas - N — Centro', '123'))
      .toBe('Avenida Getúlio Dorneles Vargas, 123-N — Centro')
    expect(enderecoComNumero('Rua São Pedro - D', '387')).toBe('Rua São Pedro, 387-D')
  })

  it('sem número, o logradouro como os Correios o escrevem', () => {
    expect(enderecoComNumero('Avenida Getúlio Dorneles Vargas - N — Centro', ''))
      .toBe('Avenida Getúlio Dorneles Vargas - N — Centro')
  })

  it('para editar, separa de novo: o logradouro com a letra, e o número', () => {
    expect(separarNumero('Avenida Getúlio Dorneles Vargas, 957-S — Centro'))
      .toEqual({ endereco: 'Avenida Getúlio Dorneles Vargas - S — Centro', numero: '957' })
    const e = 'Avenida Nereu Ramos - E — Centro'
    expect(separarNumero(enderecoComNumero(e, '1750'))).toEqual({ endereco: e, numero: '1750' })
  })

  it('o que não é o sentido da numeração fica como está', () => {
    expect(enderecoComNumero('Rua A - Bloco B', '10')).toBe('Rua A - Bloco B, 10')
    expect(enderecoComNumero('Av. Brasil', '45A')).toBe('Av. Brasil, 45A')
  })
})
