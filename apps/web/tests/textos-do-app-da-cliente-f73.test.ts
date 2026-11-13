import { describe, it, expect } from 'vitest'
import { textoDoRemarcado, textoDoParaAvaliar, textoDoHorarioNoHistorico } from '@/lib/clientes/textos-do-app'

/**
 * F73 — textos do app da cliente (A29, A30, A31 da 14ª simulação; princípio 3).
 */
describe('A29: o remarcado diz a unidade nova', () => {
  it('na mesma unidade, como antes', () => {
    expect(textoDoRemarcado({ quemAtende: 'Bianca', dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: null }))
      .toBe('Agendamento remarcado: com Bianca, terça-feira, 17/11 às 15:00.')
  })
  it('em outra unidade, diz qual e que é outro endereço', () => {
    expect(textoDoRemarcado({ quemAtende: 'Bianca', dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: 'Manacá Pampulha' }))
      .toBe('Agendamento remarcado: com Bianca, terça-feira, 17/11 às 15:00, na Manacá Pampulha (outro endereço).')
  })
  it('sem quem atende', () => {
    expect(textoDoRemarcado({ quemAtende: null, dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: null }))
      .toBe('Agendamento remarcado, terça-feira, 17/11 às 15:00.')
  })
})

describe('A30: o cartão "para avaliar" diz a hora e, com mais de uma unidade, onde', () => {
  const fuso = 'America/Sao_Paulo'
  it('com a hora real do concluído e a unidade', () => {
    expect(textoDoParaAvaliar({ agendadoEm: '2026-11-12T22:00:00Z', concluidoEm: '2026-11-12T21:11:00Z', unidade: 'Manacá Pampulha', fuso }))
      .toBe('Concluído em 12/11 às 18:11 · Manacá Pampulha · toque para avaliar')
  })
  it('sem a hora real (o de antes da coluna), a marcada', () => {
    expect(textoDoParaAvaliar({ agendadoEm: '2026-11-12T22:00:00Z', concluidoEm: null, unidade: null, fuso }))
      .toBe('Concluído em 12/11 às 19:00 · toque para avaliar')
  })
})

describe('A31: o histórico diz que a primeira hora é a marcada', () => {
  it('com a hora real, "marcado para"', () => {
    expect(textoDoHorarioNoHistorico('19:00', 'concluído às 18:11')).toBe('marcado para 19:00 · concluído às 18:11')
  })
  it('sem a hora real, só a hora', () => {
    expect(textoDoHorarioNoHistorico('19:00', null)).toBe('19:00')
  })
})
