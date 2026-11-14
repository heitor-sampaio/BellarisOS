import { describe, it, expect } from 'vitest'
import { quandoDispara, jaEhHoraDeDisparar } from '@/lib/notifications/quando-dispara'

// D8 da 11ª simulação (2026-11-10): a revisão e os detalhes dizem quando a
// campanha sai — a mesma regra do cron. Desde o MK1 (2026-11-14) o único
// gatilho da campanha é a data de todo ano, na Agendada.
describe('quando a campanha de todo ano dispara (D8)', () => {
  it('o texto, com a hora', () => {
    expect(quandoDispara('ANNUAL_DATE', { day: 8, month: 3 })).toBe('todo ano em 08/03, a partir das 09:00')
    expect(quandoDispara(null)).toBe('escolha a data')
  })
  it('a data de todo ano espera as 09:00', () => {
    expect(jaEhHoraDeDisparar('ANNUAL_DATE', 0)).toBe(false)
    expect(jaEhHoraDeDisparar('ANNUAL_DATE', 8)).toBe(false)
    expect(jaEhHoraDeDisparar('ANNUAL_DATE', 9)).toBe(true)
    expect(jaEhHoraDeDisparar('ANNUAL_DATE', 23)).toBe(true)
  })
})
