import { describe, it, expect } from 'vitest'
import { textoDoRemarcado, textoDoParaAvaliar, textoDoHorarioNoHistorico } from '@/lib/clientes/textos-do-app'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

/**
 * F73 — textos do app da cliente (A29, A30, A31 da 14ª simulação; princípio 3).
 */
// A12 da 19ª: o remarcado pelo app diz também como o horário novo fica — Agendado até ser
// confirmado (o Heitor, 25/11: "Ela já desmarcou uma vez, pode acabar desmarcando de novo,
// melhor reconfirmar."; era "fica confirmado", a H3).
describe('A29: o remarcado diz a unidade nova', () => {
  it('na mesma unidade, como antes', () => {
    expect(textoDoRemarcado({ quemAtende: 'Bianca', dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: null }))
      .toBe('Agendamento remarcado: com Bianca, terça-feira, 17/11 às 15:00. O horário novo fica como Agendado até ser confirmado.')
  })
  it('em outra unidade, diz qual e que é outro endereço', () => {
    expect(textoDoRemarcado({ quemAtende: 'Bianca', dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: 'Manacá Pampulha' }))
      .toBe('Agendamento remarcado: com Bianca, terça-feira, 17/11 às 15:00, na Manacá Pampulha (outro endereço). O horário novo fica como Agendado até ser confirmado.')
  })
  it('sem quem atende', () => {
    expect(textoDoRemarcado({ quemAtende: null, dia: 'terça-feira, 17/11', hora: '15:00', unidadeNova: null }))
      .toBe('Agendamento remarcado, terça-feira, 17/11 às 15:00. O horário novo fica como Agendado até ser confirmado.')
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

describe('o Perfil do app mostra o documento que a cliente tem (o CPF, ou o passaporte ou o RNE — a senha inicial dela)', () => {
  const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

  describe('o documento do Perfil', () => {
    it('com CPF, o CPF; sem CPF, o passaporte ou o RNE (a senha inicial dela); sem nada, o traço', async () => {
      const { documentoDoPerfil } = await import('@/lib/clientes/textos-do-app')
      expect(documentoDoPerfil({ document: '12345678901' })).toEqual({ rotulo: 'CPF', valor: '123.456.789-01' })
      expect(documentoDoPerfil({ document: null, documento_tipo: 'PASSAPORTE', documento_numero: '19FR54321' })).toEqual({ rotulo: 'Passaporte', valor: '19FR54321' })
      expect(documentoDoPerfil({ document: null, documento_tipo: 'RNE', documento_numero: 'V123456-7' })).toEqual({ rotulo: 'RNE', valor: 'V123456-7' })
      expect(documentoDoPerfil({ document: null })).toEqual({ rotulo: 'CPF', valor: '—' })
    })
    it('a página lê o documento estrangeiro e usa a regra', () => {
      const f = ler('app/[slug]/cliente/perfil/page.tsx')
      expect(f).toMatch(/documento_tipo, documento_numero/)
      expect(f).toMatch(/documentoDoPerfil\(client\)/)
    })
  })

})
