import { describe, it, expect } from 'vitest'
import {
  formatBRL, formatDate, formatDateTime, formatTime, formatPercent,
  maskCPF, maskPhone, maskCNPJ,
} from '../src/format'

describe('formatBRL', () => {
  it('moeda no formato brasileiro', () => {
    // O espaço entre "R$" e o número é NBSP no ICU — normalizado para comparar.
    expect(formatBRL(1240).replace(/ /g, ' ')).toBe('R$ 1.240,00')
    expect(formatBRL(0).replace(/ /g, ' ')).toBe('R$ 0,00')
  })

  it('negativo mantém o sinal', () => {
    expect(formatBRL(-50).replace(/ /g, ' ')).toBe('-R$ 50,00')
  })
})

describe('datas no fuso do negócio', () => {
  // 18/09/2026 20:30 em São Paulo. Em UTC já é dia 19.
  const instante = '2026-09-18T23:30:00Z'

  it('formatDate usa o dia de Brasília, não o do processo', () => {
    expect(formatDate(instante)).toBe('18/09/2026')
  })

  it('formatTime e formatDateTime também', () => {
    expect(formatTime(instante)).toBe('20:30')
    expect(formatDateTime(instante).replace(/ /g, ' ')).toBe('18/09/2026, 20:30')
  })

  it('aceita Date e string', () => {
    expect(formatDate(new Date(instante))).toBe(formatDate(instante))
  })
})

describe('formatPercent', () => {
  it('vírgula decimal, uma casa por padrão', () => {
    expect(formatPercent(12.36)).toBe('12,4%')
    expect(formatPercent(12.35, 2)).toBe('12,35%')
    expect(formatPercent(0)).toBe('0,0%')
  })

  it('arredonda pelo binário, como todo toFixed — 12,35 fica 12,3', () => {
    // 12.35 não é exato em ponto flutuante (é 12.3499…). Está aqui para que a
    // diferença de meio décimo apareça como decisão registrada, e não como
    // surpresa no relatório de alguém.
    expect(formatPercent(12.35)).toBe('12,3%')
  })
})

describe('máscaras', () => {
  it('CPF', () => {
    expect(maskCPF('12345678901')).toBe('123.456.789-01')
    expect(maskCPF('123.456.789-01')).toBe('123.456.789-01')
  })

  it('telefone com 11 e com 10 dígitos', () => {
    expect(maskPhone('47991234567')).toBe('(47) 99123-4567')
    expect(maskPhone('4733224567')).toBe('(47) 3322-4567')
  })

  it('telefone já mascarado não é remascarado errado', () => {
    expect(maskPhone('(47) 99123-4567')).toBe('(47) 99123-4567')
  })

  it('CNPJ', () => {
    expect(maskCNPJ('12345678000199')).toBe('12.345.678/0001-99')
  })
})
