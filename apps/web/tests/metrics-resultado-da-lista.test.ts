import { describe, it, expect } from 'vitest'
import { resultadoDaLista } from '@/lib/metrics/resultado'

/**
 * J-48: o total da lista do financeiro (o que está filtrado na tela) é o pago
 * que entrou menos o pago que saiu — COM SINAL —, sem os dois lados do estorno
 * (a regra de metrics_core). A tela tirava o sinal com Math.abs.
 */
describe('resultadoDaLista', () => {
  const l = (type: 'INCOME' | 'EXPENSE', amount: number, extra: Partial<{ is_paid: boolean; notes: string | null; category: string }> = {}) =>
    ({ type, amount, is_paid: true, notes: null, category: 'Serviços', ...extra })

  it('negativo quando saiu mais do que entrou', () => {
    expect(resultadoDaLista([l('INCOME', 300), l('EXPENSE', 2700)])).toBe(-2400)
  })
  it('o em aberto não entra', () => {
    expect(resultadoDaLista([l('INCOME', 300), l('INCOME', 500, { is_paid: false })])).toBe(300)
  })
  it('o estorno sai dos dois lados', () => {
    expect(resultadoDaLista([
      l('INCOME', 300), l('INCOME', 200, { notes: 'Estornada' }), l('EXPENSE', 200, { category: 'Estorno' }),
    ])).toBe(300)
  })
  it('em centavos, sem resto de ponto flutuante', () => {
    expect(resultadoDaLista([l('INCOME', 0.1), l('INCOME', 0.2)])).toBe(0.3)
  })
})
