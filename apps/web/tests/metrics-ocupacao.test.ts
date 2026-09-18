import { describe, it, expect } from 'vitest'
import { businessDaysBetween, occupancyPct, CAPACITY_HOURS_PER_DAY } from '@/lib/metrics'
import { zonedToUtc } from '@/lib/datetime'

const seg = zonedToUtc(2026, 9, 14)   // segunda
const sab = zonedToUtc(2026, 9, 19)   // sábado
const dom = zonedToUtc(2026, 9, 20)   // domingo
const segSeguinte = zonedToUtc(2026, 9, 21)

describe('businessDaysBetween', () => {
  it('conta de segunda a sábado', () => {
    expect(businessDaysBetween(seg, dom)).toBe(6)
  })

  it('domingo não conta', () => {
    expect(businessDaysBetween(sab, segSeguinte)).toBe(1)
  })

  it('janela menor que um dia ainda vale um dia — nunca divide por zero', () => {
    expect(businessDaysBetween(seg, seg)).toBe(1)
  })
})

describe('occupancyPct', () => {
  it('minutos agendados sobre a capacidade do período', () => {
    const capacidadeDeUmDia = CAPACITY_HOURS_PER_DAY * 60      // 480 min
    expect(occupancyPct(capacidadeDeUmDia / 2, 1, seg, seg)).toBe(50)
  })

  it('sem profissional devolve null — 0% seria lido como "ninguém atendeu"', () => {
    expect(occupancyPct(300, 0, seg, dom)).toBeNull()
  })

  it('não passa de 100%', () => {
    expect(occupancyPct(999_999, 1, seg, dom)).toBe(100)
  })

  it('mais profissionais, mais capacidade — a mesma agenda ocupa menos', () => {
    const um   = occupancyPct(2400, 1, seg, dom)!
    const dois = occupancyPct(2400, 2, seg, dom)!
    expect(dois).toBeCloseTo(um / 2, 10)
  })

  it('zero agendado é 0%, não null', () => {
    expect(occupancyPct(0, 2, seg, dom)).toBe(0)
  })
})
