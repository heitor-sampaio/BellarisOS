import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A2 da 35ª simulação (docs/regras/design.md, "O botão flutuante do Copilot não
 * cobre o fim da página", e o A16 da 23ª, o que ganha o foco sobe acima dele;
 * decisão do Claude, 27/11): a 900 px de altura, o botão "Fora do plano" cobria
 * o lápis do canto direito dos cartões, no meio da página — o espaço no fim do
 * `main` só resolve o FIM. Fora do plano o botão é um AVISO, não uma ação: com
 * uma ação embaixo dele (botão, link, campo), ele sobe até um lugar sem ação, e
 * volta quando a página rola.
 */
const botao = { top: 834, bottom: 880, left: 1300, right: 1420 }
const lapis = { top: 840, bottom: 868, left: 1380, right: 1408 }

describe('A2: o aviso de fora do plano não cobre uma ação', () => {
  it('uma ação embaixo do botão: ele sai da frente', async () => {
    const { haAcaoEmbaixo } = await import('@/components/copilot/copilot-fora-do-plano')
    const emQue = (x: number, y: number) => x >= lapis.left && x <= lapis.right && y >= lapis.top && y <= lapis.bottom ? 'acao' : 'texto'
    expect(haAcaoEmbaixo(botao, (x, y) => emQue(x, y) === 'acao')).toBe(true)
  })
  it('só texto embaixo: fica', async () => {
    const { haAcaoEmbaixo } = await import('@/components/copilot/copilot-fora-do-plano')
    expect(haAcaoEmbaixo(botao, () => false)).toBe(false)
  })
  it('sobe até o primeiro lugar sem ação embaixo; sem ação, não sobe', async () => {
    const { desvioDoBotao } = await import('@/components/copilot/copilot-fora-do-plano')
    const naCaixa = (c: typeof lapis) => (x: number, y: number) => x >= c.left && x <= c.right && y >= c.top && y <= c.bottom
    expect(desvioDoBotao(botao, () => false)).toBe(0)
    const subida = desvioDoBotao(botao, naCaixa(lapis))
    expect(subida).toBeGreaterThan(0)
    // Na altura nova, nada de ação embaixo.
    const { haAcaoEmbaixo } = await import('@/components/copilot/copilot-fora-do-plano')
    expect(haAcaoEmbaixo({ ...botao, top: botao.top - subida, bottom: botao.bottom - subida }, naCaixa(lapis))).toBe(false)
  })
  it('o componente confere na rolagem e no tamanho da janela, e sobe sem sair da tela', () => {
    const f = readFileSync(join(__dirname, '..', 'components', 'copilot', 'copilot-fora-do-plano.tsx'), 'utf8')
    expect(f).toMatch(/addEventListener\('scroll'/)
    expect(f).toMatch(/addEventListener\('resize'/)
    expect(f).toMatch(/elementsFromPoint/)
    expect(f).toMatch(/data-sai-da-frente/)
    expect(f).toMatch(/translateY\(-\$\{desvio\}px\)/)
  })
})
