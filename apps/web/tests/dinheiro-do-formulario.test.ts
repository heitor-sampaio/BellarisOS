import { describe, it, expect } from 'vitest'
import { parseDinheiro, formatDinheiroCampo } from '@estetica-os/utils'

/**
 * D10 (simulação de 2026-10-27): o preço do procedimento era uma máscara de
 * centavos — digitar "180" gravava R$ 1,80. Todo campo de dinheiro lê o que
 * a pessoa escreve do mesmo jeito: "180" é R$ 180,00.
 */
describe('parseDinheiro', () => {
  it('número inteiro é reais', () => {
    expect(parseDinheiro('180')).toBe(180)
  })
  it('vírgula decimal', () => {
    expect(parseDinheiro('180,5')).toBe(180.5)
    expect(parseDinheiro('180,50')).toBe(180.5)
  })
  it('ponto de milhar com vírgula', () => {
    expect(parseDinheiro('1.234,56')).toBe(1234.56)
  })
  it('ponto decimal sem vírgula (valor vindo do banco)', () => {
    expect(parseDinheiro('180.50')).toBe(180.5)
  })
  it('R$ e espaços não atrapalham', () => {
    expect(parseDinheiro(' R$ 1.200,00 ')).toBe(1200)
  })
  it('vazio ou lixo = NaN', () => {
    expect(parseDinheiro('')).toBeNaN()
    expect(parseDinheiro('abc')).toBeNaN()
  })
})

describe('formatDinheiroCampo', () => {
  it('formata em pt-BR com duas casas', () => {
    expect(formatDinheiroCampo(180)).toBe('180,00')
    expect(formatDinheiroCampo(1234.5)).toBe('1.234,50')
  })
  it('NaN vira vazio', () => {
    expect(formatDinheiroCampo(NaN)).toBe('')
  })
})
