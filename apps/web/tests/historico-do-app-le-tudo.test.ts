import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * CLAUDE.md §14: "Ler uma LISTA que cresce sem paginar (lerTodas)". O Histórico do app da cliente lia os
 * atendimentos e os pagamentos com `.limit(50)` e os documentos com `.limit(30)`: a cliente antiga perdia os
 * mais velhos em silêncio, e as duas formas de uma parcela (CR-07) podiam cair dos dois lados do corte
 * (achado da área V na correção da 36ª simulação).
 */
describe('o Histórico do app lê as listas inteiras', () => {
  const s = readFileSync(path.join(__dirname, '..', 'app', '[slug]', 'cliente', 'historico', 'page.tsx'), 'utf8')

  it('sem .limit( nas listas', () => {
    expect(s).not.toMatch(/\.limit\(\d+\)/)
  })

  it.each(['carregar os atendimentos', 'carregar os pagamentos', 'carregar os documentos'])('%s pagina por lerTodas', oQue => {
    expect(s).toMatch(new RegExp(`lerTodas\\(\\(de, ate\\) => admin\\.from\\([\\s\\S]*?\\.range\\(de, ate\\), '${oQue}'\\)`))
  })
})
