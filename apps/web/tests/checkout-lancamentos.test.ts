import { describe, it, expect } from 'vitest'
import { lancamentosDoPagamento, EntradaDoPagamento } from '@/lib/checkout/lancamentos'

const soma = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100

describe('lançamentos de uma venda', () => {
  it('à vista: um lançamento pago', () => {
    expect(lancamentosDoPagamento(300, { forma: 'AVISTA', metodo: 'PIX' }, 'Pacote')).toEqual([
      { amount: 300, payment_method: 'PIX', is_paid: true, due_date: null, notes: null },
    ])
  })
  it('a receber: um lançamento em aberto, com vencimento', () => {
    const [l] = lancamentosDoPagamento(300, { forma: 'A_RECEBER', metodo: null, vencimento: '2026-10-10T15:00:00.000Z' }, 'Pacote')
    expect(l).toMatchObject({ amount: 300, is_paid: false, due_date: '2026-10-10T15:00:00.000Z' })
  })
  it('entrada + parcelas: a entrada paga, o saldo em aberto, parcelas que fecham a soma', () => {
    const ls = lancamentosDoPagamento(1000, {
      forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 100, parcelas: 3, primeiroVencimento: '2026-10-10T15:00:00.000Z',
    }, 'Pacote')
    expect(ls.map(l => [l.amount, l.is_paid])).toEqual([[100, true], [900, false]])
    expect(soma(ls)).toBe(1000)
    expect(ls[1]!.parcelas!.map(p => [p.amount, p.due_date.slice(0, 10)])).toEqual([
      [300, '2026-10-10'], [300, '2026-11-10'], [300, '2026-12-10'],
    ])
  })
  it('a última parcela leva o arredondamento', () => {
    const [l] = lancamentosDoPagamento(100, { forma: 'PARCELADO', metodo: 'PIX', entrada: 0, parcelas: 3, primeiroVencimento: '2026-10-10T15:00:00.000Z' }, 'X')
    expect(l!.parcelas!.map(p => p.amount)).toEqual([33.33, 33.33, 33.34])
  })
  it('entrada maior que o preço vira à vista', () => {
    const ls = lancamentosDoPagamento(200, { forma: 'PARCELADO', metodo: 'PIX', entrada: 500, parcelas: 2, primeiroVencimento: '2026-10-10T15:00:00.000Z' }, 'X')
    expect(ls.map(l => [l.amount, l.is_paid])).toEqual([[200, true]])
  })
  it('a entrada do navegador é conferida', () => {
    expect(EntradaDoPagamento.safeParse({ forma: 'AVISTA', metodo: 'BITCOIN' }).success).toBe(false)
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: 'PIX', entrada: -1, parcelas: 2, primeiroVencimento: '2026-10-10' }).success).toBe(false)
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: 'PIX', entrada: 0, parcelas: 13, primeiroVencimento: '2026-10-10' }).success).toBe(false)
    expect(EntradaDoPagamento.safeParse({ forma: 'A_RECEBER', metodo: null, vencimento: 'amanhã' }).success).toBe(false)
    expect(EntradaDoPagamento.safeParse({ forma: 'A_RECEBER', metodo: null, vencimento: '2026-10-10T15:00:00.000Z' }).success).toBe(true)
  })
})
