import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A dica não sai cortada (A5 da 29ª; design.md, "o painel flutua por cima de
 * tudo, inteiro na tela"). O painel da dica era `position: absolute` dentro do
 * `overflow` da janela do agendamento (o `<dialog className="modal">`), e a do
 * "Cancelar", na borda direita, saía pela metade. Como o painel do
 * `PickerCompacto` (A17 da 27ª): sobe à camada de cima do navegador
 * (`popover="manual"`), em posição fixa medida do "i", e continua no mesmo
 * lugar do DOM (o `getByRole('tooltip')` dentro do escopo segue achando).
 */
const fonte = readFileSync(join(__dirname, '..', '..', '..', 'packages/nucleo/src/components/dica.tsx'), 'utf8')

describe('a dica flutua por cima de tudo', () => {
  it('o painel vai à camada de cima', () => {
    expect(fonte).toContain('popover="manual"')
    expect(fonte).toContain('showPopover()')
  })
  it('em posição fixa, medida do botão e dentro da tela', () => {
    expect(fonte).toContain("position: 'fixed'")
    expect(fonte).toContain('posicaoDaDica(')
  })
})

describe('posicaoDaDica', () => {
  it('perto da borda direita, alinha à direita do "i" e fica dentro da tela', async () => {
    const { posicaoDaDica } = await import('@estetica-os/nucleo/components/dica')
    const p = posicaoDaDica({ top: 500, bottom: 516, left: 760, right: 776 }, 280, 0, { largura: 800, altura: 900 })
    expect(p.left + p.largura).toBeLessThanOrEqual(800 - 16)
    expect(p.top).toBe(522)
  })
  it('sem espaço embaixo, abre em cima', async () => {
    const { posicaoDaDica } = await import('@estetica-os/nucleo/components/dica')
    const p = posicaoDaDica({ top: 860, bottom: 876, left: 100, right: 116 }, 280, 80, { largura: 800, altura: 900 })
    expect(p.top).toBe(860 - 6 - 80)
    expect(p.left).toBe(100)
  })
})
