import { describe, it, expect } from 'vitest'
import { trechoDoBloqueio, avisoDoBloqueioDaSala } from '@/lib/agenda/bloqueio'

// A17 da 9ª simulação: o bloqueio "Dia inteiro" dizia "das 00:00 às 24:00".
const b = (inicio: string, fim: string, motivo = 'Folga') => ({
  inicio: new Date(`${inicio}-03:00`).toISOString(), fim: new Date(`${fim}-03:00`).toISOString(), motivo,
})

describe('o bloqueio do dia inteiro', () => {
  it('um dia: "o dia 10/11 inteiro"', () => {
    expect(trechoDoBloqueio(b('2026-11-10T00:00:00', '2026-11-11T00:00:00'))).toBe('o dia 10/11 inteiro')
    expect(avisoDoBloqueioDaSala('Sala Rosa', b('2026-11-10T00:00:00', '2026-11-11T00:00:00', 'Manutenção')))
      .toBe('Sala Rosa está bloqueada o dia 10/11 inteiro (Manutenção). O encaixe é permitido.')
  })
  it('vários dias inteiros: "de 10/11 a 12/11, os dias inteiros"', () => {
    expect(trechoDoBloqueio(b('2026-11-10T00:00:00', '2026-11-13T00:00:00'))).toBe('de 10/11 a 12/11, os dias inteiros')
  })
  it('o resto como antes', () => {
    expect(trechoDoBloqueio(b('2026-11-10T08:00:00', '2026-11-11T00:00:00'))).toBe('das 08:00 às 24:00')
    expect(trechoDoBloqueio(b('2026-11-10T12:00:00', '2026-11-10T13:00:00'))).toBe('das 12:00 às 13:00')
  })
})
