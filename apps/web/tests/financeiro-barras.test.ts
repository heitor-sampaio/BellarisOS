import { describe, it, expect } from 'vitest'
import { montarBarras } from '@/lib/financeiro/barras'

// O gráfico do financeiro da unidade somava a LISTA na tela (§13.1); agora os
// valores vêm de metrics_series e aqui só se posiciona nos intervalos.
describe('as barras do gráfico do financeiro', () => {
  it('hoje: 24 horas, cada valor na sua hora de Brasília', () => {
    const b = montarBarras([{ bucket: '2026-10-21T13:00:00+00:00', revenue: 180, expenses: 0 }], 'today', '2026-10-21T03:00:00Z', new Date('2026-10-21T20:00:00Z'))
    expect(b).toHaveLength(24)
    expect(b[10]).toEqual({ label: '10h', income: 180, expense: 0 })
    expect(b[9]!.income).toBe(0)
  })
  it('por dia: do começo do período até hoje, os dias sem movimento em zero', () => {
    const b = montarBarras([{ bucket: '2026-10-02T03:00:00+00:00', revenue: 50, expenses: 20 }], 'month', '2026-10-01T03:00:00Z', new Date('2026-10-03T15:00:00Z'))
    expect(b.map(x => x.label)).toEqual(['01/10', '02/10', '03/10'])
    expect(b[1]).toEqual({ label: '02/10', income: 50, expense: 20 })
  })
  it('trimestre: as semanas que a série trouxe, na ordem', () => {
    const b = montarBarras([
      { bucket: '2026-10-12T03:00:00+00:00', revenue: 10, expenses: 0 },
      { bucket: '2026-10-05T03:00:00+00:00', revenue: 5, expenses: 1 },
    ], 'quarter', '2026-08-01T03:00:00Z', new Date('2026-10-15T15:00:00Z'))
    expect(b).toEqual([{ label: '05/10', income: 5, expense: 1 }, { label: '12/10', income: 10, expense: 0 }])
  })
})
