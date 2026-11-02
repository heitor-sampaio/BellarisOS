import { describe, it, expect } from 'vitest'
import { limiteLegivel } from '@/components/shared/validacao-em-portugues'

// A26 da 5ª simulação: o horário no passado mostrava "O mínimo é 2026-11-01T10:40."
describe('limiteLegivel — o mínimo/máximo de data e hora como se lê', () => {
  it('data e hora, data, hora e número', () => {
    expect(limiteLegivel('datetime-local', '2026-11-01T10:40')).toBe('01/11/2026 às 10:40')
    expect(limiteLegivel('date', '2026-11-01')).toBe('01/11/2026')
    expect(limiteLegivel('time', '10:40')).toBe('10:40')
    expect(limiteLegivel('number', '0.5')).toBe('0,5')
  })
})
