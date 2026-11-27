import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A13 da 35ª simulação (princípio 7; design.md, "chips 20px (pílula) … é a
 * curva que distingue um badge de um botão"; decisão do Claude, 27/11): na
 * Equipe, a pílula "Venda: a do pacote ou produto vendido…" não parecia botão,
 * e a comissão de venda só se achava clicando nela. O que abre a comissão tem
 * a cara de botão (a curva do botão, o lápis de editar) e o nome da ação.
 * A cor (o aviso de qual comissão falta, A22 da 19ª) e o texto ficam.
 */
const fonte = readFileSync(join(__dirname, '..', 'components', 'admin', 'comissao-do-membro.tsx'), 'utf8')
const botao = fonte.slice(fonte.indexOf('<button type="button" onClick={abrir}'), fonte.indexOf('<dialog'))

describe('A13: a comissão do membro abre por um botão', () => {
  it('tem a curva do botão, não a da pílula', () => {
    expect(botao).toMatch(/borderRadius: 'var\(--radius-field\)'/)
  })
  it('tem o lápis de editar', () => {
    expect(botao).toMatch(/<Pencil size=\{\d+\} aria-hidden="true"/)
  })
  it('o nome da ação: "Editar a comissão de …"', () => {
    expect(botao).toMatch(/aria-label=\{`Editar a comissão de \$\{membro\.nome\}`\}/)
  })
})
