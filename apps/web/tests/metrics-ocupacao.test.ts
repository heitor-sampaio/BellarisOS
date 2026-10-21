import { describe, it, expect } from 'vitest'
import { occupancyPct } from '@/lib/metrics'
import { zonedToUtc } from '@/lib/datetime'

// A ocupação usa a capacidade do HORÁRIO de funcionamento (2026-10-21): até
// aqui era 8 h por profissional no dashboard e 12 h na agenda, e as duas telas
// davam números diferentes (D12 da simulação de um dia de clínica).

const seg = zonedToUtc(2026, 10, 19)  // segunda, 19/10/2026 (o mês de zonedToUtc começa em 1)
const dom = zonedToUtc(2026, 10, 25)  // domingo
const fimDaSeg = new Date(seg.getTime() + 86_399_000)
const padrao = { unidade: null, profissionais: [null] }   // seg–sáb, 08–20: 720 min/dia

describe('occupancyPct', () => {
  it('minutos agendados sobre a capacidade do horário', () => {
    expect(occupancyPct(360, padrao, seg, fimDaSeg)).toBe(50)
  })

  it('o domingo fechado não conta capacidade', () => {
    expect(occupancyPct(6 * 720, padrao, seg, dom)).toBe(100)
  })

  it('o horário da unidade decide a capacidade', () => {
    const meioPeriodo = { unidade: { dias: { 1: [{ de: '08:00', ate: '12:00' }] } }, profissionais: [null] }
    expect(occupancyPct(120, meioPeriodo, seg, fimDaSeg)).toBe(50)
  })

  it('sem profissional devolve null — 0% seria lido como "ninguém atendeu"', () => {
    expect(occupancyPct(300, { unidade: null, profissionais: [] }, seg, dom)).toBeNull()
  })

  it('não passa de 100%', () => {
    expect(occupancyPct(999_999, padrao, seg, dom)).toBe(100)
  })

  it('mais profissionais, mais capacidade — a mesma agenda ocupa menos', () => {
    expect(occupancyPct(720, { unidade: null, profissionais: [null, null] }, seg, fimDaSeg)).toBe(50)
  })

  it('percentual inteiro (a tela mostrava "6.25")', () => {
    expect(occupancyPct(45, padrao, seg, fimDaSeg)).toBe(6)
  })

  it('zero agendado é 0%, não null', () => {
    expect(occupancyPct(0, padrao, seg, dom)).toBe(0)
  })
})
