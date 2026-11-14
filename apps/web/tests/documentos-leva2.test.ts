import { describe, expect, it } from 'vitest'
import { valoresDoDocumento, validadeDoPacote, type DadosDoDocumento } from '@/lib/documentos/valores'
import { textoDoAceite, listaDeTitulos } from '@/lib/documentos/aceite'
import { documentosPuxadosDoPacote } from '@/lib/pacotes/documentos'

/**
 * Bloco Documentos, leva 2 (2026-11-14):
 * - DC3: uma assinatura para todos — o aceite diz os títulos de cada documento.
 * - PC2: o contrato de pacote preenchido pela venda (`pacote.*`).
 * - DC1c/PC9b: o pop-up do pacote puxa o termo e os outros documentos dos
 *   procedimentos distintos (o contrato do procedimento não), cada um com excluir.
 */

const base: DadosDoDocumento = {
  agora: new Date('2026-11-14T15:00:00Z'),
  cliente: {
    name: 'Marina Torres', document: '52998224725', birth_date: '1990-03-14', phone: null, email: null,
    zip_code: null, address: null, address_number: null, address_complement: null, neighborhood: null, city: null, state: null,
  },
  rede: { name: 'Rede', document: null, phone: null, email: null }, unidade: null, procedimento: null, agendamento: null,
}

describe('DC3: o aceite de uma assinatura para todos', () => {
  it('um documento: a frase de sempre', () => {
    expect(textoDoAceite('Ana Lima', ['Termo de toxina'])).toBe('Eu, Ana Lima, li e concordo com este documento.')
  })

  it('vários: a frase diz o título de cada um', () => {
    expect(listaDeTitulos(['A', 'B'])).toBe('A e B')
    expect(textoDoAceite('Ana Lima', ['Termo de toxina', 'Contrato de pacote', 'Uso de imagem']))
      .toBe('Eu, Ana Lima, li e concordo com os documentos: Termo de toxina, Contrato de pacote e Uso de imagem.')
  })
})

describe('PC2: as variáveis do pacote vendido', () => {
  it('os procedimentos com as sessões de cada um, o número de sessões, a validade e o total', () => {
    const v = valoresDoDocumento({
      ...base,
      pacote: {
        nome: 'Pacote Verão', sessoes: 7, total: 1800,
        itens: [{ nome: 'Drenagem linfática', sessoes: 6 }, { nome: 'Massagem', sessoes: 1 }],
        validade: '180 dias, até 13/05/2027',
      },
    })
    expect(v['pacote.nome']).toBe('Pacote Verão')
    expect(v['pacote.procedimentos']).toBe('Drenagem linfática — 6 sessões; Massagem — 1 sessão')
    expect(v['pacote.sessoes']).toBe('7')
    expect(v['pacote.validade']).toBe('180 dias, até 13/05/2027')
    expect(v['pacote.total']).toMatch(/^R\$\s1\.800,00$/)
  })

  it('fora do pacote, as variáveis do pacote não têm valor', () => {
    expect(valoresDoDocumento(base)['pacote.nome']).toBeNull()
  })

  it('a validade diz os dias e o último dia, no fuso — e "sem prazo de validade" no pacote sem validade', () => {
    expect(validadeDoPacote(180, '2027-05-14T02:59:59Z', 'America/Sao_Paulo')).toBe('180 dias, até 13/05/2027')
    expect(validadeDoPacote(1, '2026-11-15T12:00:00Z', 'America/Sao_Paulo')).toBe('1 dia, até 15/11/2026')
    expect(validadeDoPacote(null, null, 'America/Sao_Paulo')).toBe('sem prazo de validade')
  })
})

describe('DC1c/PC9b: os documentos que o pacote puxa dos procedimentos', () => {
  const modelos = [
    { id: 't1', nome: 'Termo da toxina', tipo: 'TERMO' as const },
    { id: 't2', nome: 'Termo da massagem', tipo: 'TERMO' as const },
    { id: 'c1', nome: 'Contrato da toxina', tipo: 'CONTRATO' as const },
    { id: 'd1', nome: 'Uso de imagem', tipo: 'DOCUMENTO' as const },
  ]
  const procedimentos = [
    { id: 'p1', nome: 'Toxina', termo: 't1', contrato: 'c1', outros: ['d1'] },
    { id: 'p2', nome: 'Massagem', termo: 't2', contrato: null, outros: ['d1'] },
    { id: 'p3', nome: 'Limpeza', termo: null, contrato: null, outros: [] },
  ]

  it('o termo e os outros documentos dos procedimentos distintos, uma vez cada; o contrato do procedimento não', () => {
    const r = documentosPuxadosDoPacote(['p1', 'p2', 'p1', 'p3'], procedimentos, modelos, [])
    expect(r.map(d => d.id)).toEqual(['t1', 't2', 'd1'])
    expect(r.find(d => d.id === 'd1')).toMatchObject({ nome: 'Uso de imagem', de: ['Toxina', 'Massagem'], excluido: false })
  })

  it('o que a rede excluiu aparece como excluído (e volta com "Incluir de novo")', () => {
    const r = documentosPuxadosDoPacote(['p1'], procedimentos, modelos, ['t1'])
    expect(r).toEqual([
      { id: 't1', nome: 'Termo da toxina', tipo: 'TERMO', de: ['Toxina'], excluido: true },
      { id: 'd1', nome: 'Uso de imagem', tipo: 'DOCUMENTO', de: ['Toxina'], excluido: false },
    ])
  })

  it('modelo desativado (fora da lista de modelos ativos) não é puxado', () => {
    expect(documentosPuxadosDoPacote(['p2'], procedimentos, modelos.filter(m => m.id !== 't2'), []).map(d => d.id)).toEqual(['d1'])
  })
})
