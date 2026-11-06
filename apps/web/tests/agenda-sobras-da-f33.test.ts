import { describe, it, expect } from 'vitest'
import { unidadeInicial } from '@/lib/unidades/unidade-inicial'
import { agruparPorDia } from '@/lib/inbox/dias-da-conversa'

// As sobras da F33 (8ª simulação, 2026-11-06), fora da área dela: o agendar do
// CRM e o estoque inicial do produto nasciam na primeira unidade (princípio 3:
// nada escolhido que a pessoa não escolheu), e os separadores de dia do inbox
// agrupavam pelo dia em UTC.
describe('unidadeInicial', () => {
  it('com uma unidade só, ela; com duas ou mais, nenhuma', () => {
    expect(unidadeInicial([{ id: 'a' }])).toBe('a')
    expect(unidadeInicial([{ id: 'a' }, { id: 'b' }])).toBe('')
    expect(unidadeInicial([])).toBe('')
  })
  it('a unidade fixa de quem agenda vence', () => {
    expect(unidadeInicial([{ id: 'a' }, { id: 'b' }], 'b')).toBe('b')
    expect(unidadeInicial([{ id: 'a' }, { id: 'b' }], 'z'), 'a fixa que não está na lista não vale').toBe('')
  })
})

describe('agruparPorDia', () => {
  it('agrupa as mensagens pelo dia de Brasília, não pelo de UTC', () => {
    const msgs = [
      { id: '1', created_at: '2026-11-05T23:10:00.000Z' }, // 20:10 de 05/11
      { id: '2', created_at: '2026-11-06T02:30:00.000Z' }, // 23:30 de 05/11
      { id: '3', created_at: '2026-11-06T03:05:00.000Z' }, // 00:05 de 06/11
    ]
    const grupos = agruparPorDia(msgs)
    expect(grupos.map(g => [g.date, g.msgs.map(m => m.id)])).toEqual([
      ['2026-11-05', ['1', '2']],
      ['2026-11-06', ['3']],
    ])
  })
})
