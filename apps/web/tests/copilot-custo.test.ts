import { describe, expect, it } from 'vitest'
import { custoEmDolar, dolares, reaisEstimados, cotacaoDoDolar } from '@estetica-os/nucleo/lib/planos/custo-do-copilot'

/**
 * O custo estimado do Copilot (2026-10-08): o preço da OpenAI por milhão de
 * tokens, de entrada e de saída, por modelo — conferido na página de preços
 * dela. O que ela não lista (um modelo novo) fica SEM custo, em vez de um
 * número inventado.
 */
describe('custoEmDolar', () => {
  it('gpt-5-mini: US$ 0,25 o milhão de entrada e US$ 2,00 o de saída', () => {
    expect(custoEmDolar('gpt-5-mini', 1_000_000, 1_000_000)).toBeCloseTo(2.25, 6)
    expect(custoEmDolar('gpt-5-mini', 100, 20)).toBeCloseTo(0.000065, 9)
  })
  it('o modelo com data no nome (gpt-5-mini-2025-08-07) é o mesmo preço', () => {
    expect(custoEmDolar('gpt-5-mini-2025-08-07', 1_000_000, 0)).toBeCloseTo(0.25, 6)
  })
  it('o nome mais específico ganha: gpt-5-mini não é o preço do gpt-5', () => {
    expect(custoEmDolar('gpt-5', 1_000_000, 0)).toBeCloseTo(1.25, 6)
  })
  it('a transcrição: o áudio de entrada a US$ 3,00 o milhão', () => {
    expect(custoEmDolar('gpt-4o-mini-transcribe', 1_000_000, 0)).toBeCloseTo(3, 6)
  })
  it('modelo que a tabela não conhece: sem custo (null), não zero', () => {
    expect(custoEmDolar('modelo-que-nao-existe', 1000, 1000)).toBeNull()
  })
})

describe('formatos', () => {
  it('dólar com vírgula, e centavo de dólar para valores pequenos', () => {
    expect(dolares(1234.5)).toBe('US$ 1.234,50')
    expect(dolares(0.004)).toBe('US$ 0,004')
    expect(dolares(0)).toBe('US$ 0,00')
  })
  it('reais pela cotação', () => {
    expect(reaisEstimados(2, 5.5)).toBe('R$ 11,00')
  })
  it('a cotação vem do ambiente; sem ela (ou inválida), 5,50', () => {
    expect(cotacaoDoDolar(undefined)).toBe(5.5)
    expect(cotacaoDoDolar('abc')).toBe(5.5)
    expect(cotacaoDoDolar('5,12')).toBe(5.12)
  })
})
