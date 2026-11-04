import { describe, it, expect } from 'vitest'
import { nomeDosProcedimentos, nomeDaSessao } from '@/lib/plano-de-tratamento/nome'

// A36 da 6ª simulação: "Botox + 1 mais" e a sessão só "Botox".
describe('o nome da sessão e do plano pelos procedimentos', () => {
  it('todos, na ordem, sem repetir; depois de três, "+ N mais"', () => {
    expect(nomeDosProcedimentos(['Botox', 'Preenchimento'])).toBe('Botox + Preenchimento')
    expect(nomeDosProcedimentos(['Botox', 'Botox', ' '])).toBe('Botox')
    expect(nomeDosProcedimentos(['A', 'B', 'C', 'D', 'E'])).toBe('A + B + C + 2 mais')
    expect(nomeDosProcedimentos([])).toBeNull()
  })
  it('a sessão segue a ordem dela', () => {
    expect(nomeDaSessao([
      { sort_order: 1, procedures: { name: 'Preenchimento' } }, { sort_order: 0, procedures: { name: 'Botox' } },
    ])).toBe('Botox + Preenchimento')
  })
})
