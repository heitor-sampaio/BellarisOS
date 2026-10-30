import { describe, it, expect } from 'vitest'
import { separarAgendaDoPortal } from '@/lib/clientes/agenda-do-portal'

// D14 da simulação de 2026-10-29: a Agenda do portal mostrava em "Próximos" a
// avaliação de 28/10 23:50, "Na clínica", depois da meia-noite — e a home, ao
// lado, dizia "Nenhum agendamento próximo". A Agenda filtrava só o status; a
// home, o status e o horário. A regra é uma: a da home.
describe('a agenda do portal da cliente', () => {
  const agora = new Date('2026-10-29T00:20:00-03:00')
  const a = (id: string, status: string, quando: string) => ({ id, status, scheduled_at: quando })
  const lista = [
    a('passou-na-clinica', 'ARRIVED', '2026-10-28T23:50:00-03:00'),
    a('passou-em-atendimento', 'IN_PROGRESS', '2026-10-27T10:00:00-03:00'),
    a('passou-agendado', 'SCHEDULED', '2026-10-20T10:00:00-03:00'),
    a('amanha', 'CONFIRMED', '2026-10-29T10:00:00-03:00'),
    a('depois', 'SCHEDULED', '2026-11-03T10:00:00-03:00'),
    a('concluido', 'COMPLETED', '2026-10-21T10:00:00-03:00'),
    a('cancelado-futuro', 'CANCELLED', '2026-11-05T10:00:00-03:00'),
  ]

  it('"Próximos" é o que ainda vai acontecer, em aberto, do mais perto ao mais longe', () => {
    expect(separarAgendaDoPortal(lista, agora).proximos.map(x => x.id)).toEqual(['amanha', 'depois'])
  })
  it('o que já passou vai ao histórico, mesmo sem ter sido fechado — nada some', () => {
    const { proximos, historico } = separarAgendaDoPortal(lista, agora)
    expect(historico.map(x => x.id).sort()).toEqual(
      ['cancelado-futuro', 'concluido', 'passou-agendado', 'passou-em-atendimento', 'passou-na-clinica'].sort())
    expect(proximos.length + historico.length).toBe(lista.length)
  })
})

// J-61 das simulações: o prazo aparecia genérico ("até 24 horas antes"), sem
// o dia e a hora em que ele acaba. A data é a de Brasília.
describe('o prazo para alterar pelo app, em dia e hora', () => {
  it('24 horas antes de quarta 04/11 às 10:00 é terça 03/11 às 10:00', async () => {
    const { limiteParaAlterar } = await import('@/lib/clientes/agenda-do-portal')
    expect(limiteParaAlterar('2026-11-04T13:00:00Z', 24)).toBe('ter, 03/11 às 10:00')
  })
  it('atravessa o dia em Brasília (o servidor roda em UTC)', async () => {
    const { limiteParaAlterar } = await import('@/lib/clientes/agenda-do-portal')
    // 02/11 01:30 em Brasília, 6 horas antes = 01/11 19:30 (domingo).
    expect(limiteParaAlterar('2026-11-02T04:30:00Z', 6)).toBe('dom, 01/11 às 19:30')
  })
})
