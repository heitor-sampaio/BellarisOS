import { describe, it, expect } from 'vitest'
import * as utils from '../src'

// Não existe "tag de unidade" (H16, Bloco Tags de 2026-11-14): a "Unidade: X"
// gravada é uma tag comum, e nada a monta nem a lê como a unidade da cliente.
// E não existe lista fixa de tags (o Heitor, 2026-11-16: a rede nova nasce sem
// tag nenhuma; as tags são as que a rede cria) — o `client-tags.ts`, com as
// oito de sempre, saiu.
describe('tags de cliente', () => {
  it('não há helper de tag de unidade', () => {
    expect(Object.keys(utils)).not.toContain('unitTag')
    expect(Object.keys(utils)).not.toContain('isUnitTag')
    expect(Object.keys(utils)).not.toContain('UNIT_TAG_PREFIX')
  })
  it('não há lista fixa de tags', () => {
    expect(Object.keys(utils)).not.toContain('CLIENT_TAGS')
  })
})
