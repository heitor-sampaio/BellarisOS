import { describe, it, expect } from 'vitest'
import { parseDinheiro, formatDinheiroCampo, DINHEIRO_INVALIDO } from '@estetica-os/utils'
import { lerEntrada } from '@/lib/checkout/entrada'

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

  /**
   * D3 (simulação de 2026-10-29): a dona digitou "1.400" no preço da Toxina e
   * gravou R$ 1,40, sem aviso. Sem vírgula, o ponto seguido de grupos de
   * EXATAMENTE três dígitos é milhar; com um ou dois dígitos depois, decimal.
   */
  it('ponto de milhar sem vírgula (grupos de três dígitos)', () => {
    expect(parseDinheiro('1.400')).toBe(1400)
    expect(parseDinheiro('12.500')).toBe(12500)
    expect(parseDinheiro('1.400.000')).toBe(1400000)
    expect(parseDinheiro('R$ 1.400')).toBe(1400)
  })
  it('ponto com um ou dois dígitos depois continua decimal', () => {
    expect(parseDinheiro('1.5')).toBe(1.5)
    expect(parseDinheiro('1400.00')).toBe(1400)
    expect(parseDinheiro('0.50')).toBe(0.5)
  })
  it('milhar e vírgula juntos', () => {
    expect(parseDinheiro('1.400,50')).toBe(1400.5)
    expect(parseDinheiro('12.500,5')).toBe(12500.5)
  })
  it('o ambíguo é recusado (NaN), não adivinhado', () => {
    // começa com zero: não é milhar, e três casas não são centavos
    expect(parseDinheiro('0.012')).toBeNaN()
    // grupo que não é de três dígitos
    expect(parseDinheiro('1.4000')).toBeNaN()
    expect(parseDinheiro('12.34.56')).toBeNaN()
    expect(parseDinheiro('1.400.5')).toBeNaN()
    // formato americano
    expect(parseDinheiro('1,400.50')).toBeNaN()
    // mais de dois dígitos de centavos
    expect(parseDinheiro('1,500')).toBeNaN()
    expect(parseDinheiro('1.400,505')).toBeNaN()
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

/**
 * A entrada do contrato e do checkout (frente de cadastro, 2026-10-29): o
 * ilegível virava R$ 0 calado (`parseDinheiro(...) || 0`). Ganha o mesmo
 * aviso dos outros campos de dinheiro; vazio continua sendo "sem entrada".
 */
describe('lerEntrada', () => {
  it('vazio é sem entrada (R$ 0)', () => {
    expect(lerEntrada('')).toEqual({ valor: 0 })
    expect(lerEntrada('  ')).toEqual({ valor: 0 })
  })
  it('lê como todo campo de dinheiro', () => {
    expect(lerEntrada('100')).toEqual({ valor: 100 })
    expect(lerEntrada('1.400,50')).toEqual({ valor: 1400.5 })
    expect(lerEntrada('1.400')).toEqual({ valor: 1400 })
  })
  it('o ilegível ou ambíguo é recusado com o aviso de sempre — nunca vira R$ 0', () => {
    expect(lerEntrada('1,400.50')).toEqual({ erro: DINHEIRO_INVALIDO })
    expect(lerEntrada('0.012')).toEqual({ erro: DINHEIRO_INVALIDO })
    expect(lerEntrada('abc')).toEqual({ erro: DINHEIRO_INVALIDO })
  })
  it('negativa é recusada', () => {
    expect(lerEntrada('-50')).toEqual({ erro: 'A entrada não pode ser negativa.' })
  })
})
