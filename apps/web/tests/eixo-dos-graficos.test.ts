import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { rotuloDoEixo, CURVA_DA_EVOLUCAO } from '@/lib/chart-utils'

/**
 * A52 da 9ª simulação (2026-11-07): o eixo do "Evolução do período" dizia
 * "2k, 2k" (o 1.500 arredondado para 2k ao lado do 2.000), e a curva
 * suavizada subia antes de 05/11, onde o valor era zero. O rótulo do eixo
 * guarda a casa decimal ("1,5k"), e a curva é reta entre os pontos, com o
 * ponto de cada dia à vista.
 */
describe('o eixo dos gráficos em reais', () => {
  it('não repete rótulo: 1.500 é "1,5k", não "2k"', () => {
    const ticks = [0, 500, 1000, 1500, 2000, 2500].map(v => rotuloDoEixo(v))
    expect(ticks).toEqual(['0', '500', '1k', '1,5k', '2k', '2,5k'])
    expect(new Set(ticks).size).toBe(ticks.length)
    expect(rotuloDoEixo(1_250_000)).toBe('1,3M')
    expect(rotuloDoEixo(-1500, 'R$')).toBe('R$-1,5k')
  })
  it('as três telas usam o mesmo rótulo (nenhuma arredonda o milhar à mão)', () => {
    for (const f of ['components/admin/evolution-chart.tsx', 'components/admin/reports-charts.tsx', 'components/shared/fluxo-de-caixa.tsx']) {
      const fonte = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')
      expect(fonte, f).not.toMatch(/\/ 1_000\)\.toFixed\(0\)\}k/)
    }
  })
  it('a curva da evolução não se suaviza entre os pontos', () => {
    expect(CURVA_DA_EVOLUCAO).toBe('linear')
    const fonte = fs.readFileSync(path.resolve(__dirname, '..', 'components/admin/evolution-chart.tsx'), 'utf8')
    expect(fonte).not.toContain('type="monotone"')
  })
})
