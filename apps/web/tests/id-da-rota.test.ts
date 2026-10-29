import { describe, it, expect } from 'vitest'
import { ehUuid } from '@/lib/id-da-rota'

// D15 da simulação de 2026-10-29: o id da URL ia ao banco sem conferir, e
// "comissoes" em /agenda/[id] dava 22P02 — a tela de erro no lugar do 404.
describe('o id da rota', () => {
  it('aceita o uuid do Postgres, em qualquer caixa', () => {
    expect(ehUuid('0d6c1f3e-8a2b-4c7d-9e1f-2a3b4c5d6e7f')).toBe(true)
    expect(ehUuid('0D6C1F3E-8A2B-4C7D-9E1F-2A3B4C5D6E7F')).toBe(true)
    expect(ehUuid('00000000-0000-0000-0000-000000000000')).toBe(true)
  })
  it('recusa o que o Postgres recusaria (22P02)', () => {
    expect(ehUuid('comissoes')).toBe(false)
    expect(ehUuid('')).toBe(false)
    expect(ehUuid(undefined)).toBe(false)
    expect(ehUuid('0d6c1f3e-8a2b-4c7d-9e1f-2a3b4c5d6e7')).toBe(false)
    expect(ehUuid('0d6c1f3e-8a2b-4c7d-9e1f-2a3b4c5d6e7fa')).toBe(false)
    expect(ehUuid(' 0d6c1f3e-8a2b-4c7d-9e1f-2a3b4c5d6e7f')).toBe(false)
    expect(ehUuid('0d6c1f3e-8a2b-4c7d-9e1f-2a3b4c5d6e7g')).toBe(false)
  })
})
