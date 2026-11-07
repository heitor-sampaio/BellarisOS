import { describe, it, expect } from 'vitest'
import { lotesDaBaixa, textoDosLotesDaBaixa } from '@/lib/estoque/fefo'

describe('A11: de qual lote sai o insumo (a conta do FEFO, como o gatilho do lote)', () => {
  const hoje = new Date('2026-11-07T15:00:00.000Z')
  const lotes = [
    { id: 'b2', numero: 'TOX-B2', validade: '2027-03-01T00:00:00+00:00', recebidoEm: '2026-10-01T00:00:00Z', quantidade: 1 },
    { id: 'a1', numero: 'TOX-A1', validade: '2026-11-26T00:00:00+00:00', recebidoEm: '2026-09-01T00:00:00Z', quantidade: 0.44 },
    { id: 'v0', numero: 'VENCIDO', validade: '2026-10-01T00:00:00+00:00', recebidoEm: '2026-08-01T00:00:00Z', quantidade: 1 },
  ]
  it('o que vence primeiro (e não venceu) sai primeiro, e passa ao seguinte no meio da dose', () => {
    expect(lotesDaBaixa(lotes, 50, 100, hoje)).toEqual([
      { id: 'a1', numero: 'TOX-A1', validade: '2026-11-26T00:00:00+00:00', quantidade: 44 },
      { id: 'b2', numero: 'TOX-B2', validade: '2027-03-01T00:00:00+00:00', quantidade: 6 },
    ])
    expect(textoDosLotesDaBaixa(lotesDaBaixa(lotes, 50, 100, hoje), 'U', 50)).toBe(
      'Sai do lote TOX-A1 (vence 26/11/2026): 44 U; e do lote TOX-B2 (vence 01/03/2027): 6 U')
  })
  it('a dose que cabe num lote só diz só ele', () =>
    expect(textoDosLotesDaBaixa(lotesDaBaixa(lotes, 20, 100, hoje), 'U', 20)).toBe('Sai do lote TOX-A1 (vence 26/11/2026)'))
  it('o vencido só depois dos válidos', () =>
    expect(lotesDaBaixa(lotes, 200, 100, hoje).map(l => [l.id, l.quantidade])).toEqual([['a1', 44], ['b2', 100], ['v0', 56]]))
  it('sem lote para tudo: diz o que fica sem lote', () =>
    expect(textoDosLotesDaBaixa(lotesDaBaixa(lotes.slice(1, 2), 50, 100, hoje), 'U', 50)).toBe(
      'Sai do lote TOX-A1 (vence 26/11/2026): 44 U; 6 U sem lote'))
  it('sem lote nenhum: nada a dizer', () => expect(textoDosLotesDaBaixa([], 'U', 20)).toBeNull())
  it('concluído: o que saiu, no passado', () =>
    expect(textoDosLotesDaBaixa([{ id: 'a1', numero: 'TOX-A1', validade: '2026-11-26T00:00:00+00:00', quantidade: 20 }], 'U', 20, true)).toBe('Saiu do lote TOX-A1 (vence 26/11/2026)'))
})
