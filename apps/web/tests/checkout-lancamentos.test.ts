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
  it('a receber SEM data: um lançamento em aberto, sem vencimento', () => {
    const [l] = lancamentosDoPagamento(300, { forma: 'A_RECEBER', metodo: 'PIX', vencimento: null }, 'Pacote')
    expect(l).toMatchObject({ amount: 300, is_paid: false, due_date: null })
    expect(EntradaDoPagamento.safeParse({ forma: 'A_RECEBER', metodo: null, vencimento: null }).success).toBe(true)
  })
  it('entrada + parcelas: a entrada paga e CADA parcela um lançamento, no seu mês', () => {
    const ls = lancamentosDoPagamento(1000, {
      forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 100, parcelas: 3, primeiroVencimento: '2026-10-10T15:00:00.000Z',
    }, 'Pacote')
    expect(ls.map(l => [l.amount, l.is_paid, l.due_date?.slice(0, 10) ?? null, l.sufixo])).toEqual([
      [100, true, null, 'entrada'],
      [300, false, '2026-10-10', 'parcela 1/3'],
      [300, false, '2026-11-10', 'parcela 2/3'],
      [300, false, '2026-12-10', 'parcela 3/3'],
    ])
    expect(soma(ls)).toBe(1000)
    const grupos = new Set(ls.slice(1).map(l => l.parcela_grupo))
    expect(grupos.size, 'as parcelas do mesmo parcelamento têm o mesmo grupo').toBe(1)
    expect(ls[0]!.parcela_grupo, 'a entrada não é parcela').toBeUndefined()
  })
  it('a última parcela leva o arredondamento', () => {
    const ls = lancamentosDoPagamento(100, { forma: 'PARCELADO', metodo: 'PIX', entrada: 0, parcelas: 3, primeiroVencimento: '2026-10-10T15:00:00.000Z' }, 'X')
    expect(ls.map(p => p.amount)).toEqual([33.33, 33.33, 33.34])
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
