import { describe, it, expect } from 'vitest'
import { ehMenorDeIdade, quemAssina, avisoDoMenor, responsavelDaFicha } from '@/lib/clients/menor'
import { valoresDoDocumento, type DadosDoDocumento } from '@/lib/documentos/valores'
import { variavelObrigatoria, ehOpcional, VARIAVEIS_DE_DOCUMENTO } from '@/lib/documentos/variaveis'

/**
 * Decisão 2 do Heitor (7ª simulação, 2026-11-05: "concordo"): a menor de
 * idade (a Beatriz, 16 anos) não tinha responsável legal — a recepção
 * escreveu o nome da mãe nas Anotações. Com `idadeEm` < 18, a ficha pede o
 * "Responsável legal" (nome, CPF, parentesco, telefone), a agenda e o
 * atendimento mostram "Menor", e o termo ganha as variáveis do responsável e
 * é assinado por ele. Avisar, não barrar (princípio 2).
 */
const hoje = new Date('2026-11-05T15:00:00Z')

describe('a menor de idade', () => {
  it('menor é quem tem menos de 18 anos no dia de hoje (Brasília); sem nascimento, não se sabe', () => {
    expect(ehMenorDeIdade('2010-03-14', hoje)).toBe(true)
    expect(ehMenorDeIdade('2008-11-05', hoje), '18 anos hoje').toBe(false)
    expect(ehMenorDeIdade('2008-11-06', hoje), 'faz 18 amanhã').toBe(true)
    expect(ehMenorDeIdade(null, hoje)).toBe(false)
  })

  it('o responsável da ficha: os quatro campos, limpos; sem nome, não há responsável', () => {
    expect(responsavelDaFicha({ responsavel_nome: ' Marta Lima ', responsavel_cpf: '529.982.247-25', responsavel_parentesco: 'Mãe', responsavel_telefone: '(71) 99999-0000' }))
      .toEqual({ nome: 'Marta Lima', cpf: '52998224725', parentesco: 'Mãe', telefone: '(71) 99999-0000' })
    expect(responsavelDaFicha({ responsavel_nome: '  ', responsavel_cpf: '52998224725' })).toBeNull()
  })

  it('quem assina: a menor com responsável é assinada por ele; a adulta, por ela', () => {
    const resp = { nome: 'Marta Lima', cpf: '52998224725', parentesco: 'Mãe', telefone: null }
    expect(quemAssina({ nome: 'Beatriz Lima', nascimento: '2010-03-14', responsavel: resp }, hoje))
      .toEqual({ nome: 'Marta Lima, responsável legal de Beatriz Lima', documento: '52998224725', ehResponsavel: true })
    expect(quemAssina({ nome: 'Beatriz Lima', nascimento: '2010-03-14', responsavel: null }, hoje))
      .toEqual({ nome: 'Beatriz Lima', documento: null, ehResponsavel: false })
    expect(quemAssina({ nome: 'Ana', nascimento: '1990-01-01', responsavel: resp }, hoje), 'adulta assina por si')
      .toEqual({ nome: 'Ana', documento: null, ehResponsavel: false })
  })

  it('o aviso: menor sem responsável avisa (e diz a idade); com responsável ou adulta, nada', () => {
    expect(avisoDoMenor({ nascimento: '2010-03-14', responsavel: null }, hoje))
      .toBe('Menor de idade (16 anos), sem responsável legal no cadastro. Cadastre o responsável na aba Dados: é ele quem assina o termo.')
    expect(avisoDoMenor({ nascimento: '2010-03-14', responsavel: { nome: 'Marta', cpf: null, parentesco: null, telefone: null } }, hoje)).toBeNull()
    expect(avisoDoMenor({ nascimento: '1990-03-14', responsavel: null }, hoje)).toBeNull()
  })
})

describe('as variáveis do responsável no termo', () => {
  const cliente: DadosDoDocumento['cliente'] = {
    name: 'Beatriz Lima', document: null, birth_date: '2010-03-14', phone: '71999990000', email: null,
    zip_code: null, address: null, address_number: null, address_complement: null, neighborhood: null, city: null, state: null,
    responsavel_nome: 'Marta Lima', responsavel_cpf: '52998224725', responsavel_parentesco: 'Mãe', responsavel_telefone: '71988887777',
  }
  const base = { agora: hoje, rede: { name: 'Rede', document: null, phone: null, email: null }, unidade: null, procedimento: { name: 'Toxina' }, agendamento: null }

  it('existem no catálogo, em todo tipo de modelo, no grupo "Responsável legal"', () => {
    for (const v of ['responsavel.nome', 'responsavel.cpf', 'responsavel.parentesco', 'responsavel.telefone'] as const) {
      expect(VARIAVEIS_DE_DOCUMENTO[v].grupo).toBe('Responsável legal')
      expect(VARIAVEIS_DE_DOCUMENTO[v].tipos).toEqual(['TERMO', 'CONTRATO', 'CONTRATO_PLANO', 'CONTRATO_PACOTE', 'DOCUMENTO'])
    }
  })

  it('saem formatadas da ficha', () => {
    const v = valoresDoDocumento({ ...base, cliente })
    expect(v['responsavel.nome']).toBe('Marta Lima')
    expect(v['responsavel.cpf']).toBe('529.982.247-25')
    expect(v['responsavel.parentesco']).toBe('Mãe')
    expect(v['responsavel.telefone']).toBe('(71) 98888-7777')
  })

  it('na adulta, são opcionais (saem vazias); na menor, o nome e o CPF do responsável são obrigatórios', () => {
    expect(ehOpcional('responsavel.nome')).toBe(true)
    expect(variavelObrigatoria('responsavel.nome', { menor: false })).toBe(false)
    expect(variavelObrigatoria('responsavel.nome', { menor: true })).toBe(true)
    expect(variavelObrigatoria('responsavel.cpf', { menor: true })).toBe(true)
    expect(variavelObrigatoria('responsavel.telefone', { menor: true })).toBe(false)
    expect(variavelObrigatoria('cliente.nome', { menor: false }), 'as outras seguem o catálogo').toBe(true)
    expect(variavelObrigatoria('cliente.email', { menor: true })).toBe(false)
  })
})
