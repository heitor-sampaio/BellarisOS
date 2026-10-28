import { describe, it, expect } from 'vitest'
import { DEFAULT_STAGES } from '@/lib/crm'

/**
 * O funil que a rede NOVA recebe (2026-10-21, decisão do Heitor): entra "Em
 * negociação" entre a avaliação e o agendamento — é onde o orçamento do
 * tratamento fica sendo conversado. As redes que já existem não mudam.
 */
describe('o funil padrão da rede nova', () => {
  it('tem "Em negociação" depois da avaliação e antes do agendado', () => {
    expect(DEFAULT_STAGES.map(s => s.name)).toEqual([
      'Novo', 'Em contato', 'Avaliação', 'Em negociação', 'Agendado', 'Fechado', 'Perdido',
    ])
    expect(DEFAULT_STAGES.find(s => s.name === 'Em negociação')?.outcome).toBe('OPEN')
  })
})

describe('a etapa de agendado do funil padrão', () => {
  it('leva a marca AGENDADO — o código acha a etapa por ela, não pelo nome (A12)', () => {
    expect(DEFAULT_STAGES.filter(s => s.marca === 'AGENDADO').map(s => s.name)).toEqual(['Agendado'])
  })
})
