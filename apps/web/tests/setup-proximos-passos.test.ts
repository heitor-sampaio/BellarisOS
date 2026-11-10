import { describe, it, expect } from 'vitest'
import { PROXIMOS_PASSOS } from '@/lib/setup/proximos-passos'

// A2 da 10ª simulação (2026-11-10): a dona que atende sozinha terminava o setup
// e lia como PRIMEIRO passo "Outra unidade (se houver)" — o imposto da
// multiunidade na clínica única (CLAUDE.md §1: otimize para a clínica de uma
// unidade, sem tornar a segunda impossível). A segunda unidade vai para o fim,
// dizendo o que fazer depois dela (marcar na Equipe quem atende lá).
describe('os próximos passos do setup começam pela clínica de uma unidade (A2 da 10ª)', () => {
  it('o primeiro passo é a Equipe', () => expect(PROXIMOS_PASSOS[0]!.titulo).toBe('Equipe'))
  it('a outra unidade é o último, e diz o que fazer na Equipe', () => {
    const ultimo = PROXIMOS_PASSOS[PROXIMOS_PASSOS.length - 1]!
    expect(ultimo.titulo).toMatch(/^Outra unidade/)
    expect(ultimo.porque).toMatch(/Equipe/)
  })
})
