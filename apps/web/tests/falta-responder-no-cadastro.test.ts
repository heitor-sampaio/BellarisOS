import { describe, it, expect } from 'vitest'
import { oQueFaltaResponder } from '@/lib/clients/textos-do-cadastro'

/**
 * F73 (D5 da 14ª simulação; princípio 3): o rodapé do "Cadastrar" repete a
 * pergunta que está NA TELA — os botões com o nome que eles têm, e só os que
 * aparecem. Pelo CPF não existe "Cadastrar mesmo assim" (o CPF é único), e o
 * rodapé mandava clicar nele.
 */
describe('o que falta responder repete a pergunta da tela', () => {
  it('já existe pelo telefone: os dois botões, com o nome da ficha', () => {
    const t = oQueFaltaResponder({ tipo: 'jaExiste', nome: 'Ana', motivo: 'TELEFONE', podeCadastrarMesmoAssim: true })
    expect(t).toContain('já existe a ficha de Ana com este telefone')
    expect(t).toContain('“Cadastrar mesmo assim”')
    expect(t).toContain('“Unificar com a ficha de Ana”')
  })

  it('já existe pelo CPF: sem o "Cadastrar mesmo assim", que a tela não mostra', () => {
    const t = oQueFaltaResponder({ tipo: 'jaExiste', nome: 'Ana', motivo: 'CPF', podeCadastrarMesmoAssim: false })
    expect(t).toContain('com este CPF')
    expect(t).toContain('o CPF é único na clínica')
    expect(t).toContain('“Unificar com a ficha de Ana”')
    expect(t).not.toContain('Cadastrar mesmo assim')
  })

  it('já existe pelo nome e nascimento', () => {
    const t = oQueFaltaResponder({ tipo: 'jaExiste', nome: 'Ana', motivo: 'NOME_E_NASCIMENTO', podeCadastrarMesmoAssim: true })
    expect(t).toContain('com este nome e esta data de nascimento')
  })

  it('a arquivada: os botões como estão na tela', () => {
    const t = oQueFaltaResponder({ tipo: 'arquivada', nome: 'Bia' })
    expect(t).toContain('“Reativar a ficha de Bia”')
    expect(t).toContain('“É outra pessoa”')
  })

  it('o lead e o contato: "Sim, é a mesma pessoa" ou "Não, é outra pessoa"', () => {
    const lead = oQueFaltaResponder({ tipo: 'lead', nome: 'Carla', ehLead: true })
    expect(lead).toMatch(/^Responda antes de cadastrar: é a mesma pessoa do lead Carla\?/)
    expect(lead).toContain('“Sim, é a mesma pessoa”')
    expect(lead).toContain('“Não, é outra pessoa”')
    expect(oQueFaltaResponder({ tipo: 'lead', nome: 'Carla', ehLead: false })).toContain('do contato Carla?')
  })

  it('a do CPF e a do nascimento dizem o campo delas', () => {
    expect(oQueFaltaResponder({ tipo: 'jaExiste', nome: 'Ana', motivo: 'CPF', podeCadastrarMesmoAssim: false })).toContain('logo abaixo do CPF')
    expect(oQueFaltaResponder({ tipo: 'jaExiste', nome: 'Ana', motivo: 'NOME_E_NASCIMENTO', podeCadastrarMesmoAssim: true })).toContain('logo abaixo da data de nascimento')
  })

  it('diz onde a pergunta está: logo abaixo do telefone e do e-mail', () => {
    for (const t of [
      oQueFaltaResponder({ tipo: 'jaExiste', nome: 'Ana', motivo: 'TELEFONE', podeCadastrarMesmoAssim: true }),
      oQueFaltaResponder({ tipo: 'arquivada', nome: 'Bia' }),
      oQueFaltaResponder({ tipo: 'lead', nome: 'Carla', ehLead: true }),
    ]) expect(t).toContain('logo abaixo do telefone e do e-mail')
  })
})
