import { describe, it, expect } from 'vitest'
import { avisoDaTaxaQueBaixa } from '@/lib/financeiro/bandeiras'

// A2 da 8ª simulação: a tabela com mais vezes mais barata avisa, sem recusar.
describe('avisoDaTaxaQueBaixa', () => {
  it('avisa a primeira vez que a taxa baixa', () => {
    expect(avisoDaTaxaQueBaixa([{ parcelas: 2, taxa: 1.98 }, { parcelas: 1, taxa: 2.8 }]))
      .toMatch(/^2x \(1,98%\) sai mais barato que o crédito à vista \(2,80%\)/)
    expect(avisoDaTaxaQueBaixa([{ parcelas: 1, taxa: 2 }, { parcelas: 3, taxa: 5 }, { parcelas: 6, taxa: 4.5 }]))
      .toMatch(/^6x \(4,50%\) sai mais barato que 3x \(5,00%\)/)
  })
  it('a tabela que só sobe (ou fica igual) não avisa', () => {
    expect(avisoDaTaxaQueBaixa([{ parcelas: 1, taxa: 2.99 }, { parcelas: 2, taxa: 4.09 }, { parcelas: 3, taxa: 4.09 }])).toBeNull()
    expect(avisoDaTaxaQueBaixa([])).toBeNull()
  })
})
