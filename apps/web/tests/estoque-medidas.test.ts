import { describe, it, expect } from 'vitest'
import { MEDIDAS_DO_PRODUTO } from '@/lib/estoque/medidas'
import { INJECTABLE_UNITS } from '@/lib/anamnesis'

/**
 * A medida "U" (J-11, simulação de 2026-10-28/29): a toxina se conta em
 * UNIDADES ("frasco de 100 U"), e o cadastro do produto só oferecia "un" (a
 * embalagem avulsa) e "UI". O planejador de injetáveis usa o mesmo
 * vocabulário do estoque (`consumption_unit`), então a medida entra nos dois.
 */
describe('a medida "U"', () => {
  it('está entre as medidas do cadastro do produto (embalagem e conteúdo)', () => {
    expect(MEDIDAS_DO_PRODUTO).toContain('U')
    // As que já existiam continuam.
    for (const m of ['un', 'UI', 'ml', 'frasco']) expect(MEDIDAS_DO_PRODUTO).toContain(m)
  })
  it('está entre as unidades de dose do planejador de injetáveis', () => {
    expect(INJECTABLE_UNITS).toContain('U')
    for (const m of ['UI', 'ml', 'mg']) expect(INJECTABLE_UNITS).toContain(m)
  })
})
