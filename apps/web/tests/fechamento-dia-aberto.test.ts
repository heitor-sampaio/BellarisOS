import { describe, it, expect } from 'vitest'
import { diaAindaAberto } from '@/lib/financeiro/fechamento'

// 2026-11-03 é terça (2). 14:48 UTC = 11:48 em Brasília.
const agora = new Date('2026-11-03T14:48:00.000Z')
const ate22 = { dias: { 2: [{ de: '08:00', ate: '12:00' }, { de: '13:00', ate: '22:00' }] } }

describe('diaAindaAberto (A50)', () => {
  it('hoje, antes do último horário: até quando atende', () => expect(diaAindaAberto('2026-11-03', ate22, agora)).toBe('22:00'))
  it('depois do horário, não', () => expect(diaAindaAberto('2026-11-03', ate22, new Date('2026-11-04T01:30:00.000Z'))).toBeNull())
  it('outro dia, não', () => expect(diaAindaAberto('2026-11-02', ate22, agora)).toBeNull())
  it('dia fechado, não', () => expect(diaAindaAberto('2026-11-03', { dias: { 2: [] } }, agora)).toBeNull())
  it('sem horário cadastrado: o padrão (08–20)', () => expect(diaAindaAberto('2026-11-03', null, agora)).toBe('20:00'))
})
