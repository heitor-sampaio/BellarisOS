import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os rótulos do eixo do fluxo de caixa cabem (princípio 7): com 6 meses, os
 * "nov/26 dez/26 jan/27…" se encavalavam. O eixo diz o mês curto ("dez") e o
 * ano só no primeiro mês e na virada ("jan/27"); a dica e a tabela seguem com
 * o mês e o ano ("dez/26").
 */
const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o eixo do fluxo de caixa', () => {
  it('o mês curto, com o ano no primeiro e na virada', async () => {
    const m = await import('@/lib/chart-utils') as Record<string, unknown>
    const f = m.rotuloDoMesNoEixo as ((mes: string, i: number) => string) | undefined
    expect(f, 'rotuloDoMesNoEixo em lib/chart-utils').toBeTypeOf('function')
    expect(f!('2026-11', 0)).toBe('nov/26')
    expect(f!('2026-12', 1)).toBe('dez')
    expect(f!('2027-01', 2)).toBe('jan/27')
    expect(f!('2027-02', 3)).toBe('fev')
  })
  it('o gráfico usa o rótulo curto no eixo e deixa espaço entre os rótulos', () => {
    const f = ler('components/shared/fluxo-de-caixa.tsx')
    expect(f).toMatch(/<XAxis dataKey="mes" tickFormatter=\{rotuloDoMesNoEixo\}/)
    expect(f).toMatch(/minTickGap=\{\d+\}/)
    // A dica e a tabela seguem com o mês e o ano.
    expect(f).toContain('{rotuloDoMes(m.mes)}')
  })
})
