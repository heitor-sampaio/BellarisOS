import { describe, it, expect } from 'vitest'
import { descontoEmReais, recusaDoDesconto, ratear } from '@/lib/vendas/desconto'
import { valoresDoPagamento, pagamentoNormalizado, descontoDoRetrato, mesmoPagamento, frasesDoPagamento } from '@/lib/checkout/pagamento'

describe('o desconto em reais', () => {
  it('R$ e %, em centavos, sem sair do intervalo', () => {
    expect(descontoEmReais(400, { tipo: 'VALOR', valor: 40 })).toBe(40)
    expect(descontoEmReais(400, { tipo: 'PERCENTUAL', valor: 10 })).toBe(40)
    expect(descontoEmReais(333.33, { tipo: 'PERCENTUAL', valor: 10 })).toBe(33.33)
    expect(descontoEmReais(100, { tipo: 'VALOR', valor: 150 })).toBe(100)
    expect(descontoEmReais(100, { tipo: 'PERCENTUAL', valor: 100 })).toBe(100)
    expect(descontoEmReais(100, null)).toBe(0)
    expect(descontoEmReais(100, { tipo: 'VALOR', valor: 0 })).toBe(0)
  })

  it('recusa desconto maior que a venda (sem teto abaixo disso)', () => {
    expect(recusaDoDesconto(100, { tipo: 'VALOR', valor: 100.01 })).toMatch(/maior que o valor/)
    expect(recusaDoDesconto(100, { tipo: 'PERCENTUAL', valor: 101 })).toMatch(/100%/)
    expect(recusaDoDesconto(100, { tipo: 'PERCENTUAL', valor: 99 })).toBeNull()
    expect(recusaDoDesconto(100, null)).toBeNull()
  })
})

describe('o rateio', () => {
  it('fecha exatamente e respeita a proporção', () => {
    expect(ratear([300, 100], 360)).toEqual([270, 90])
    const r = ratear([100, 100, 100], 200)
    expect(r.reduce((s, v) => s + v, 0)).toBeCloseTo(200, 10)
    expect(r).toEqual([66.67, 66.67, 66.66])
  })

  it('nenhuma parte passa do próprio valor, nem com um centavo de desconto', () => {
    const partes = [0.03, 0.03, 0.03, 99.91]
    const r = ratear(partes, 99.99)
    expect(Math.round(r.reduce((s, v) => s + v, 0) * 100)).toBe(9999)
    r.forEach((v, i) => expect(v).toBeLessThanOrEqual(partes[i]!))
  })

  it('tudo zerado: o alvo vai para a última', () => {
    expect(ratear([0, 0], 0)).toEqual([0, 0])
    expect(ratear([], 10)).toEqual([])
  })
})

describe('o desconto no contrato', () => {
  it('a frase fala do valor com desconto e diz o desconto', () => {
    const v = valoresDoPagamento({ forma: 'AVISTA', metodo: 'PIX' }, 400, 40)
    expect(v['pagamento.forma']).toMatch(/^R\$\s360,00 à vista, no Pix, com desconto de R\$\s40,00 sobre R\$\s400,00$/)
    expect(v['pagamento.subtotal']).toMatch(/400,00/)
    expect(v['pagamento.desconto']).toMatch(/40,00/)
  })

  it('sem desconto, a frase de antes (e o desconto vazio)', () => {
    const v = valoresDoPagamento({ forma: 'AVISTA', metodo: 'PIX' }, 400)
    expect(v['pagamento.forma']).toMatch(/^R\$\s400,00 à vista, no Pix$/)
    expect(v['pagamento.desconto']).toBeNull()
  })

  it('o parcelado divide o valor com desconto', () => {
    const v = valoresDoPagamento({ forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 100, parcelas: 2, primeiroVencimento: new Date('2026-10-10T12:00:00-03:00').toISOString() }, 500, 100)
    expect(v['pagamento.valor_parcela']).toMatch(/150,00/)
  })

  it('o retrato guarda o desconto só quando existe — os de antes seguem iguais', () => {
    expect(pagamentoNormalizado(null)).toEqual({ forma: 'NADA_AGORA' })
    expect(pagamentoNormalizado(null, 40)).toEqual({ forma: 'NADA_AGORA', desconto: 40 })
    expect(descontoDoRetrato({ forma: 'NADA_AGORA', desconto: 40 })).toBe(40)
    expect(descontoDoRetrato({ forma: 'NADA_AGORA' })).toBe(0)
    // Trocar o desconto é trocar o combinado: o contrato assinado não vale.
    expect(mesmoPagamento(pagamentoNormalizado(null, 40), pagamentoNormalizado(null, 50))).toBe(false)
    expect(frasesDoPagamento(null, 40)).toMatch(/^No atendimento · desconto de R\$\s40,00$/)
  })
})
