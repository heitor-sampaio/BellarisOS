import { describe, it, expect } from 'vitest'
import {
  ticketMedio, mediaPorAtendimentoCobrado, resultadoDoPeriodo, variacaoDaMargemPp, resumoDoFunil, conversaoDasOportunidades,
} from '@/lib/metrics/resultado'

/**
 * O ticket, o lucro e a margem moram em lib/metrics (§13.1): a tela de
 * Relatórios, o financeiro e o dashboard faziam a conta cada um.
 */
describe('ticketMedio — a média de quanto cada CLIENTE gasta (decisão do Heitor, 2026-10-29)', () => {
  it('é o que as clientes pagaram ÷ as clientes que pagaram', () => {
    // A Joana pagou a limpeza (R$ 180) e a Lia um pacote (R$ 420): R$ 300.
    expect(ticketMedio({ pagoPelasClientes: 600, clientesQuePagaram: 2 })).toBe(300)
  })
  it('sem cliente que pagou não há ticket ("—", não R$ 0,00)', () => {
    expect(ticketMedio({ pagoPelasClientes: 0, clientesQuePagaram: 0 })).toBeNull()
  })
})

describe('mediaPorAtendimentoCobrado — a média da ficha da cliente (outra conta, outro nome)', () => {
  it('é a receita de serviço ÷ os concluídos COBRADOS (a avaliação de R$ 0 não puxa a média)', () => {
    expect(mediaPorAtendimentoCobrado({ serviceRevenue: 180, appointmentsCharged: 1 })).toBe(180)
    expect(mediaPorAtendimentoCobrado({ serviceRevenue: 0, appointmentsCharged: 0 })).toBeNull()
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

describe('resumoDoFunil — a conversão é da OPORTUNIDADE (decisão do Heitor, 2026-10-29)', () => {
  const etapa = (outcome: 'OPEN' | 'WON' | 'LOST', leads: number, converted = 0) =>
    ({ stageId: outcome, name: outcome, position: 0, outcome, leads, converted })

  it('ganhas ÷ oportunidades do funil, sem olhar quem já é cliente', () => {
    // Três em "Novo" (duas já são clientes) e uma ganha: 1 de 4, não 2 de 4.
    const r = resumoDoFunil([etapa('OPEN', 3, 2), etapa('WON', 1), etapa('LOST', 0)])
    expect(r.ganhos).toBe(1)
    expect(r.total).toBe(4)
    expect(r.conversaoPct).toBe(25)
  })
  it('funil sem etapa de ganho não tem conversão ("—"), mesmo com clientes nele', () => {
    expect(resumoDoFunil([etapa('OPEN', 2, 2)]).conversaoPct).toBeNull()
  })
  it('sem oportunidade, sem percentual', () => {
    expect(resumoDoFunil([etapa('OPEN', 0), etapa('WON', 0)]).conversaoPct).toBeNull()
  })
})

describe('conversaoDasOportunidades — os funis juntos (Relatórios → Comercial)', () => {
  it('junta as oportunidades dos funis: ganhas ÷ todas', () => {
    expect(conversaoDasOportunidades({ total: 4, ganhos: 1, temGanho: true })).toBe(25)
  })
  it('nenhum funil com etapa de ganho: "—"', () => {
    expect(conversaoDasOportunidades({ total: 4, ganhos: 0, temGanho: false })).toBeNull()
  })
})
