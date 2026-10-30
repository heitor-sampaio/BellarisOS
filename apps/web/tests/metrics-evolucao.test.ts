import { describe, it, expect } from 'vitest'
import { pontosDaEvolucao } from '@/lib/metrics/evolucao'

/**
 * O gráfico "Evolução do Período" dos relatórios (D2 da simulação de
 * 2026-10-27): o ponto vem pronto de lib/metrics, e o custo é a DESPESA paga —
 * o consumo de insumos não entra (a compra do insumo já é despesa, "Estoque").
 * Somar os dois fazia o gráfico dizer CUSTO R$ 5.350 ao lado do cartão de
 * despesas de R$ 4.900.
 */
describe('pontosDaEvolucao', () => {
  const de  = new Date('2026-10-01T03:00:00Z') // 00:00 em Brasília
  const ate = new Date('2026-10-03T02:59:59.999Z') // fim do dia 2

  it('um ponto por dia, com o custo = a despesa e o lucro = receita − despesa', () => {
    const pontos = pontosDaEvolucao(
      [{ bucket: '2026-10-01T03:00:00Z', revenue: 180, expenses: 40 }],
      { granularidade: 'day', de, ate },
    )
    expect(pontos).toEqual([
      { day: 1, revenue: 180, cost: 40, profit: 140 },
      { day: 2, revenue: 0, cost: 0, profit: 0 },
    ])
  })

  it('por hora: as 24 horas do dia, no fuso da clínica', () => {
    const pontos = pontosDaEvolucao(
      [{ bucket: '2026-10-01T13:00:00Z', revenue: 100, expenses: 0 }], // 10h em Brasília
      { granularidade: 'hour', de, ate: new Date('2026-10-02T02:59:59.999Z') },
    )
    expect(pontos).toHaveLength(24)
    expect(pontos[10]).toEqual({ day: 10, revenue: 100, cost: 0, profit: 100 })
    expect(pontos.filter(p => p.revenue !== 0)).toHaveLength(1)
  })
})

describe('pontosDaEvolucao com o estoque no resultado (2026-10-29)', () => {
  it('o custo do gráfico é o do LUCRO: a despesa sem a compra de estoque, mais o insumo consumido', () => {
    const de  = new Date('2026-10-01T03:00:00Z')
    const ate = new Date('2026-10-02T02:59:59.999Z')
    // Despesa paga R$ 700 (R$ 500 de compra de estoque) e R$ 30 de insumo: custo R$ 230, lucro R$ 770.
    const pontos = pontosDaEvolucao(
      [{ bucket: '2026-10-01T03:00:00Z', revenue: 1000, expenses: 700 }],
      { granularidade: 'day', de, ate },
      [{ bucket: '2026-10-01T03:00:00Z', compraDeEstoque: 500, consumoDeInsumo: 30 }],
    )
    expect(pontos).toEqual([{ day: 1, revenue: 1000, cost: 230, profit: 770 }])
  })
})
