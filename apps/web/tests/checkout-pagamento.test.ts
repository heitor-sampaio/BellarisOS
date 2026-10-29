import { describe, it, expect } from 'vitest'
import {
  valoresDoPagamento, pagamentoNormalizado, pagamentoDoRetrato, mesmoPagamento, rotuloDoPagamento,
  type PagamentoDoPlano,
} from '@/lib/checkout/pagamento'

const venc = new Date('2026-10-10T12:00:00-03:00').toISOString()
const parcelado: PagamentoDoPlano = { forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 100, parcelas: 3, primeiroVencimento: venc }

describe('o pagamento no contrato', () => {
  it('a frase inteira de cada forma', () => {
    expect(valoresDoPagamento(null, 400)['pagamento.forma']).toMatch(/R\$\s400,00, a receber no atendimento/)
    expect(valoresDoPagamento({ forma: 'AVISTA', metodo: 'PIX' }, 400)['pagamento.forma']).toMatch(/R\$\s400,00 à vista, no Pix/)
    expect(valoresDoPagamento(parcelado, 400)['pagamento.forma'])
      .toMatch(/^entrada de R\$\s100,00 \+ 3 parcelas de R\$\s100,00 no cartão de crédito, a primeira em 10\/10\/2026$/)
    expect(valoresDoPagamento({ forma: 'A_RECEBER', metodo: null, vencimento: venc }, 400)['pagamento.forma'])
      .toMatch(/a receber em 10\/10\/2026$/)
  })

  it('a receber SEM data (o vencimento é opcional): a frase sem dia, e o retrato ida e volta', () => {
    const semData: PagamentoDoPlano = { forma: 'A_RECEBER', metodo: 'PIX', vencimento: null }
    const v = valoresDoPagamento(semData, 400)
    expect(v['pagamento.forma']).toMatch(/^R\$\s400,00 a receber, no Pix$/)
    expect(v['pagamento.primeiro_vencimento']).toBeNull()
    const retrato = pagamentoNormalizado(semData)
    expect(retrato).toEqual({ forma: 'A_RECEBER', metodo: 'PIX', vencimento: null })
    expect(pagamentoDoRetrato(retrato)).toEqual(semData)
  })

  it('as peças: sem entrada, a entrada fica vazia (é opcional)', () => {
    const v = valoresDoPagamento({ ...parcelado, entrada: 0 }, 400)
    expect(v['pagamento.entrada']).toBeNull()
    expect(v['pagamento.parcelas']).toBe('3')
    expect(v['pagamento.valor_parcela']).toMatch(/133,33/)
  })

  // D18 (simulação de 2026-10-29): a linha do tempo dizia "3x em CREDIT_CARD".
  // A forma vai com o nome da tela (rotuloDaForma).
  it('a linha do tempo diz a forma em português, como a tela', () => {
    expect(rotuloDoPagamento(parcelado)).toBe('entrada de R$ 100,00 + 3x em Crédito')
    expect(rotuloDoPagamento({ forma: 'AVISTA', metodo: 'PIX' })).toBe('Pix à vista')
    expect(rotuloDoPagamento({ forma: 'AVISTA', metodo: 'CASH' })).toBe('Dinheiro à vista')
  })
})

describe('o retrato do pagamento', () => {
  it('é estável: o horário não conta, a ordem das chaves não conta', () => {
    const outraHora = { ...parcelado, primeiroVencimento: new Date('2026-10-10T15:30:00-03:00').toISOString() }
    expect(mesmoPagamento(pagamentoNormalizado(parcelado), pagamentoNormalizado(outraHora))).toBe(true)
    const invertido = Object.fromEntries(Object.entries(pagamentoNormalizado(parcelado)).reverse())
    expect(mesmoPagamento(invertido, pagamentoNormalizado(parcelado))).toBe(true)
  })

  it('pagamento diferente não passa por igual', () => {
    expect(mesmoPagamento(pagamentoNormalizado(parcelado), pagamentoNormalizado({ ...parcelado, parcelas: 4 }))).toBe(false)
    expect(mesmoPagamento(pagamentoNormalizado(null), pagamentoNormalizado({ forma: 'AVISTA', metodo: 'PIX' }))).toBe(false)
    expect(mesmoPagamento(null, pagamentoNormalizado(null))).toBe(false)
  })

  it('volta ao pagamento sem trocar o dia no fuso da clínica', () => {
    const de = pagamentoDoRetrato(pagamentoNormalizado(parcelado))
    expect(valoresDoPagamento(de, 400)['pagamento.primeiro_vencimento']).toBe('10/10/2026')
    expect(pagamentoDoRetrato({ forma: 'NADA_AGORA' })).toBeNull()
  })
})

describe('cartão de crédito em N vezes (2026-10-20)', () => {
  // A maquininha paga a clínica: para o cliente, é pago na hora. Até aqui o
  // único jeito de dizer "3x no cartão" era "entrada + parcelas", que grava
  // cada parcela A RECEBER — e o check-in oferecia cobrar de novo.
  const tresVezes: PagamentoDoPlano = { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 }

  it('a frase do contrato diz em quantas vezes', () => {
    expect(valoresDoPagamento(tresVezes, 600)['pagamento.forma']).toMatch(/^R\$\s600,00 no cartão de crédito em 3x$/)
    expect(valoresDoPagamento(tresVezes, 600)['pagamento.parcelas']).toBe('3')
    expect(rotuloDoPagamento(tresVezes)).toBe('Crédito 3x')
  })

  it('1x é o à vista de sempre, e o retrato de antes não muda', () => {
    expect(pagamentoNormalizado({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 1 }))
      .toEqual(pagamentoNormalizado({ forma: 'AVISTA', metodo: 'CREDIT_CARD' }))
    expect(pagamentoNormalizado({ forma: 'AVISTA', metodo: 'PIX' })).toEqual({ forma: 'AVISTA', metodo: 'PIX' })
  })

  it('o retrato guarda as vezes e volta igual', () => {
    const retrato = pagamentoNormalizado(tresVezes)
    expect(retrato).toEqual({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 })
    expect(pagamentoDoRetrato(retrato)).toEqual(tresVezes)
    expect(mesmoPagamento(retrato, pagamentoNormalizado({ ...tresVezes, vezes: 4 }))).toBe(false)
  })
})
