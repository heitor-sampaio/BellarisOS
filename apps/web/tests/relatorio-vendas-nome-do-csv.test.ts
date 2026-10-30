import { describe, it, expect } from 'vitest'
import { resolvePeriod } from '@/lib/metrics/period'
import { nomeDoCsvDeVendas } from '@/lib/metrics/vendas-comum'

/**
 * J-53 (simulação de 2026-10-30): o CSV de outubro saía como
 * "vendas-2026-10-01-a-2026-11-01.csv" — o nome usava o fim do período em UTC
 * (31/10 23:59 em Brasília já é 01/11 em UTC). O nome diz o último dia NO
 * FUSO do negócio.
 */
describe('nomeDoCsvDeVendas', () => {
  it('outubro inteiro vai de 01/10 a 31/10, não a 01/11', () => {
    const outubro = resolvePeriod('month', undefined, undefined, new Date('2026-10-15T15:00:00Z'))
    expect(nomeDoCsvDeVendas(outubro.from, outubro.fullTo)).toBe('vendas-2026-10-01-a-2026-10-31.csv')
  })

  it('o personalizado fecha no último dia escolhido', () => {
    const p = resolvePeriod('custom', '2021-04-01', '2021-04-30', new Date('2026-10-30T15:00:00Z'))
    expect(nomeDoCsvDeVendas(p.from, p.fullTo)).toBe('vendas-2021-04-01-a-2021-04-30.csv')
  })

  it('hoje, às 22h em Brasília (já amanhã em UTC), é um dia só', () => {
    const p = resolvePeriod('today', undefined, undefined, new Date('2026-10-31T01:00:00Z'))
    expect(nomeDoCsvDeVendas(p.from, p.fullTo)).toBe('vendas-2026-10-30-a-2026-10-30.csv')
  })
})
