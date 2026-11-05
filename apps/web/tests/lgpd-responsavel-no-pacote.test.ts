import { describe, it, expect } from 'vitest'
import { responsavelNoPacote, documentoNoPacote } from '@/lib/lgpd/responsavel'

// Sobra da F29 (decisão 2 do Heitor, 7ª simulação): o pacote da LGPD não
// levava o responsável legal gravado na ficha da menor (`clients.responsavel_*`).
describe('o responsável legal no pacote da LGPD', () => {
  it('com o responsável: o JSON e a linha do PDF', () => {
    const r = responsavelNoPacote({
      responsavel_nome: ' Marta Lima ', responsavel_cpf: '52998224725', responsavel_parentesco: 'Mãe', responsavel_telefone: '(71) 98888-7777',
    })
    expect(r.json).toEqual({ nome: 'Marta Lima', cpf: '529.982.247-25', parentesco: 'Mãe', telefone: '(71) 98888-7777' })
    expect(r.linha).toBe('Marta Lima (Mãe) · CPF 529.982.247-25 · (71) 98888-7777')
  })
  it('sem o nome, não há responsável', () => {
    expect(responsavelNoPacote({ responsavel_nome: '', responsavel_cpf: '52998224725' })).toEqual({ json: null, linha: null })
  })
  it('só o nome: o resto sai nulo, e a linha diz só o nome', () => {
    expect(responsavelNoPacote({ responsavel_nome: 'João' })).toEqual({ json: { nome: 'João', cpf: null, parentesco: null, telefone: null }, linha: 'João' })
  })
})

describe('o documento da estrangeira no pacote', () => {
  it('passaporte e RNE dizem o tipo; sem número, nada', () => {
    expect(documentoNoPacote({ documento_tipo: 'PASSAPORTE', documento_numero: '19FR54321' })).toBe('Passaporte 19FR54321')
    expect(documentoNoPacote({ documento_tipo: 'RNE', documento_numero: 'V123456-7' })).toBe('RNE V123456-7')
    expect(documentoNoPacote({ documento_tipo: null, documento_numero: null })).toBeNull()
  })
})
