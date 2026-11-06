import { describe, it, expect } from 'vitest'
import { ocupanteDoHorario, livresEntre, blocosDosBloqueios } from '@/lib/agenda/horario-livre'
import { capacidadeEmMinutos, type Horario } from '@/lib/agenda/horario'

// D5 e D15 da 8ª simulação (2026-11-06): uma régua só de horário livre — o
// intervalo INTEIRO [início, início + duração) contra os agendamentos e os
// bloqueios.
const em = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00-03:00`)
const ocupados = [{ scheduledAt: em('10:30').toISOString(), durationMin: 30, clientName: 'Rafaela' }]
const bloqueios = [{ inicio: em('14:00').toISOString(), fim: em('15:00').toISOString(), motivo: 'Curso' }]

describe('ocupanteDoHorario (D5)', () => {
  it('60 min às 10:00 batem no das 10:30 (o início sozinho não basta)', () =>
    expect(ocupanteDoHorario(em('10:00'), 60, ocupados, bloqueios)).toEqual({ clientName: 'Rafaela' }))
  it('30 min às 10:00 cabem', () =>
    expect(ocupanteDoHorario(em('10:00'), 30, ocupados, bloqueios)).toBeNull())
  it('60 min às 13:30 batem no bloqueio', () =>
    expect(ocupanteDoHorario(em('13:30'), 60, ocupados, bloqueios)).toEqual({ clientName: null, rotulo: 'Bloqueado · Curso' }))
  it('às 15:00, livre', () =>
    expect(ocupanteDoHorario(em('15:00'), 60, ocupados, bloqueios)).toBeNull())
  it('encostar não é bater: 11:00 depois do das 10:30', () =>
    expect(ocupanteDoHorario(em('11:00'), 60, ocupados, bloqueios)).toBeNull())
})

describe('livresEntre (D15: o "Horário livre" da Minha agenda)', () => {
  const ms = (hhmm: string) => em(hhmm).getTime()
  it('o bloqueio parte o vão', () =>
    expect(livresEntre(ms('10:30'), ms('16:00'), bloqueios)).toEqual([[ms('10:30'), ms('14:00')], [ms('15:00'), ms('16:00')]]))
  it('o pedaço menor que 30 min some', () =>
    expect(livresEntre(ms('13:45'), ms('15:10'), bloqueios)).toEqual([]))
  it('sem bloqueio, o vão inteiro', () =>
    expect(livresEntre(ms('10:30'), ms('12:00'), [])).toEqual([[ms('10:30'), ms('12:00')]]))
})

describe('blocosDosBloqueios (D15: a ocupação desconta o bloqueado)', () => {
  const todoDia: Horario = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) } as Horario
  it('6 h bloqueadas saem das 24 h do dia', () => {
    const dia = new Date('2026-11-18T12:00:00-03:00')
    const blocos = blocosDosBloqueios([{ inicio: em('00:00').toISOString(), fim: em('06:00').toISOString(), motivo: 'x' }])
    expect(capacidadeEmMinutos(todoDia, [null], dia, dia, [blocos])).toBe(18 * 60)
  })
})
