import { describe, it, expect } from 'vitest'
import {
  AWAITING_THRESHOLDS, STALE_THRESHOLDS,
  secondsSince, agingLevel, formatDurationShort, formatDurationLong,
} from '../src/crm-metrics'

const AGORA = new Date('2026-09-18T13:00:00Z').getTime()

describe('secondsSince', () => {
  it('conta os segundos até o "agora" recebido — sem depender do relógio', () => {
    expect(secondsSince('2026-09-18T12:00:00Z', AGORA)).toBe(3600)
  })

  it('sem data, null', () => {
    expect(secondsSince(null, AGORA)).toBeNull()
    expect(secondsSince(undefined, AGORA)).toBeNull()
  })

  it('data no futuro não vira negativo', () => {
    expect(secondsSince('2026-09-18T14:00:00Z', AGORA)).toBe(0)
  })
})

describe('agingLevel', () => {
  it('cliente aguardando: 1h é atenção, 4h é atraso', () => {
    expect(agingLevel(0, AWAITING_THRESHOLDS)).toBe('ok')
    expect(agingLevel(3600, AWAITING_THRESHOLDS)).toBe('warn')
    expect(agingLevel(4 * 3600, AWAITING_THRESHOLDS)).toBe('alert')
  })

  it('lead parado: 3 dias esfria, 7 dias fica frio', () => {
    expect(agingLevel(2 * 86400, STALE_THRESHOLDS)).toBe('ok')
    expect(agingLevel(3 * 86400, STALE_THRESHOLDS)).toBe('warn')
    expect(agingLevel(8 * 86400, STALE_THRESHOLDS)).toBe('alert')
  })

  it('sem medida, não acusa atraso', () => {
    expect(agingLevel(null, AWAITING_THRESHOLDS)).toBe('ok')
  })
})

describe('durações em pt-BR', () => {
  it('curta', () => {
    expect(formatDurationShort(null)).toBe('—')
    expect(formatDurationShort(30)).toBe('agora')
    expect(formatDurationShort(12 * 60)).toBe('12min')
    expect(formatDurationShort(3 * 3600)).toBe('3h')
    expect(formatDurationShort(5 * 86400)).toBe('5d')
  })

  it('longa', () => {
    expect(formatDurationLong(null)).toBe('—')
    expect(formatDurationLong(30)).toBe('menos de 1min')
    expect(formatDurationLong(45 * 60)).toBe('45min')
    expect(formatDurationLong(2 * 3600 + 15 * 60)).toBe('2h 15min')
    expect(formatDurationLong(3 * 3600)).toBe('3h')
    expect(formatDurationLong(86400)).toBe('1 dia')
    expect(formatDurationLong(2 * 86400)).toBe('2 dias')
    expect(formatDurationLong(86400 + 5 * 3600)).toBe('1d 5h')
  })
})
