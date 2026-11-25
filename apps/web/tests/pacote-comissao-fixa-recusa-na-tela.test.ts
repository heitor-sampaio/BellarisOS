import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A comissão em R$ fixo do pacote tem o limite do registro (R$ 999.999,99 — `recusaDoValorDaComissao`,
 * lib/comissoes/config.ts; o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito.").
 * As outras telas de comissão (a da pessoa, a do procedimento, a do produto) dizem antes de mandar; a do
 * pacote mandava e esperava a recusa do servidor. A mesma regra, na mesma hora.
 */
const fonte = readFileSync(join(__dirname, '..', 'components', 'admin', 'pacotes-catalogo.tsx'), 'utf8')

describe('a tela do pacote recusa a comissão fixa acima do registro antes de mandar', () => {
  it('a conferência do rascunho usa a regra única da comissão', () => {
    const corpo = fonte.slice(fonte.indexOf('function comissaoDoRascunho'))
    expect(corpo.slice(0, 900)).toMatch(/recusaDoValorDaComissao\(/)
  })
})
