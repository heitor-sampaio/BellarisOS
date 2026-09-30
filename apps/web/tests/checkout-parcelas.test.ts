import { describe, it, expect } from 'vitest'
import { dividirEmParcelas, somarMeses } from '@/lib/checkout/parcelas'

describe('a divisão em parcelas', () => {
  it('fecha a soma em centavos, com a sobra na última', () => {
    expect(dividirEmParcelas(200, 3, '2026-10-17T15:00:00.000Z').map(p => p.amount)).toEqual([66.66, 66.66, 66.68])
    expect(dividirEmParcelas(0.02, 3, '2026-10-17T15:00:00.000Z').map(p => p.amount)).toEqual([0, 0, 0.02])
  })
  it('um mês depois do outro, no mesmo dia e horário', () => {
    expect(dividirEmParcelas(300, 3, '2026-10-10T15:00:00.000Z').map(p => p.due_date))
      .toEqual(['2026-10-10T15:00:00.000Z', '2026-11-10T15:00:00.000Z', '2026-12-10T15:00:00.000Z'])
  })
  it('dia 31 vira o último dia dos meses curtos, sem pular o mês', () => {
    expect(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
      .toEqual([0, 1, 2, 3].map(i => somarMeses('2027-01-31T15:00:00.000Z', i).slice(0, 10)))
    expect(somarMeses('2028-01-31T15:00:00.000Z', 1).slice(0, 10), 'bissexto').toBe('2028-02-29')
  })
  it('numera 1..N com o total', () => {
    expect(dividirEmParcelas(90, 3, '2026-10-10T15:00:00.000Z').map(p => `${p.numero}/${p.total}`)).toEqual(['1/3', '2/3', '3/3'])
  })
})
