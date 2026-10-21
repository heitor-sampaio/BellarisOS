import { describe, it, expect } from 'vitest'
import { rotulosDoPeriodo } from '@/lib/rotulos-do-periodo'

// Com o filtro "Hoje", os cartões diziam "do mês" e "vs. mês anterior"
// (D36 da simulação de um dia de clínica, 2026-10-20).
describe('os rótulos do período escolhido', () => {
  it('cada período diz o seu', () => {
    expect(rotulosDoPeriodo('today')).toEqual({ doPeriodo: 'de hoje', noPeriodo: 'hoje', anterior: 'ontem' })
    expect(rotulosDoPeriodo('7d')).toEqual({ doPeriodo: 'dos 7 dias', noPeriodo: 'nos 7 dias', anterior: 'os 7 dias anteriores' })
    expect(rotulosDoPeriodo('month')).toEqual({ doPeriodo: 'do mês', noPeriodo: 'no mês', anterior: 'mês anterior' })
    expect(rotulosDoPeriodo('all').anterior).toBeNull()
    expect(rotulosDoPeriodo('custom')).toEqual({ doPeriodo: 'do período', noPeriodo: 'no período', anterior: 'período anterior' })
  })
})
