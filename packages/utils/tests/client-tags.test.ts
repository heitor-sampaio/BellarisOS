import { describe, it, expect } from 'vitest'
import * as tags from '../src/client-tags'

// Não existe "tag de unidade" (H16, Bloco Tags de 2026-11-14): a "Unidade: X"
// gravada é uma tag comum, e nada a monta nem a lê como a unidade da cliente.
describe('tags de cliente', () => {
  it('não há helper de tag de unidade', () => {
    expect(Object.keys(tags)).not.toContain('unitTag')
    expect(Object.keys(tags)).not.toContain('isUnitTag')
    expect(Object.keys(tags)).not.toContain('UNIT_TAG_PREFIX')
  })
})
