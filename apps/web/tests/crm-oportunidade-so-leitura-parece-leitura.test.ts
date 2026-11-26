import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A5 da 32ª simulação (princípio 7): no modal da oportunidade de quem tem o
 * CRM em Ver, os campos vinham desligados (o `<fieldset disabled>`, D13 da
 * 25ª) mas com a cara de campo para digitar — o fundo e a borda do `.field`
 * não mudam quando desligados. Agora, no modo "Só leitura", os campos do
 * fieldset ficam com a aparência de leitura: o fundo do card e a linha fina,
 * sem o cursor de texto. Só tokens.
 */

const modal = readFileSync(join(__dirname, '..', 'components/branch/crm-lead-modal.tsx'), 'utf8')

describe('o "Só leitura" da oportunidade parece leitura', () => {
  it('o fieldset desligado ganha a aparência de leitura, com tokens', () => {
    const css = modal.match(/const CSS_SO_LEITURA = `([\s\S]*?)`/)?.[1] ?? ''
    expect(css, 'CSS_SO_LEITURA no modal').not.toBe('')
    expect(css).toMatch(/fieldset\[data-somente-leitura\]/)
    expect(css).toMatch(/background: var\(--surface\)/)
    expect(css).toMatch(/border-color: var\(--hairline\)/)
    expect(css).toMatch(/cursor: default/)
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i)
  })

  it('o modal só põe a aparência no modo "Só leitura"', () => {
    expect(modal).toMatch(/\{somenteLeitura && <style>\{CSS_SO_LEITURA\}<\/style>\}/)
  })
})
