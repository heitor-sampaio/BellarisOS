import { describe, it, expect } from 'vitest'
import { avisoDoAcessoCriado, avisoDaUnidadeDeCadastro } from '@/lib/clients/textos-do-cadastro'

/**
 * Os textos do cadastro da cliente (2026-10-30).
 *
 * J-22: quem JÁ tinha conta em outra clínica (o mesmo e-mail e CPF) tem a
 * ficha ligada à conta dela, com a senha que ela já usa (CLAUDE.md §5, "Dar
 * acesso a quem já tem conta") — e o aviso dizia "a senha inicial é o CPF".
 *
 * J-24: "o cliente pode ser atendido em qualquer unidade" enganava: a lista de
 * Clientes de cada unidade mostra só as cadastradas nela, e as outras a acham
 * pela busca do agendar.
 */
describe('avisoDoAcessoCriado', () => {
  it('login novo: o login é o e-mail e a senha inicial é o CPF', () => {
    const a = avisoDoAcessoCriado({ contaLigada: false, email: 'ana@x.com' })
    expect(a.titulo).toBe('Acesso ao app criado')
    expect(a.descricao).toMatch(/ana@x\.com/)
    expect(a.descricao).toMatch(/senha inicial é o CPF/)
  })
  it('conta que já existia: a ficha entra na conta, e a senha continua a mesma', () => {
    const a = avisoDoAcessoCriado({ contaLigada: true, email: 'ana@x.com' })
    expect(a.titulo).toBe('Ficha ligada à conta que já existe')
    expect(a.descricao).toMatch(/senha continua a mesma/)
    expect(a.descricao).not.toMatch(/CPF/)
  })
  // A20 da 6ª simulação: o aviso dizia "a cliente" e "Ela" para o Bruno. O que a
  // CLÍNICA diz é neutro (crm-inbox.md, "O portal fala com a pessoa pelo sexo").
  it('A20: o texto é neutro — nem "ela", nem "a cliente"', () => {
    for (const contaLigada of [false, true]) {
      const a = avisoDoAcessoCriado({ contaLigada, email: 'bruno@x.com' })
      expect(`${a.titulo} ${a.descricao}`).not.toMatch(/\bela\b|\bdela\b|a cliente/i)
    }
  })
})

describe('avisoDaUnidadeDeCadastro', () => {
  it('com outras unidades: diz onde ela aparece e como as outras a acham', () => {
    const t = avisoDaUnidadeDeCadastro(true)!
    expect(t).not.toMatch(/qualquer unidade/)
    expect(t).toMatch(/lista de Clientes desta unidade/)
    expect(t).toMatch(/busca do Agendar/)
  })
  it('numa clínica de uma unidade só, não há o que dizer (D-19)', () => {
    expect(avisoDaUnidadeDeCadastro(false)).toBeNull()
  })
})
