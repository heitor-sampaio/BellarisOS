import { describe, it, expect } from 'vitest'
import {
  normalizarCondicao, lerCondicoes, valorComCondicao, totalComCondicoes, descreverCondicao,
  condicoesVencidas, ehCortesiaTotal, brutoDosItens, MENSALIDADE_MINIMA_CENTAVOS, abaixoDoMinimo,
} from '@estetica-os/nucleo/lib/planos/condicoes'

/**
 * Cortesia e desconto na assinatura da rede (2026-10-07, decisões do Heitor):
 * por item (o plano, as conexões de WhatsApp, o Copilot), em percentual ou em
 * reais, ou de graça; com data de fim opcional. O banco repete esta conta
 * (`private.valor_com_condicao`).
 */
const HOJE = '2026-10-07'

describe('normalizarCondicao (o que vem da tela do sistema)', () => {
  it('cortesia, percentual e valor, com ou sem data de fim', () => {
    expect(normalizarCondicao({ tipo: 'cortesia' }, HOJE)).toEqual({ ok: true, condicao: { tipo: 'cortesia' } })
    expect(normalizarCondicao({ tipo: 'percentual', percentual: 20, ate: '2026-12-31' }, HOJE))
      .toEqual({ ok: true, condicao: { tipo: 'percentual', percentual: 20, ate: '2026-12-31' } })
    expect(normalizarCondicao({ tipo: 'valor', centavos: 5000, ate: null }, HOJE))
      .toEqual({ ok: true, condicao: { tipo: 'valor', centavos: 5000 } })
  })
  it('null é "preço normal" (tira a condição)', () => {
    expect(normalizarCondicao(null, HOJE)).toEqual({ ok: true, condicao: null })
  })
  it('recusa o que não fecha', () => {
    for (const c of [
      { tipo: 'brinde' }, { tipo: 'percentual', percentual: 0 }, { tipo: 'percentual', percentual: 101 },
      { tipo: 'percentual', percentual: 12.5 }, { tipo: 'valor', centavos: 0 }, { tipo: 'valor', centavos: -1 },
      { tipo: 'valor', centavos: 10_000_001 }, { tipo: 'cortesia', ate: '31/12/2026' },
      { tipo: 'cortesia', ate: '2026-10-06' }, // fim no passado
    ]) expect(normalizarCondicao(c, HOJE).ok, JSON.stringify(c)).toBe(false)
  })
  it('recusa data que não existe (30 de fevereiro)', () => {
    expect(normalizarCondicao({ tipo: 'cortesia', ate: '2027-02-30' }, HOJE).ok).toBe(false)
  })
  it('o fim pode ser hoje (vale o dia inteiro)', () => {
    expect(normalizarCondicao({ tipo: 'cortesia', ate: HOJE }, HOJE).ok).toBe(true)
  })
})

describe('valorComCondicao', () => {
  it('cortesia zera; percentual arredonda o desconto; valor não deixa negativo', () => {
    expect(valorComCondicao(19900, { tipo: 'cortesia' })).toBe(0)
    expect(valorComCondicao(19900, { tipo: 'percentual', percentual: 20 })).toBe(15920)
    expect(valorComCondicao(999, { tipo: 'percentual', percentual: 33 })).toBe(669) // 329,67 → 330 de desconto
    expect(valorComCondicao(19900, { tipo: 'valor', centavos: 5000 })).toBe(14900)
    expect(valorComCondicao(3000, { tipo: 'valor', centavos: 5000 })).toBe(0)
    expect(valorComCondicao(19900, undefined)).toBe(19900)
  })
})

describe('o total da assinatura', () => {
  const adicionais = { whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 9900 } }
  it('brutoDosItens: o plano e cada adicional contratado', () => {
    expect(brutoDosItens(19900, adicionais)).toEqual({ plano: 19900, whatsapp: 9800, copilot: 9900 })
    expect(brutoDosItens(19900, {})).toEqual({ plano: 19900 })
  })
  it('soma cada item já com a condição dele', () => {
    expect(totalComCondicoes(19900, adicionais, {})).toBe(39600)
    expect(totalComCondicoes(19900, adicionais, { whatsapp: { tipo: 'cortesia' }, plano: { tipo: 'percentual', percentual: 50 } }))
      .toBe(9950 + 0 + 9900)
  })
  it('condição de item que a rede não tem não pesa', () => {
    expect(totalComCondicoes(19900, {}, { copilot: { tipo: 'cortesia' } })).toBe(19900)
  })
  it('ehCortesiaTotal: nada a pagar — por cortesia, 100% de desconto ou preço zero (verificação de 2026-10-07)', () => {
    expect(ehCortesiaTotal(19900, {}, { plano: { tipo: 'cortesia' } })).toBe(true)
    expect(ehCortesiaTotal(19900, adicionais, { plano: { tipo: 'cortesia' }, whatsapp: { tipo: 'cortesia' } })).toBe(false)
    expect(ehCortesiaTotal(19900, adicionais, { plano: { tipo: 'cortesia' }, whatsapp: { tipo: 'cortesia' }, copilot: { tipo: 'cortesia' } })).toBe(true)
    expect(ehCortesiaTotal(0, {}, {}), 'preço zero também é rede de cortesia').toBe(true)
    expect(ehCortesiaTotal(19900, {}, { plano: { tipo: 'percentual', percentual: 100 } })).toBe(true)
    expect(ehCortesiaTotal(19900, {}, { plano: { tipo: 'valor', centavos: 19900 } })).toBe(true)
  })
})

describe('lerCondicoes, descreverCondicao, condicoesVencidas', () => {
  it('lerCondicoes: tolerante — o inválido some', () => {
    expect(lerCondicoes({ plano: { tipo: 'cortesia', ate: '2026-12-31' }, whatsapp: { tipo: 'percentual', percentual: 500 }, sms: { tipo: 'cortesia' } }))
      .toEqual({ plano: { tipo: 'cortesia', ate: '2026-12-31' } })
    expect(lerCondicoes(null)).toEqual({})
  })
  it('descreverCondicao: o texto da tela', () => {
    expect(descreverCondicao({ tipo: 'cortesia', ate: '2026-12-31' })).toBe('Cortesia do BellarisOS até 31/12/2026')
    expect(descreverCondicao({ tipo: 'cortesia' })).toBe('Cortesia do BellarisOS')
    expect(descreverCondicao({ tipo: 'percentual', percentual: 20 })).toBe('20% de desconto')
    expect(descreverCondicao({ tipo: 'valor', centavos: 5000, ate: '2027-01-31' }).replace(/\s/g, ' ')).toBe('R$ 50,00 de desconto até 31/01/2027')
  })
  it('condicoesVencidas: a que terminou ANTES de hoje (o dia do fim ainda vale)', () => {
    expect(condicoesVencidas({ plano: { tipo: 'cortesia', ate: '2026-10-06' }, whatsapp: { tipo: 'cortesia', ate: HOJE }, copilot: { tipo: 'cortesia' } }, HOJE))
      .toEqual(['plano'])
  })
})

describe('o mínimo que o Asaas cobra (verificação de 2026-10-07)', () => {
  it('a mensalidade é zero (cortesia) ou pelo menos R$ 5,00', () => {
    expect(MENSALIDADE_MINIMA_CENTAVOS).toBe(500)
    expect(abaixoDoMinimo(0)).toBe(false)
    expect(abaixoDoMinimo(1)).toBe(true)
    expect(abaixoDoMinimo(499)).toBe(true)
    expect(abaixoDoMinimo(500)).toBe(false)
  })
})
