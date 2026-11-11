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
  // D9 da 12ª: "13 lançamentos · caixa da lista R$ 3.383,64" ao lado da receita de
  // R$ 3.203,64 — os R$ 180 pagos com crédito na clínica não são caixa.
  it('D9: o uso do crédito na clínica não é caixa', () => {
    expect(resultadoDaLista([l('INCOME', 300), { ...l('INCOME', 180), payment_method: 'INTERNAL_CREDIT' }])).toBe(300)
  })
  // F59 (D2): com o que o banco diz de cada um (`no_caixa`), a lista soma isso —
  // o pagamento pelo que entrou, no dia dele, e o estorno de outro dia, negativo.
  it('D2: com o caixa de cada lançamento, soma o caixa (nulo não conta)', () => {
    expect(resultadoDaLista([
      { ...l('INCOME', 163.64), no_caixa: 300 },
      { ...l('EXPENSE', 136.36, { category: 'Estorno' }), no_caixa: -136.36 },
      { ...l('INCOME', 180), payment_method: 'INTERNAL_CREDIT', no_caixa: null },
    ])).toBe(163.64)
  })
})
