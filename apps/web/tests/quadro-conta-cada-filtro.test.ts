import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A10 da 38ª simulação (princípio 3): no quadro de oportunidades, com duas
 * tags marcadas no filtro, o selo do "Limpar" mostrava 1 — contava o GRUPO,
 * não o que estava marcado. O inbox conta cada valor marcado (`contarFiltros`,
 * `components/admin/inbox-filtros.tsx`: `f.tags.length + f.donos.length …`), e
 * o quadro passa a contar igual: as duas tags = 2.
 */

const vazio = { sources: [], tags: [], owners: [], procedureIds: [], motivos: [], situation: 'all' as const, period: 'all' as const }

describe('A10: o selo do "Limpar" do quadro conta cada filtro marcado', () => {
  it('duas tags são 2, e cada valor marcado conta', async () => {
    const { contarFiltrosDoQuadro } = await import('@/lib/crm/filtros-do-quadro')
    expect(contarFiltrosDoQuadro(vazio)).toBe(0)
    expect(contarFiltrosDoQuadro({ ...vazio, tags: ['Noivas 2027', 'Indicação'] })).toBe(2)
    expect(contarFiltrosDoQuadro({
      ...vazio, sources: ['Instagram'], tags: ['Noivas 2027', 'Indicação'], owners: ['Ana', 'Bia'],
      procedureIds: ['p1'], motivos: ['m1', 'm2', 'm3'], situation: 'converted', period: '30d',
    })).toBe(1 + 2 + 2 + 1 + 3 + 1 + 1)
  })

  it('o quadro usa a conta', () => {
    const board = readFileSync(join(__dirname, '..', 'components/branch/crm-board.tsx'), 'utf8')
    expect(board).toMatch(/const activeCount = contarFiltrosDoQuadro\(filters\)/)
  })
})
