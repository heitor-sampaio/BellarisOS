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
      { day: 1, rotulo: '01/10', revenue: 180, cost: 40, profit: 140 },
      { day: 2, rotulo: '02/10', revenue: 0, cost: 0, profit: 0 },
    ])
  })

  it('por hora: as 24 horas do dia, no fuso da clínica', () => {
    const pontos = pontosDaEvolucao(
      [{ bucket: '2026-10-01T13:00:00Z', revenue: 100, expenses: 0 }], // 10h em Brasília
      { granularidade: 'hour', de, ate: new Date('2026-10-02T02:59:59.999Z') },
    )
    expect(pontos).toHaveLength(24)
    expect(pontos[10]).toEqual({ day: 10, rotulo: '10h', revenue: 100, cost: 0, profit: 100 })
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
    expect(pontos).toEqual([{ day: 1, rotulo: '01/10', revenue: 1000, cost: 230, profit: 770 }])
  })
})

describe('pontosDaEvolucao com as taxas e as comissões (o Heitor, 2026-11-04)', () => {
  it('o custo do lucro soma as taxas e as comissões lançadas, e tira a despesa do fechamento das comissões', () => {
    const de  = new Date('2026-11-01T03:00:00Z')
    const ate = new Date('2026-11-02T02:59:59.999Z')
    // Receita R$ 2.100; despesa paga R$ 300 (R$ 100 é o fechamento das comissões);
    // taxas R$ 38; comissões R$ 100: custo 200 + 38 + 100 = R$ 338, lucro R$ 1.762.
    const pontos = pontosDaEvolucao(
      [{ bucket: '2026-11-01T03:00:00Z', revenue: 2100, expenses: 300 }],
      { granularidade: 'day', de, ate },
      [{ bucket: '2026-11-01T03:00:00Z', compraDeEstoque: 0, consumoDeInsumo: 0, taxasDaMaquininha: 38, comissoes: 100, despesaDeComissoes: 100 }],
    )
    expect(pontos).toEqual([{ day: 1, rotulo: '01/11', revenue: 2100, cost: 338, profit: 1762 }])
  })
})

// A44 da 6ª simulação: em 04/11 de madrugada, o hover do gráfico do dashboard ("Hoje", por HORA) dizia
// "DIA 3" — o rótulo do tooltip era sempre "Dia {eixo}", e o eixo por hora é a hora. E por dia, o eixo é
// o dia do PERÍODO (1, 2, 3…), não a data.
describe('o rótulo de cada ponto da evolução (A44)', () => {
  it('por hora, a hora ("03h"); por dia, a data no fuso do negócio ("01/10")', () => {
    const porHora = pontosDaEvolucao([], { granularidade: 'hour', de: new Date('2026-11-04T03:00:00Z'), ate: new Date('2026-11-04T06:30:00Z') })
    expect(porHora[3]?.rotulo).toBe('03h')
    const porDia = pontosDaEvolucao([], { granularidade: 'day', de: new Date('2026-10-01T03:00:00Z'), ate: new Date('2026-10-03T02:59:59.999Z') })
    expect(porDia.map(p => p.rotulo)).toEqual(['01/10', '02/10'])
  })
})
