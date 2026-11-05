import { describe, it, expect } from 'vitest'
import { documentoDoCadastroDoCopilot } from '@/lib/copilot/ferramentas/documento-do-cadastro'

// Sobra da F29 (decisão 1 do Heitor, 7ª simulação): o "cadastrar_cliente" do
// Copilot aceita passaporte/RNE no lugar do CPF, como o cadastro da tela
// (`documentoDaFicha`), e o acesso ao app sai com ele (a senha inicial).

describe('documentoDoCadastroDoCopilot', () => {
  it('o CPF segue como antes', () => {
    expect(documentoDoCadastroDoCopilot({ cpf: '529.982.247-25' }))
      .toEqual({ colunas: { document: '52998224725', documento_tipo: null, documento_numero: null }, acesso: { tipo: 'CPF', numero: '52998224725' } })
  })
  it('o passaporte e o RNE vão às colunas deles, e dão o acesso', () => {
    expect(documentoDoCadastroDoCopilot({ passaporte: ' 19fr54321 ' }))
      .toEqual({ colunas: { document: null, documento_tipo: 'PASSAPORTE', documento_numero: '19FR54321' }, acesso: { tipo: 'PASSAPORTE', numero: '19FR54321' } })
    expect(documentoDoCadastroDoCopilot({ rne: 'V123456-7' }))
      .toMatchObject({ colunas: { documento_tipo: 'RNE' }, acesso: { tipo: 'RNE' } })
  })
  it('sem documento, nada; dois documentos ou um inválido, a recusa', () => {
    expect(documentoDoCadastroDoCopilot({})).toEqual({ colunas: null, acesso: null })
    expect(documentoDoCadastroDoCopilot({ cpf: '52998224725', passaporte: 'FR123456' })).toEqual({ erro: 'Informe um documento só: o CPF, o passaporte ou o RNE.' })
    expect(documentoDoCadastroDoCopilot({ cpf: '111.111.111-11' })).toEqual({ erro: 'CPF inválido.' })
    expect('erro' in documentoDoCadastroDoCopilot({ passaporte: '!!' })).toBe(true)
  })
})
