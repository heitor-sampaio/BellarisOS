import { describe, it, expect } from 'vitest'
import { blocosDoTexto, type Bloco, type Trecho } from '@/lib/copilot/texto'

const trechos = (b: Bloco | undefined): Trecho[] => (b && b.tipo === 'paragrafo' ? b.trechos : [])

/**
 * O texto do Copilot vira BLOCOS (parágrafo, lista) com trechos (texto,
 * negrito, link) — nunca HTML. O que o modelo escreve não pode virar marcação:
 * um nome de cliente com "<img onerror>" tem de aparecer como texto.
 */
describe('blocosDoTexto', () => {
  it('HTML escrito pelo modelo fica texto', () => {
    const b = blocosDoTexto('Oi <img src=x onerror=alert(1)> tudo bem')
    expect(b).toEqual([{ tipo: 'paragrafo', trechos: [{ tipo: 'texto', texto: 'Oi <img src=x onerror=alert(1)> tudo bem' }] }])
  })

  it('negrito e link interno viram trechos', () => {
    const b = blocosDoTexto('Achei **Maria Souza**: [abrir a ficha](/admin/clients/123)')
    expect(trechos(b[0])).toEqual([
      { tipo: 'texto', texto: 'Achei ' },
      { tipo: 'negrito', texto: 'Maria Souza' },
      { tipo: 'texto', texto: ': ' },
      { tipo: 'link', texto: 'abrir a ficha', href: '/admin/clients/123' },
    ])
  })

  it('link para fora, protocolo javascript e // não viram link', () => {
    for (const href of ['https://evil.example', 'javascript:alert(1)', '//evil.example', '/\\evil.example']) {
      const b = blocosDoTexto(`[clique](${href})`)
      expect(trechos(b[0]).some(t => t.tipo === 'link')).toBe(false)
    }
  })

  it('linhas com "-" ou "1." viram lista; linha em branco separa parágrafos', () => {
    const b = blocosDoTexto('Horários livres:\n- 09:00\n- 10:30\n\nQuer agendar?')
    expect(b.map(x => x.tipo)).toEqual(['paragrafo', 'lista', 'paragrafo'])
    expect(b[1]).toMatchObject({ tipo: 'lista', itens: [[{ tipo: 'texto', texto: '09:00' }], [{ tipo: 'texto', texto: '10:30' }]] })
  })
})
