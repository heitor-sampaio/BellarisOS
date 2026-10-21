import { describe, it, expect } from 'vitest'
import { formatDia, idadeEm } from '@estetica-os/utils'

// A data de nascimento é gravada à meia-noite UTC (timestamptz): convertida
// para Brasília, vira 21h da VÉSPERA — o 15/03 aparecia 14/03 no portal, no
// PDF da LGPD e no atendimento (simulação de um dia de clínica, 2026-10-20).
describe('o dia do calendário, sem fuso', () => {
  it('a meia-noite UTC continua no mesmo dia', () => {
    expect(formatDia('1994-03-15 00:00:00+00')).toBe('15/03/1994')
    expect(formatDia('1994-03-15T00:00:00.000Z')).toBe('15/03/1994')
    expect(formatDia('1994-03-15')).toBe('15/03/1994')
  })
  it('vazio ou inválido não quebra', () => {
    expect(formatDia(null)).toBeNull()
    expect(formatDia('amanhã')).toBeNull()
  })
  it('a idade vira no dia do aniversário, não na véspera', () => {
    const hoje = new Date('2026-03-15T12:00:00-03:00')
    expect(idadeEm('1994-03-15 00:00:00+00', hoje)).toBe(32)
    expect(idadeEm('1994-03-16 00:00:00+00', hoje)).toBe(31)
  })
})
