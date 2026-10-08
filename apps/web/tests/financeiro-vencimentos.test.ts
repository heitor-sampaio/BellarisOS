import { describe, expect, it } from 'vitest'
import { vencimentoDoDia, vencimentosRecorrentes } from '@/lib/financeiro/vencimentos'

/**
 * O vencimento mora ao MEIO-DIA de Brasília (15:00Z): à meia-noite UTC ele é
 * a noite do dia anterior em Brasília, e a despesa aparecia vencida um dia
 * antes (revisão de 2026-10-08).
 */
describe('vencimentoDoDia', () => {
  it('o dia vira meio-dia de Brasília', () => {
    expect(vencimentoDoDia('2026-11-05')).toBe('2026-11-05T15:00:00.000Z')
  })
  it('vazio é sem vencimento', () => {
    expect(vencimentoDoDia(null)).toBeNull()
    expect(vencimentoDoDia('')).toBeNull()
  })
})

describe('vencimentosRecorrentes', () => {
  it('mensal: o mesmo dia a cada mês, ao meio-dia de Brasília', () => {
    expect(vencimentosRecorrentes('2026-11-05', 'monthly', 3)).toEqual([
      '2026-11-05T15:00:00.000Z', '2026-12-05T15:00:00.000Z', '2027-01-05T15:00:00.000Z',
    ])
  })
  it('semanal e quinzenal', () => {
    expect(vencimentosRecorrentes('2026-11-05', 'weekly', 2)[1]).toBe('2026-11-12T15:00:00.000Z')
    expect(vencimentosRecorrentes('2026-11-05', 'biweekly', 2)[1]).toBe('2026-11-19T15:00:00.000Z')
  })
  it('trimestral e anual', () => {
    expect(vencimentosRecorrentes('2026-11-05', 'quarterly', 2)[1]).toBe('2027-02-05T15:00:00.000Z')
    expect(vencimentosRecorrentes('2026-11-05', 'yearly', 2)[1]).toBe('2027-11-05T15:00:00.000Z')
  })
  it('dia 31 num mês curto cai no último dia do mês, não no seguinte', () => {
    expect(vencimentosRecorrentes('2027-01-31', 'monthly', 3)).toEqual([
      '2027-01-31T15:00:00.000Z', '2027-02-28T15:00:00.000Z', '2027-03-31T15:00:00.000Z',
    ])
  })
})
