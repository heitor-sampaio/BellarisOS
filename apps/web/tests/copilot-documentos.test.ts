import { describe, expect, it } from 'vitest'
import { textoDoDocx, textoDaPlanilha, ErroDoDocumento } from '@/lib/copilot/documentos'
import { docx, xlsx, zipar } from '../e2e/apoio/zip'

/**
 * docx e xlsx viram TEXTO no servidor (2026-10-08): o modelo não lê o
 * arquivo do Office, e "mande em PDF" era a dívida. Sem biblioteca: o docx e o
 * xlsx são um zip de XML.
 */
describe('textoDoDocx', () => {
  it('um parágrafo por linha, com o texto escapado de volta', () => {
    expect(textoDoDocx(docx(['Ficha da cliente', 'Nome: Maria & Filhos', 'Telefone: 48 99999-0000'])))
      .toBe('Ficha da cliente\nNome: Maria & Filhos\nTelefone: 48 99999-0000')
  })
  it('zip sem o documento do Word: recusa com a frase para a pessoa', () => {
    expect(() => textoDoDocx(zipar({ 'outro.xml': '<a/>' }))).toThrow(ErroDoDocumento)
  })
  it('o que não é zip: recusa', () => {
    expect(() => textoDoDocx(Buffer.from('não sou um zip'))).toThrow(ErroDoDocumento)
  })
})

describe('textoDaPlanilha', () => {
  it('as linhas da aba, com as colunas separadas por ";" e o nome da aba', () => {
    const t = textoDaPlanilha(xlsx([['Nome', 'Telefone', 'Pontos'], ['Maria', '48999990000', 120], ['Ana', '48988880000', 30]]))
    expect(t).toBe('# Clientes\nNome;Telefone;Pontos\nMaria;48999990000;120\nAna;48988880000;30')
  })
  it('o texto muito longo é cortado, avisando', () => {
    const linhas = Array.from({ length: 5000 }, (_, i) => [`Linha ${i}`, 'x'.repeat(30)])
    const t = textoDaPlanilha(xlsx(linhas))
    expect(t.length).toBeLessThan(20_000)
    expect(t).toContain('(cortado:')
  })
})
