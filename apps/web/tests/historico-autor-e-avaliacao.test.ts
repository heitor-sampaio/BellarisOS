import { describe, it, expect } from 'vitest'
import { comAutores, eventoDaAvaliacao, rotuloDaAcao } from '@/lib/clients/historico-do-agendamento'

/** J-26 e J-27 (2026-10-30): a avaliação e quem fez cada ação, na linha do tempo da ficha. */
const ID = '11111111-2222-3333-4444-555555555555'
const ev = (type: string) => ({ type, link: `/centro/agenda/${ID}`, autor: null as string | null })

describe('comAutores', () => {
  it('cada evento ganha o nome de quem fez a ação dele — o da última vez', () => {
    const [agendou, cancelou] = comAutores([ev('APPOINTMENT_SCHEDULED'), ev('APPOINTMENT_CANCELLED')], [
      { appointment_id: ID, action: 'CREATED', changed_by_name: 'Ana', created_at: '2026-10-01T10:00:00Z' },
      { appointment_id: ID, action: 'CANCELLED', changed_by_name: 'Bia', created_at: '2026-10-02T10:00:00Z' },
      { appointment_id: ID, action: 'CANCELLED', changed_by_name: 'Carla (via suporte)', created_at: '2026-10-03T10:00:00Z' },
    ])
    expect(agendou!.autor).toBe('Ana')
    expect(cancelou!.autor).toBe('Carla (via suporte)')
  })
  it('a chegada é o CHECKIN; evento sem agendamento fica como está', () => {
    const [chegou, pagou] = comAutores([ev('APPOINTMENT_ARRIVED'), { type: 'PAYMENT', link: null, autor: null }], [
      { appointment_id: ID, action: 'CHECKIN', changed_by_name: 'Ana', created_at: '2026-10-01T10:00:00Z' },
    ])
    expect(chegou!.autor).toBe('Ana')
    expect(pagou!.autor).toBeNull()
  })
})

describe('eventoDaAvaliacao', () => {
  it('as notas e o comentário viram um evento', () => {
    expect(eventoDaAvaliacao({ id: ID, procedureName: 'Limpeza', client_confirmed_at: '2026-10-01T12:00:00Z',
      procedure_rating: 5, client_rating: 4, client_feedback: ' Adorei ' }, null)).toMatchObject({
      type: 'APPOINTMENT_RATED', title: 'Avaliou: Limpeza', subtitle: 'Procedimento 5/5 · Profissional 4/5 · “Adorei”',
    })
  })
  it('sem confirmação, ou confirmado sem nota nem comentário, não há evento', () => {
    expect(eventoDaAvaliacao({ id: ID, procedureName: 'Limpeza', client_confirmed_at: null, procedure_rating: 5 }, null)).toBeNull()
    expect(eventoDaAvaliacao({ id: ID, procedureName: 'Limpeza', client_confirmed_at: '2026-10-01T12:00:00Z' }, null)).toBeNull()
  })
})

describe('rotuloDaAcao', () => {
  it('nomeia as ações; a desconhecida usa a descrição', () => {
    expect(rotuloDaAcao('CREATED', null)).toBe('Agendado')
    expect(rotuloDaAcao('XYZ', 'Algo')).toBe('Algo')
  })
})
