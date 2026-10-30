import { describe, it, expect } from 'vitest'
import { faltamPontos } from '@/lib/fidelidade/formato'

/**
 * J-52 (simulação de 2026-10-30): a recompensa fora do alcance não dizia
 * quanto faltava — no app o "Trocar" ficava desabilitado sem explicação, e na
 * ficha também. O texto é UM, para o app e para a ficha.
 */
describe('faltamPontos', () => {
  it('diz quanto falta quando o saldo não alcança', () => {
    expect(faltamPontos(380, 500)).toBe('Faltam 120 pontos')
    expect(faltamPontos(499, 500)).toBe('Falta 1 ponto')
    expect(faltamPontos(0, 1500)).toBe('Faltam 1.500 pontos')
  })

  it('saldo negativo conta a partir do zero devido', () => {
    expect(faltamPontos(-20, 100)).toBe('Faltam 120 pontos')
  })

  it('com saldo bastante, nada a dizer', () => {
    expect(faltamPontos(500, 500)).toBeNull()
    expect(faltamPontos(900, 500)).toBeNull()
  })
})
