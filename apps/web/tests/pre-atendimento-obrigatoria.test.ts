import { describe, it, expect } from 'vitest'
import { oQueFaltaNaFicha, anamneseRespondida, type AnamneseGeral } from '@/lib/anamnese-geral'
import type { AnamnesisRow } from '@/lib/anamnesis'

/**
 * D2 da simulação de 2026-10-28: a ficha de saúde se enviava vazia e passava
 * a constar como respondida. A conta do que falta (o servidor confere com ela,
 * no app e no link) e do que é "respondida" mora em lib/anamnese-geral.
 */

const rows: AnamnesisRow[] = [
  { id: 'l1', fields: [
    { id: 'skinType', type: 'select', label: 'Tipo de pele', options: ['Mista'] },
    { id: 'isPregnantOrBreastfeeding', type: 'radio', label: 'Grávida ou amamentando?', options: ['Sim', 'Não'], required: true },
  ] },
  { id: 'l2', fields: [
    { id: 'sec', type: 'section', label: 'Saúde', required: true },
    { id: 'allergies', type: 'textarea', label: 'Alergias', required: true },
  ] },
]

const anamnese = (respostas: AnamneseGeral['respostas']): AnamneseGeral => ({
  versao: 2, ficha: { formId: null, nome: 'x', rows }, respostas, respondidoEm: null, origem: 'CLIENTE_APP', respondidoPor: null,
})

describe('o que falta na ficha de saúde', () => {
  it('sem resposta nenhuma, pede que responda', () => {
    expect(oQueFaltaNaFicha(rows, {})).toBe('Responda a ficha antes de enviar.')
    expect(oQueFaltaNaFicha([], {})).toBe('Responda a ficha antes de enviar.')
  })
  it('diz a primeira obrigatória vazia, na ordem da ficha (seção não conta)', () => {
    expect(oQueFaltaNaFicha(rows, { skinType: 'Mista' })).toBe('Preencha "Grávida ou amamentando?".')
    expect(oQueFaltaNaFicha(rows, { isPregnantOrBreastfeeding: 'Não', allergies: '   ' })).toBe('Preencha "Alergias".')
    expect(oQueFaltaNaFicha(rows, { isPregnantOrBreastfeeding: 'Não', allergies: [] })).toBe('Preencha "Alergias".')
  })
  it('com as obrigatórias respondidas, nada falta', () => {
    expect(oQueFaltaNaFicha(rows, { isPregnantOrBreastfeeding: 'Não', allergies: 'Nenhuma' })).toBeNull()
  })
})

describe('anamnese respondida', () => {
  it('só com ao menos uma resposta', () => {
    expect(anamneseRespondida(null)).toBe(false)
    expect(anamneseRespondida(anamnese({}))).toBe(false)
    expect(anamneseRespondida(anamnese({ allergies: 'Nenhuma' }))).toBe(true)
  })
})
