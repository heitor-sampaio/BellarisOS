import { describe, it, expect } from 'vitest'
import { quandoDispara, jaEhHoraDeDisparar } from '@/lib/notifications/quando-dispara'

// D8 da 11ª simulação (2026-11-10): a revisão e os detalhes dizem quando a
// campanha automática sai — a mesma regra do cron.
describe('quando a campanha automática dispara (D8)', () => {
  it('o texto de cada gatilho, com a hora', () => {
    expect(quandoDispara('BIRTHDAY')).toBe('no dia do aniversário da cliente, a partir das 09:00')
    expect(quandoDispara('ANNUAL_DATE', { day: 8, month: 3 })).toBe('todo ano em 08/03, a partir das 09:00')
    expect(quandoDispara('DAYS_AFTER_VISIT', { days: 60 })).toBe('60 dias depois do último atendimento da cliente, a partir das 09:00')
    expect(quandoDispara('DAYS_BEFORE_EXPIRY', { days: 15 })).toBe('15 dias antes de o pacote da cliente vencer, a partir das 09:00')
    expect(quandoDispara('BEFORE_APPOINTMENT', { hours: 24 })).toContain('24 horas antes de cada agendamento')
    expect(quandoDispara(null)).toBe('escolha o gatilho')
  })
  it('os gatilhos do dia esperam as 09:00; o lembrete do agendamento, não', () => {
    expect(jaEhHoraDeDisparar('BIRTHDAY', 0)).toBe(false)
    expect(jaEhHoraDeDisparar('BIRTHDAY', 8)).toBe(false)
    expect(jaEhHoraDeDisparar('BIRTHDAY', 9)).toBe(true)
    expect(jaEhHoraDeDisparar('DAYS_AFTER_VISIT', 23)).toBe(true)
    expect(jaEhHoraDeDisparar('BEFORE_APPOINTMENT', 3)).toBe(true)
  })
})
