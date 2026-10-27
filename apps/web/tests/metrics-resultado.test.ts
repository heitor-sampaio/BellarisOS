import { describe, it, expect } from 'vitest'
import { ticketMedio, resultadoDoPeriodo, variacaoDaMargemPp } from '@/lib/metrics/resultado'

/**
 * O ticket, o lucro e a margem moram em lib/metrics (§13.1): a tela de
 * Relatórios, o financeiro e o dashboard faziam a conta cada um.
 */
describe('ticketMedio', () => {
  it('é a receita de serviço ÷ os concluídos COBRADOS (a avaliação de R$ 0 não puxa a média)', () => {
    // A simulação: uma limpeza de R$ 180 e duas avaliações de R$ 0 davam R$ 60.
    expect(ticketMedio({ serviceRevenue: 180, appointmentsCharged: 1 })).toBe(180)
  })
  it('sem atendimento cobrado não há ticket ("—", não R$ 0,00)', () => {
    expect(ticketMedio({ serviceRevenue: 0, appointmentsCharged: 0 })).toBeNull()
  })
})

describe('resultadoDoPeriodo', () => {
  it('lucro = receita − despesa; margem = lucro ÷ receita, em %', () => {
    expect(resultadoDoPeriodo({ revenueCash: 1000, expensesCash: 250 })).toEqual({ lucro: 750, margemPct: 75 })
  })
  it('sem receita, a margem não existe (não é 0%)', () => {
    expect(resultadoDoPeriodo({ revenueCash: 0, expensesCash: 2400 })).toEqual({ lucro: -2400, margemPct: null })
  })
  it('a variação da margem é em pontos percentuais', () => {
    const atual = resultadoDoPeriodo({ revenueCash: 1000, expensesCash: 780 })     // 22%
    const anterior = resultadoDoPeriodo({ revenueCash: 1000, expensesCash: 800 })  // 20%
    expect(variacaoDaMargemPp(atual, anterior)).toBeCloseTo(2, 10)
    expect(variacaoDaMargemPp(atual, resultadoDoPeriodo({ revenueCash: 0, expensesCash: 0 }))).toBeNull()
  })
})
