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

// A12 da 11ª simulação (2026-11-10): o ácido hialurônico vem em SERINGA, e o
// cadastro não tinha a embalagem — virou "un", com "(seringa)" no nome.
describe('A12 da 11ª: a embalagem "seringa"', () => {
  it('está entre as medidas do cadastro do produto', () => {
    expect(MEDIDAS_DO_PRODUTO).toContain('seringa')
  })
})

// R03 (o Heitor, 26/11, na página de perguntas: "Sim: 'pote' entra na lista"):
// o pote é embalagem contável, como o frasco e a caixa — o creme, o alginato.
describe('R03: a embalagem "pote"', () => {
  it('está entre as medidas do cadastro do produto, e as que já havia continuam', async () => {
    expect(MEDIDAS_DO_PRODUTO).toContain('pote')
    expect(MEDIDAS_DO_PRODUTO).toHaveLength(14)
  })
  it('vai ao plural e conta como embalagem (não é medida de quantidade)', async () => {
    const { medidaNoPlural, recusaDaEmbalagem, avisoDaEmbalagem } = await import('@/lib/estoque/medidas')
    expect(medidaNoPlural('pote', 3)).toBe('potes')
    expect(medidaNoPlural('pote', 1)).toBe('pote')
    expect(recusaDaEmbalagem('pote', 500, 'g')).toBeNull()
    expect(avisoDaEmbalagem('pote', 500, 'g')).toBeNull()
  })
  it('a parte da embalagem diz "do pote", como "do frasco"', async () => {
    const { parteDaEmbalagem, linhaDoInsumo } = await import('@/lib/estoque/unidade-de-consumo')
    const pote = { unit: 'pote', consumption_unit: 'g', units_per_package: 500 }
    expect(parteDaEmbalagem(pote, 50)).toBe('1/10 do pote')
    expect(parteDaEmbalagem(pote, 1000)).toBe('2 potes')
    expect(linhaDoInsumo(50, 'g', pote)).toBe('50 g · 1/10 do pote')
  })
})
