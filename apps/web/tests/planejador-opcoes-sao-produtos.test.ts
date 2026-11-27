import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateFormSchema, normalizeFormSchema, OPTION_TYPES, faltaDeOpcoes } from '@/lib/anamnesis'

/**
 * O planejador de injetáveis não tem lista de produtos na ficha (o Heitor,
 * 27/11: "O mapa usa sempre o estoque, e a ficha não pede mais a lista (a
 * proposta)"). Até aqui (A4 da 7ª simulação, 2026-11-05) o construtor pedia
 * "Produtos do mapa" e recusava o planejador sem nenhum ("precisa de ao menos
 * um produto do mapa"); a lista só valia quando a unidade não tinha produto no
 * estoque. Agora o mapa oferece sempre os produtos do estoque, e a ficha antiga
 * com a lista gravada não quebra: a lista é ignorada.
 */
describe('o planejador de injetáveis usa sempre o estoque', () => {
  it('o planejador não tem opções: o construtor não pede "Produtos do mapa"', () => {
    expect(OPTION_TYPES).not.toContain('injectable_map')
    const construtor = readFileSync(join(__dirname, '..', 'components/admin/construtor-de-ficha.tsx'), 'utf8')
    expect(construtor).not.toContain('Produtos do mapa')
  })

  it('os outros campos seguem com "Opções"', () => {
    const construtor = readFileSync(join(__dirname, '..', 'components/admin/construtor-de-ficha.tsx'), 'utf8')
    expect(construtor).toContain('Adicionar opção')
    expect(OPTION_TYPES).toEqual(['select', 'radio', 'checkbox'])
    expect(faltaDeOpcoes({ label: 'Fototipo' })).toBe('O campo "Fototipo" precisa de ao menos uma opção.')
  })

  it('a ficha com o planejador sem produto é aceita', () => {
    expect(validateFormSchema({ rows: [{ id: 'r', fields: [{ id: 'f', type: 'injectable_map', label: 'Mapa', required: false }] }] })).toBeNull()
  })

  it('a ficha antiga com a lista gravada não quebra: a lista é ignorada', () => {
    const s = normalizeFormSchema({ rows: [{ fields: [{ id: 'f', type: 'injectable_map', label: 'Mapa', options: ['Botox 100 UI'] }] }] })
    expect(s.rows[0]!.fields[0]).toEqual({ id: 'f', type: 'injectable_map', label: 'Mapa' })
    expect(validateFormSchema(s)).toBeNull()
  })

  it('o mapa da ficha não lê a lista do campo', () => {
    const renderer = readFileSync(join(__dirname, '..', 'components/branch/anamnesis-form-renderer.tsx'), 'utf8')
    expect(renderer).not.toMatch(/products=\{.*f\.options/)
    expect(renderer).not.toMatch(/produtos=\{.*f\.options/)
  })
})
