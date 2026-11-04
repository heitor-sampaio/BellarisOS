import { describe, it, expect } from 'vitest'
import { rankingDasAvaliacoes } from '@/lib/metrics/resultado'

/**
 * D11 da 6ª simulação (2026-11-04; princípio 3, nada de regra escondida): as
 * avaliações só entravam no dashboard a partir de 3 notas (`MIN_RATINGS = 3`,
 * na página), e o vazio dizia "Sem avaliações no período" com notas gravadas —
 * a Carla deu 4 estrelas à Nina, a Paula deu Botox 4 e Preenchimento 3, e
 * nenhuma tela mostrava. A conta mora em lib/metrics: entra com UMA nota, e a
 * tela diz quantas ("1 aval.").
 */
describe('rankingDasAvaliacoes', () => {
  it('uma nota só já entra', () => {
    const r = rankingDasAvaliacoes([{ name: 'Nina', avgRating: 4, ratingCount: 1 }])
    expect(r.melhores).toEqual([{ name: 'Nina', avgRating: 4, count: 1 }])
  })

  it('quem não tem nota não entra', () => {
    const r = rankingDasAvaliacoes([{ name: 'Renata', avgRating: null, ratingCount: 0 }])
    expect(r).toEqual({ melhores: [], piores: [], avaliados: 0 })
  })

  it('o pior não repete o que já está entre os melhores', () => {
    const r = rankingDasAvaliacoes([
      { name: 'Botox', avgRating: 4, ratingCount: 2 },
      { name: 'Preenchimento', avgRating: 3, ratingCount: 1 },
    ])
    expect(r.melhores.map(p => p.name)).toEqual(['Botox', 'Preenchimento'])
    expect(r.piores).toEqual([])
    expect(r.avaliados).toBe(2)
  })

  it('com mais de cinco, os cinco piores ficam fora dos cinco melhores; no empate, a de mais notas na frente', () => {
    const lista = [5, 4.9, 4.8, 4.7, 4.6, 4.5, 4.4, 3].map((n, i) => ({ name: `P${i}`, avgRating: n, ratingCount: 1 }))
    lista.push({ name: 'P-empate', avgRating: 5, ratingCount: 7 })
    const r = rankingDasAvaliacoes(lista)
    expect(r.melhores.map(p => p.name)).toEqual(['P-empate', 'P0', 'P1', 'P2', 'P3'])
    expect(r.piores.map(p => p.name)).toEqual(['P7', 'P6', 'P5', 'P4'])
  })
})
