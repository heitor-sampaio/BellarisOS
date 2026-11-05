import { describe, it, expect } from 'vitest'
import { textoDasOpcoes, validateFormSchema } from '@/lib/anamnesis'

/**
 * A4 da 7ª simulação (2026-11-05): o construtor pedia "Opções" para o
 * planejador de injetáveis sem dizer que são os PRODUTOS do mapa — e a recusa
 * "precisa de ao menos uma opção" deixava a Rita e a Tânia sem saber o quê.
 */
describe('as opções do planejador de injetáveis são os produtos do mapa', () => {
  it('o construtor chama de "Produtos do mapa" e diz para que servem', () => {
    const t = textoDasOpcoes('injectable_map')
    expect(t.titulo).toBe('Produtos do mapa')
    expect(t.ajuda).toContain('os produtos que o planejador oferece')
    expect(t.adicionar).toBe('Adicionar produto')
    expect(t.exemplo(1)).toContain('Botox')
  })

  it('os outros campos seguem com "Opções"', () => {
    expect(textoDasOpcoes('select').titulo).toBe('Opções')
    expect(textoDasOpcoes('radio').adicionar).toBe('Adicionar opção')
  })

  it('a recusa do planejador sem produto diz o que falta', () => {
    const erro = validateFormSchema({ rows: [{ id: 'r', fields: [{ id: 'f', type: 'injectable_map', label: 'Mapa', required: false, options: [] }] }] })
    expect(erro).toBe('O planejador "Mapa" precisa de ao menos um produto do mapa (ex.: Botox 100 UI).')
  })
})
