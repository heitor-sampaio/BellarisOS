import { describe, it, expect } from 'vitest'
import { lancamentosDoPagamento, EntradaDoPagamento } from '@/lib/checkout/lancamentos'
import {
  valoresDoPagamento, rotuloDoPagamento, frasesDoPagamento, vezesNoCartao, pagamentoNormalizado, pagamentoDoRetrato,
  type PagamentoDoPlano,
} from '@/lib/checkout/pagamento'

/**
 * D5 e D6 da 6ª simulação (F20).
 *
 * D5: a ENTRADA do "Entrada + parcelas" no cartão de crédito tem "Vezes no
 * cartão", como o à vista — a entrada de R$ 1.000 no Elo saía 1x, sem a taxa
 * do 3x nem o recebível da operadora.
 *
 * D6: o crediário da clínica NÃO é cartão. As parcelas do saldo, que a cliente
 * paga à CLÍNICA, nasciam com o meio da entrada (`CREDIT_CARD`), e o contrato
 * dizia "2 parcelas de R$ 1.700,00 no cartão de crédito". Elas nascem SEM
 * meio (o meio se escolhe ao receber), e o texto diz "com a clínica".
 */
const venc = new Date('2026-12-04T12:00:00-03:00').toISOString()
const dap: PagamentoDoPlano = {
  forma: 'PARCELADO', metodo: 'CREDIT_CARD', vezes: 3, entrada: 1000, parcelas: 2, primeiroVencimento: venc, bandeira: 'ELO',
}

describe('D5: as vezes no cartão da entrada', () => {
  it('a entrada no crédito em 3x é UM lançamento pago, com as vezes e a bandeira', () => {
    const [entrada] = lancamentosDoPagamento(4400, dap, 'Plano')
    expect(entrada).toMatchObject({ amount: 1000, payment_method: 'CREDIT_CARD', is_paid: true, cartao_vezes: 3, cartao_bandeira: 'ELO' })
  })
  it('as vezes da entrada valem para o limite da clínica (vezesNoCartao)', () => {
    expect(vezesNoCartao(dap)).toBe(3)
    expect(vezesNoCartao({ ...dap, entrada: 0 }), 'sem entrada, nada passa pela maquininha').toBe(1)
    expect(vezesNoCartao({ ...dap, metodo: 'PIX' }), 'só no crédito').toBe(1)
  })
  it('o navegador só manda as vezes da entrada no crédito', () => {
    expect(EntradaDoPagamento.safeParse({ ...dap }).success).toBe(true)
    expect(EntradaDoPagamento.safeParse({ ...dap, metodo: 'PIX' }).success).toBe(false)
    expect(EntradaDoPagamento.safeParse({ ...dap, vezes: 13 }).success).toBe(false)
  })
  it('o retrato do contrato guarda as vezes (e o de antes, sem vezes, não muda)', () => {
    expect(pagamentoNormalizado(dap)).toMatchObject({ forma: 'PARCELADO', metodo: 'CREDIT_CARD', vezes: 3 })
    expect(pagamentoNormalizado({ ...dap, vezes: 1 })).not.toHaveProperty('vezes')
    expect(pagamentoDoRetrato(pagamentoNormalizado(dap))).toMatchObject({ forma: 'PARCELADO', vezes: 3 })
  })
})

describe('D6: o crediário da clínica não é cartão', () => {
  it('as parcelas do saldo nascem SEM meio de pagamento', () => {
    const [, ...parcelas] = lancamentosDoPagamento(4400, dap, 'Plano')
    expect(parcelas.map(p => [p.amount, p.is_paid, p.payment_method])).toEqual([[1700, false, null], [1700, false, null]])
    expect(parcelas.every(p => p.cartao_vezes === undefined && p.cartao_bandeira === undefined)).toBe(true)
  })
  it('o contrato diz a entrada no cartão e as parcelas com a clínica', () => {
    expect(valoresDoPagamento(dap, 4400)['pagamento.forma']).toMatch(
      /^entrada de R\$\s1\.000,00 no cartão de crédito em 3x \+ 2 parcelas de R\$\s1\.700,00 com a clínica, a primeira em 04\/12\/2026$/)
    expect(valoresDoPagamento({ ...dap, vezes: undefined }, 4400)['pagamento.forma']).toMatch(
      /^entrada de R\$\s1\.000,00 no cartão de crédito \+ 2 parcelas de R\$\s1\.700,00 com a clínica/)
    expect(valoresDoPagamento({ ...dap, entrada: 0, vezes: undefined }, 3400)['pagamento.forma']).toMatch(
      /^2 parcelas de R\$\s1\.700,00 com a clínica, a primeira em 04\/12\/2026$/)
  })
  it('a tela e a linha do tempo dizem o mesmo', () => {
    expect(frasesDoPagamento(dap)).toMatch(/^Entrada de R\$\s1\.000,00 no cartão de crédito em 3x \+ 2x com a clínica, a primeira em 04\/12\/2026$/)
    expect(rotuloDoPagamento(dap)).toBe('entrada de R$ 1.000,00 em Crédito 3x + 2x com a clínica')
    expect(rotuloDoPagamento({ ...dap, entrada: 0, vezes: undefined })).toBe('2x com a clínica')
  })
})
