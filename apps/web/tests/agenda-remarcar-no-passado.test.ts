import { describe, it, expect } from 'vitest'
import { avisoDoHorarioPassado } from '@/lib/appointments/horario-passado'

// A24 da 11ª simulação (2026-11-10): remarcar para um horário que já passou
// era aceito sem aviso. Princípio 2: avisa, não recusa.
describe('A24 da 11ª: o remarcar para um horário que já passou avisa', () => {
  const agora = new Date('2026-11-10T13:40:00Z') // 10:40 em Brasília
  it('o horário de antes de agora avisa, com o dia e a hora de Brasília', () => {
    expect(avisoDoHorarioPassado('2026-11-10T12:00:00Z', agora)).toBe(
      'O horário novo (10/11/2026 às 09:00) já passou: o agendamento fica no passado. Remarcar assim é permitido — confira se é o horário certo.')
  })
  it('o de daqui para a frente não avisa', () => {
    expect(avisoDoHorarioPassado('2026-11-10T14:00:00Z', agora)).toBeNull()
  })
})
