import { describe, expect, it } from 'vitest'
import { percentualDaCota, tokensDaCotaDigitada } from '@estetica-os/nucleo/lib/planos/recursos'

/** A cota do Copilot: como o sistema lê o que se digita, e o percentual usado. */
describe('tokensDaCotaDigitada (milhões de tokens)', () => {
  it('vírgula e ponto são decimais', () => {
    expect(tokensDaCotaDigitada('2,5')).toBe(2_500_000)
    // Era 25 milhões: o ponto saía como separador de milhar.
    expect(tokensDaCotaDigitada('2.5')).toBe(2_500_000)
  })
  it('inteiro; com vírgula, o ponto é milhar (e acima do teto vira o teto)', () => {
    expect(tokensDaCotaDigitada('3')).toBe(3_000_000)
    expect(tokensDaCotaDigitada('1.000,5')).toBe(1_000_000_000)
    expect(tokensDaCotaDigitada('0,25')).toBe(250_000)
  })
  it('vazio, zero ou lixo = sem limite', () => {
    expect(tokensDaCotaDigitada('')).toBeNull()
    expect(tokensDaCotaDigitada('0')).toBeNull()
    expect(tokensDaCotaDigitada('abc')).toBeNull()
  })
})

describe('percentualDaCota', () => {
  it('arredonda para BAIXO: 99,6% não é "100% da cota" com a cota ainda aberta', () => {
    expect(percentualDaCota(996, 1000)).toBe(99)
    expect(percentualDaCota(1000, 1000)).toBe(100)
  })
  it('passou do teto fica em 100; sem cota é null', () => {
    expect(percentualDaCota(1500, 1000)).toBe(100)
    expect(percentualDaCota(10, null)).toBeNull()
  })
})
