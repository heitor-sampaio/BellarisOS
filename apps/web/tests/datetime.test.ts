import { describe, it, expect } from 'vitest'
import {
  BUSINESS_TZ, partsInTZ, zonedToUtc,
  startOfDayTZ, endOfDayTZ, startOfMonthTZ, endOfMonthTZ,
  addDaysTZ, addMonthsTZ, dayKeyTZ, monthKeyTZ, periodRef, weekdayTZ,
} from '@/lib/datetime'

/**
 * As asserções são em ISO (instante absoluto): não dependem do fuso de quem
 * roda o teste, que é justamente o que estes helpers existem para não fazer.
 * Brasília está em UTC-3 o ano todo desde 2019 — sem horário de verão.
 */

// 18/09/2026 20:30 em São Paulo
const NOITE = new Date('2026-09-18T23:30:00Z')
// 18/09/2026 22:00 em São Paulo — depois das 21h, a hora que virava o dia
const DEPOIS_DAS_21 = new Date('2026-09-19T01:00:00Z')

describe('partsInTZ', () => {
  it('lê os componentes no fuso do negócio, não no do processo', () => {
    expect(BUSINESS_TZ).toBe('America/Sao_Paulo')
    expect(partsInTZ(NOITE)).toEqual({ year: 2026, month: 9, day: 18, hour: 20, minute: 30, second: 0 })
  })

  it('meia-noite é hora 0, não 24', () => {
    expect(partsInTZ(new Date('2026-09-18T03:00:00Z')).hour).toBe(0)
  })
})

describe('zonedToUtc', () => {
  it('converte hora de parede em instante UTC', () => {
    expect(zonedToUtc(2026, 9, 18, 9, 0).toISOString()).toBe('2026-09-18T12:00:00.000Z')
  })

  it('meia-noite de Brasília é 03:00 UTC', () => {
    expect(zonedToUtc(2026, 9, 18).toISOString()).toBe('2026-09-18T03:00:00.000Z')
  })
})

describe('limites de janela', () => {
  it('início e fim do dia do negócio', () => {
    expect(startOfDayTZ(NOITE).toISOString()).toBe('2026-09-18T03:00:00.000Z')
    expect(endOfDayTZ(NOITE).toISOString()).toBe('2026-09-19T02:59:59.999Z')
  })

  it('às 22h de Brasília ainda é o mesmo dia — a agenda abria no dia seguinte', () => {
    expect(dayKeyTZ(DEPOIS_DAS_21)).toBe('2026-09-18')
    expect(startOfDayTZ(DEPOIS_DAS_21).toISOString()).toBe('2026-09-18T03:00:00.000Z')
  })

  it('início e fim do mês', () => {
    expect(startOfMonthTZ(NOITE).toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(endOfMonthTZ(NOITE).toISOString()).toBe('2026-10-01T02:59:59.999Z')
  })

  it('fevereiro termina no dia 28 em ano comum', () => {
    expect(endOfMonthTZ(new Date('2026-02-10T12:00:00Z')).toISOString()).toBe('2026-03-01T02:59:59.999Z')
  })
})

describe('aritmética de calendário', () => {
  it('addDaysTZ preserva a hora do dia', () => {
    const d = addDaysTZ(NOITE, -1)
    expect(partsInTZ(d)).toMatchObject({ day: 17, hour: 20, minute: 30 })
  })

  it('addDaysTZ atravessa a virada do mês', () => {
    expect(dayKeyTZ(addDaysTZ(new Date('2026-09-01T12:00:00Z'), -1))).toBe('2026-08-31')
  })

  it('addMonthsTZ cai no primeiro dia do mês alvo', () => {
    expect(addMonthsTZ(NOITE, -1).toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(addMonthsTZ(new Date('2026-01-15T12:00:00Z'), -1).toISOString()).toBe('2025-12-01T03:00:00.000Z')
  })
})

describe('chaves de agrupamento', () => {
  it('aceita Date e string ISO', () => {
    expect(dayKeyTZ(NOITE)).toBe('2026-09-18')
    expect(dayKeyTZ('2026-09-18T23:30:00Z')).toBe('2026-09-18')
    expect(monthKeyTZ(NOITE)).toBe('2026-09')
  })

  it('periodRef de comissão é a chave mensal', () => {
    expect(periodRef).toBe(monthKeyTZ)
    expect(periodRef(DEPOIS_DAS_21)).toBe('2026-09')
  })

  it('weekdayTZ usa o dia do fuso do negócio (0 = domingo)', () => {
    expect(weekdayTZ(NOITE)).toBe(5)               // sexta, 18/09/2026
    expect(weekdayTZ(DEPOIS_DAS_21)).toBe(5)       // 22h de sexta ainda é sexta
    expect(weekdayTZ('2026-09-20T15:00:00Z')).toBe(0)
  })
})
