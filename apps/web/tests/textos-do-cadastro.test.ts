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
  // Decisão 1 do Heitor (7ª simulação, 2026-11-05): sem CPF, a senha inicial é
  // o número do documento da ficha (passaporte, RNE), e o aviso diz qual é.
  it('decisão 1: sem CPF, a senha inicial é o número do passaporte (ou do RNE), dito no aviso', () => {
    const a = avisoDoAcessoCriado({ contaLigada: false, email: 'sophie@x.com', documento: { tipo: 'PASSAPORTE', numero: '19FR54321' } })
    expect(a.titulo).toBe('Acesso ao app criado')
    expect(a.descricao).toBe('O login é o e-mail (sophie@x.com) e a senha inicial é o número do passaporte, 19FR54321 (em maiúsculas), trocada no primeiro acesso.')
    const r = avisoDoAcessoCriado({ contaLigada: false, email: 'x@x.com', documento: { tipo: 'RNE', numero: 'V123456-7' } })
    expect(r.descricao).toMatch(/senha inicial é o número do RNE, V123456-7/)
    expect(avisoDoAcessoCriado({ contaLigada: false, email: 'x@x.com', documento: { tipo: 'CPF', numero: '52998224725' } }).descricao)
      .toMatch(/senha inicial é o CPF, trocada/)
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
  // CL3 do Bloco Tags (2026-11-14): a lista de toda unidade mostra a cliente.
  it('com outras unidades: diz que a cliente é da rede e aparece em todas', () => {
    const t = avisoDaUnidadeDeCadastro(true)!
    expect(t).toMatch(/é da rede/)
    expect(t).toMatch(/todas as unidades/)
    expect(t).not.toMatch(/desta unidade|busca do Agendar/)
  })
  it('numa clínica de uma unidade só, não há o que dizer (D-19)', () => {
    expect(avisoDaUnidadeDeCadastro(false)).toBeNull()
  })
})
