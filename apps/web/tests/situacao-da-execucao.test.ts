import { describe, it, expect } from 'vitest'
import { situacaoDaExecucao } from '@/lib/plano-de-tratamento/situacao'

// A22 da 6ª simulação: a ficha de tratamento dizia "FECHADO" com 0 de 2 sessões feitas.
describe('a situação da EXECUÇÃO do tratamento', () => {
  it('fechado no checkout: a começar, em andamento ou concluído, pelas sessões feitas', () => {
    expect(situacaoDaExecucao('ACCEPTED', 0, 2).label).toBe('A começar · 0 de 2 sessões')
    expect(situacaoDaExecucao('ACCEPTED', 1, 2).label).toBe('Em andamento · 1 de 2 sessões')
    expect(situacaoDaExecucao('ACCEPTED', 2, 2).label).toBe('Concluído · 2 de 2 sessões')
    expect(situacaoDaExecucao('ACCEPTED', 0, 1).label).toBe('A começar · 0 de 1 sessão')
  })
  it('os outros estados são os do plano', () => {
    expect(situacaoDaExecucao('CANCELLED', 0, 2).label).toBe('Cancelado')
    expect(situacaoDaExecucao('PROPOSED', 0, 2).label).toBe('Proposto')
  })
})
