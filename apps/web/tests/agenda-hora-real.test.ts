import { describe, it, expect } from 'vitest'
import { textoDoConcluido } from '@/lib/agenda/hora-real'

// J-34 (2026-10-30): o concluído mostra a hora real, ao lado da agendada.

describe('a hora real do concluído', () => {
  it('no mesmo dia (Brasília): "concluído às HH:mm"', () => {
    expect(textoDoConcluido('2026-10-30T13:00:00.000Z', '2026-10-30T14:12:00.000Z')).toBe('concluído às 11:12')
  })
  it('passou da meia-noite: com a data', () => {
    // Agendado 23:30 de 30/10 (02:30Z de 31/10), concluído 00:22 de 31/10 (03:22Z).
    expect(textoDoConcluido('2026-10-31T02:30:00.000Z', '2026-10-31T03:22:00.000Z')).toBe('concluído em 31/10 às 00:22')
  })
  it('o dia é o de Brasília, não o UTC', () => {
    // 22:00 e 23:50 de 30/10 em Brasília já são 31/10 em UTC: o mesmo dia.
    expect(textoDoConcluido('2026-10-31T01:00:00.000Z', '2026-10-31T02:50:00.000Z')).toBe('concluído às 23:50')
  })
  it('sem a hora real: nulo', () => {
    expect(textoDoConcluido('2026-10-30T13:00:00.000Z', null)).toBeNull()
    expect(textoDoConcluido('2026-10-30T13:00:00.000Z', 'lixo')).toBeNull()
  })
})
