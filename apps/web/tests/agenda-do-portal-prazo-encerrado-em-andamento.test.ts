import { describe, it, expect } from 'vitest'
import { separarAgendaDoPortal, prazoDoAppEncerrado } from '@/lib/clientes/agenda-do-portal'

// Decisão do Claude, 25/11 (princípio 3): o "Prazo do app encerrado" vale para
// TODO em andamento, inclusive o que começou ontem. Depois do início o prazo
// já passou, e o mesmo cartão não diz coisas diferentes conforme o dia em que
// começou. É a condição da A53, estendida.
describe('o "Prazo do app encerrado" (A53) vale para todo em andamento', () => {
  const agora = new Date('2026-11-25T15:00:00-03:00')
  const a = (status: string, quando: string, duration_min: number | null = 60) =>
    ({ status, scheduled_at: quando, duration_min })

  it('o em andamento que começou ontem diz o prazo encerrado', () => {
    expect(prazoDoAppEncerrado(a('CONFIRMED', '2026-11-24T14:00:00-03:00', 30 * 60), 24, agora)).toBe(true)
  })
  it('o em andamento que começou hoje, como antes', () => {
    expect(prazoDoAppEncerrado(a('SCHEDULED', '2026-11-25T14:30:00-03:00'), 24, agora)).toBe(true)
  })
  it('o de hoje ainda por vir, já dentro do prazo, como antes (A53)', () => {
    expect(prazoDoAppEncerrado(a('SCHEDULED', '2026-11-25T18:00:00-03:00'), 24, agora)).toBe(true)
  })
  it('não diz: dentro do prazo, o horário que já acabou (A46), nem quem já chegou', () => {
    expect(prazoDoAppEncerrado(a('SCHEDULED', '2026-11-27T10:00:00-03:00'), 24, agora), 'dentro do prazo').toBe(false)
    expect(prazoDoAppEncerrado(a('SCHEDULED', '2026-11-25T10:00:00-03:00'), 24, agora), 'o horário passou').toBe(false)
    expect(prazoDoAppEncerrado(a('ARRIVED', '2026-11-25T14:30:00-03:00'), 24, agora), 'chegou').toBe(false)
    expect(prazoDoAppEncerrado(a('IN_PROGRESS', '2026-11-24T14:00:00-03:00', 30 * 60), 24, agora), 'em atendimento').toBe(false)
  })
})

// O Heitor, 25/11: "O que acabou sem ser fechado segue a regra de hoje". A
// regra de hoje é a D14, pelo dia do INÍCIO: o que começou ontem e acabou sem
// ser fechado vai ao Histórico, mesmo que tenha acabado hoje.
describe('o que começou ontem e acabou hoje sem ser fechado vai ao Histórico (D14)', () => {
  const agora = new Date('2026-11-25T15:00:00-03:00')
  const a = (id: string, status: string, quando: string, duration_min: number | null = 60) =>
    ({ id, status, scheduled_at: quando, duration_min })

  it('o de 30 horas que começou ontem e acabou hoje de manhã', () => {
    const longo = a('longo', 'CONFIRMED', '2026-11-24T02:00:00-03:00', 30 * 60) // acabou hoje às 08:00
    expect(separarAgendaDoPortal([longo], agora).historico.map(x => x.id)).toEqual(['longo'])
  })
  it('o "Na clínica" de ontem 23:30 que acabou hoje 00:30', () => {
    const chegou = a('chegou', 'ARRIVED', '2026-11-24T23:30:00-03:00')
    expect(separarAgendaDoPortal([chegou], agora).historico.map(x => x.id)).toEqual(['chegou'])
  })
})
