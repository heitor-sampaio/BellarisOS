import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O editor de automações no celular abre no GATILHO (`e2e/automacoes-mobile.spec.ts`). A primeira medida do
 * quadro (largura 0, antes de os nodes terem tamanho) chamava o enquadramento, e o React Flow guarda o `fitView`
 * pedido antes da medida (`fitViewQueued`) e o executa depois, com as opções do quadro: o fluxo inteiro a 0,65,
 * por cima do enquadramento pelo gatilho que a abertura acabara de fazer. A ordem entre os dois variava, e o
 * gatilho às vezes abria cortado. Antes da abertura, quem enquadra é só a abertura (`useNodesInitialized`).
 */
const fonte = readFileSync(join(__dirname, '..', 'components', 'admin', 'automacoes', 'quadro.tsx'), 'utf8')

describe('o quadro das automações só enquadra pela largura depois da abertura', () => {
  it('a medida do ResizeObserver antes da abertura não chama o enquadramento', () => {
    const observador = fonte.slice(fonte.indexOf('new ResizeObserver('), fonte.indexOf('obs.observe(alvo)'))
    expect(observador).toMatch(/if \(!abriu\.current\) return[\s\S]*enquadrar\(/)
  })
})
