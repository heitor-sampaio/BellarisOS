import { describe, it, expect } from 'vitest'
import { EntradaDoCartaoPorBandeira, bandeiraDoPagamento, lerCartaoPorBandeira, semBandeirasVazias, taxaDoCreditoNaBandeira, creditoPelaTaxaPorParcela } from '@/lib/financeiro/bandeiras'
import { lancamentosDoPagamento } from '@/lib/checkout/lancamentos'
import { EntradaDasTaxas } from '@/lib/comissoes/config'

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

  // F16-3 (o Heitor: "não é pra recusar nada, juros podem passar facilmente de
  // 100% no acumulado"): nenhum teto nas taxas — só não negativo.
  it('as taxas não têm teto (acima de 100% passa), só não são negativas', () => {
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { taxas: { 'CREDIT_CARD:12': 150 } } }).success, 'a bandeira com 150%').toBe(true)
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { taxas: { 'CREDIT_CARD:12': -1 } } }).success, 'negativa, não').toBe(false)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'CREDIT_CARD', parcelas: 12, taxa_pct: 120 }]).success, 'a regra geral com 120%').toBe(true)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'PIX', parcelas: 1, taxa_pct: -0.5 }]).success, 'negativa, não').toBe(false)
    expect(creditoPelaTaxaPorParcela(10).at(-1), 'a taxa por parcela de 10%: o 12x com 120%').toEqual({ parcelas: 12, taxa: 120 })
  })

  // r4-f15-01 (o Heitor, revisão das decisões da F15): o campo vazio da bandeira
  // é a regra geral DAQUELAS vezes — sem herdar a faixa de outras vezes da bandeira.
  it('a taxa do crédito na bandeira: a das vezes exatas dela, senão a regra geral daquelas vezes', () => {
    const geral = [{ parcelas: 3, taxa_pct: 4.5 }, { parcelas: 5, taxa_pct: 6 }]
    const elo = { taxas: { 'CREDIT_CARD:3': 3 } }
    expect(taxaDoCreditoNaBandeira(geral, elo, 3), 'a Elo em 3x: a dela').toEqual({ cadastrada: true, daBandeira: true, parcelas: 3, taxa: 3 })
    expect(taxaDoCreditoNaBandeira(geral, elo, 5), 'a Elo em 5x: a geral de 5x, não os 3% da Elo').toEqual({ cadastrada: true, daBandeira: false, parcelas: 5, taxa: 6 })
    expect(taxaDoCreditoNaBandeira(geral, elo, 4), 'a Elo em 4x: nem a Elo nem a geral têm o 4x — 0% (F16-2: nunca a de outras vezes)').toEqual({ cadastrada: false, daBandeira: false, parcelas: null, taxa: 0 })
    expect(taxaDoCreditoNaBandeira(geral, elo, 2), 'a Elo em 2x: a geral, que não tem').toEqual({ cadastrada: false, daBandeira: false, parcelas: null, taxa: 0 })
    expect(taxaDoCreditoNaBandeira(geral, undefined, 5), 'sem bandeira: a geral').toEqual({ cadastrada: true, daBandeira: false, parcelas: 5, taxa: 6 })
  })

  // r4-f15-01, o botão (o Heitor: "a taxa é por parcela, por exemplo 1.15% por
  // parcela, então a taxa total é a taxa vezes a quantidade de parcelas").
  it('preencher pela taxa por parcela: 1x a 12x = a taxa × as vezes, em duas casas', () => {
    expect(creditoPelaTaxaPorParcela(1.15).map(x => [x.parcelas, x.taxa])).toEqual([
      [1, 1.15], [2, 2.3], [3, 3.45], [4, 4.6], [5, 5.75], [6, 6.9], [7, 8.05], [8, 9.2], [9, 10.35], [10, 11.5], [11, 12.65], [12, 13.8],
    ])
    expect(creditoPelaTaxaPorParcela(0.333).map(x => x.taxa).slice(0, 3), 'arredonda em duas casas').toEqual([0.33, 0.67, 1])
  })
})
