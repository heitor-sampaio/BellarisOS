import { describe, it, expect } from 'vitest'
import { ordenarTransacoesDaFicha } from '../lib/clientes/ordem-das-transacoes'

// D7 da 10ª simulação: as Transações da ficha em ordem pela data que a linha mostra.
describe('a ordem das Transações da ficha', () => {
  const criado = '2026-11-10T05:00:00.000Z'
  const linha = (id: string, extra: Partial<Parameters<typeof ordenarTransacoesDaFicha>[0][number]>) =>
    ({ id, isPaid: false, dueDate: null, scheduledAt: null, createdAt: criado, ...extra })

  it('as parcelas gravadas juntas saem pelo vencimento, e a entrada paga pelo dia dela', () => {
    const r = ordenarTransacoesDaFicha([
      linha('p3', { dueDate: '2027-02-08T15:00:00Z', parcela: 3 }),
      linha('p1', { dueDate: '2026-12-10T15:00:00Z', parcela: 1 }),
      linha('entrada', { isPaid: true }),
      linha('p2', { dueDate: '2027-01-09T15:00:00Z', parcela: 2 }),
    ])
    expect(r.map(l => l.id)).toEqual(['p3', 'p2', 'p1', 'entrada'])
  })
  it('a paga com vencimento vale pelo atendimento ou pelo lançamento (é o que a linha mostra)', () => {
    const r = ordenarTransacoesDaFicha([
      linha('paga', { isPaid: true, dueDate: '2027-01-01T00:00:00Z', createdAt: '2026-10-01T00:00:00Z' }),
      linha('atendimento', { isPaid: true, scheduledAt: '2026-11-01T13:00:00Z' }),
    ])
    expect(r.map(l => l.id)).toEqual(['atendimento', 'paga'])
  })
  it('no empate de data, a parcela maior primeiro', () => {
    const r = ordenarTransacoesDaFicha([
      linha('a', { dueDate: '2026-12-10T15:00:00Z', parcela: 1 }),
      linha('b', { dueDate: '2026-12-10T15:00:00Z', parcela: 2 }),
    ])
    expect(r.map(l => l.id)).toEqual(['b', 'a'])
  })
})
