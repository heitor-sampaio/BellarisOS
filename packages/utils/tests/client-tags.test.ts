import { describe, it, expect } from 'vitest'
import { CLIENT_TAGS, UNIT_TAG_PREFIX, unitTag, isUnitTag, unitTagName } from '../src/client-tags'

describe('tags de unidade', () => {
  it('monta e reconhece a tag da unidade', () => {
    const t = unitTag('Centro')
    expect(t).toBe(`${UNIT_TAG_PREFIX}Centro`)
    expect(isUnitTag(t)).toBe(true)
    expect(unitTagName(t)).toBe('Centro')
  })

  it('tag comum não é tag de unidade e volta inteira', () => {
    expect(isUnitTag('VIP')).toBe(false)
    expect(unitTagName('VIP')).toBe('VIP')
  })

  it('nome com acento e espaço sobrevive à ida e volta', () => {
    expect(unitTagName(unitTag('Balneário Camboriú'))).toBe('Balneário Camboriú')
  })

  it('nenhuma tag do vocabulário colide com o prefixo de unidade', () => {
    for (const t of CLIENT_TAGS) expect(isUnitTag(t)).toBe(false)
  })
})
