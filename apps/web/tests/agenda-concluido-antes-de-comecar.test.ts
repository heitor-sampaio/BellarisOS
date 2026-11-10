import { describe, it, expect } from 'vitest'
import { fimDaOcupacao, bateNaOcupacao } from '@/lib/appointments/ocupacao'

// D3 da 11ª simulação (2026-11-10): o concluído antes de começar (marcado às
// 10:30, concluído às 10:14) não ocupa nada — a recusa dizia "das 10:30 às
// 10:14" para as 10:07 por 60 min. A régua da recusa é a da grade (A16 da 10ª).
const em = (hhmm: string) => new Date(`2026-11-12T${hhmm}:00-03:00`).getTime()
const carla = { scheduled_at: new Date(em('10:30')).toISOString(), duration_min: 30, status: 'COMPLETED', completed_at: new Date(em('10:14')).toISOString() }

describe('bateNaOcupacao (D3 da 11ª)', () => {
  it('o concluído antes de começar não bate nas 10:07 por 60 min', () =>
    expect(bateNaOcupacao(em('10:07'), em('11:07'), em('10:30'), fimDaOcupacao(carla))).toBe(false))
  it('nem em intervalo nenhum que o contenha', () =>
    expect(bateNaOcupacao(em('08:00'), em('12:00'), em('10:30'), fimDaOcupacao(carla))).toBe(false))
  it('o concluído adiantado (começou e terminou antes da hora) ocupa até a conclusão', () => {
    const adiantado = { ...carla, scheduled_at: new Date(em('10:00')).toISOString(), completed_at: new Date(em('10:14')).toISOString() }
    expect(bateNaOcupacao(em('10:10'), em('10:40'), em('10:00'), fimDaOcupacao(adiantado))).toBe(true)
    expect(bateNaOcupacao(em('10:14'), em('10:44'), em('10:00'), fimDaOcupacao(adiantado))).toBe(false)
  })
  it('o agendado ocupa a duração inteira', () => {
    const agendado = { scheduled_at: new Date(em('10:30')).toISOString(), duration_min: 30, status: 'SCHEDULED', completed_at: null }
    expect(bateNaOcupacao(em('10:07'), em('11:07'), em('10:30'), fimDaOcupacao(agendado))).toBe(true)
    expect(bateNaOcupacao(em('11:00'), em('11:30'), em('10:30'), fimDaOcupacao(agendado))).toBe(false)
  })
})
