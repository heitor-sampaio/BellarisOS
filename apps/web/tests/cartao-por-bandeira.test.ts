import { describe, it, expect } from 'vitest'
import { EntradaDoCartaoPorBandeira, bandeiraDoPagamento, lerCartaoPorBandeira, semBandeirasVazias } from '@/lib/financeiro/bandeiras'
import { lancamentosDoPagamento } from '@/lib/checkout/lancamentos'

/** r3-f13-01 (o Heitor, 2026-11-03: "Prazo por bandeira. Taxas também configuráveis por bandeira."). */
describe('o cartão por bandeira', () => {
  it('a bandeira só vale no cartão, e só uma das seis', () => {
    expect(bandeiraDoPagamento('CREDIT_CARD', 'ELO')).toBe('ELO')
    expect(bandeiraDoPagamento('DEBIT_CARD', 'VISA')).toBe('VISA')
    expect(bandeiraDoPagamento('PIX', 'ELO')).toBeNull()
    expect(bandeiraDoPagamento('CREDIT_CARD', 'XPTO')).toBeNull()
    expect(bandeiraDoPagamento('CREDIT_CARD', '')).toBeNull()
  })

  it('a venda leva a bandeira no que é PAGO agora no cartão — não na parcela a receber', () => {
    expect(lancamentosDoPagamento(1100, { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3, bandeira: 'ELO' }, 'Pacote')).toEqual([
      { amount: 1100, payment_method: 'CREDIT_CARD', is_paid: true, due_date: null, notes: null, cartao_vezes: 3, cartao_bandeira: 'ELO' },
    ])
    const parcelado = lancamentosDoPagamento(900, { forma: 'PARCELADO', metodo: 'DEBIT_CARD', entrada: 300, parcelas: 2, primeiroVencimento: '2026-12-10T15:00:00.000Z', bandeira: 'VISA' }, 'Pacote')
    expect(parcelado.map(l => [l.is_paid, l.cartao_bandeira ?? null])).toEqual([[true, 'VISA'], [false, null], [false, null]])
    expect(lancamentosDoPagamento(100, { forma: 'AVISTA', metodo: 'PIX', bandeira: 'ELO' }, 'X')[0]!.cartao_bandeira, 'no Pix, nada').toBeUndefined()
  })

  it('a configuração: só as seis bandeiras, prazo de 1 a 120, débito e crédito 1x–12x; a vazia sai', () => {
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } }).success).toBe(true)
    expect(EntradaDoCartaoPorBandeira.safeParse({ XPTO: { taxas: {} } }).success).toBe(false)
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { prazo: 0, taxas: {} } }).success).toBe(false)
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { taxas: { 'PIX:1': 1 } } }).success, 'Pix não tem bandeira').toBe(false)
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { taxas: { 'CREDIT_CARD:13': 1 } } }).success).toBe(false)
    expect(semBandeirasVazias({ ELO: { taxas: {} }, VISA: { prazo: 28, taxas: {} } })).toEqual({ VISA: { prazo: 28, taxas: {} } })
    expect(lerCartaoPorBandeira({ ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3, lixo: 1 } }, XPTO: {} })).toEqual({ ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } })
  })
})
