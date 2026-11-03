import { describe, it, expect } from 'vitest'
import { campoVisivel, normalizeFormSchema, primeiraObrigatoriaVazia, type AnamnesisRow } from '@/lib/anamnesis'
import { oQueFaltaNaFicha, respostasDaFicha } from '@/lib/anamnese-geral'

/**
 * O campo que só aparece com uma resposta (atend-15): "Quais alergias?" só
 * com "Alergias? Sim". Escondido, não barra e não se grava.
 */
const rows: AnamnesisRow[] = normalizeFormSchema({ rows: [{ id: 'l', fields: [
  { id: 'allergies', type: 'radio', label: 'Tem alguma alergia?', options: ['Sim', 'Não'], required: true },
  { id: 'allergiesDetalhe', type: 'textarea', label: 'Quais alergias?', required: true, mostrarSe: { campo: 'allergies', valor: 'Sim' } },
] }] }).rows

describe('campo condicional', () => {
  it('o normalizador guarda a condição', () => {
    const det = rows.flatMap(r => r.fields).find(f => f.id === 'allergiesDetalhe')!
    expect(det.mostrarSe).toEqual({ campo: 'allergies', valor: 'Sim' })
  })
  it('aparece só com a resposta da condição', () => {
    const det = rows.flatMap(r => r.fields).find(f => f.id === 'allergiesDetalhe')!
    const todos = rows.flatMap(r => r.fields)
    expect(campoVisivel(det, { allergies: 'Sim' }, todos)).toBe(true)
    expect(campoVisivel(det, { allergies: 'Não' }, todos)).toBe(false)
    expect(campoVisivel(det, {}, todos)).toBe(false)
  })
  it('a condição que aponta para campo que não existe não esconde', () => {
    const det = { id: 'x', type: 'text' as const, label: 'X', mostrarSe: { campo: 'sumiu', valor: 'Sim' } }
    expect(campoVisivel(det, {}, [det])).toBe(true)
  })
  it('a obrigatória escondida não barra; a visível barra', () => {
    expect(primeiraObrigatoriaVazia(rows, { allergies: 'Não' })).toBeNull()
    expect(primeiraObrigatoriaVazia(rows, { allergies: 'Sim' })?.id).toBe('allergiesDetalhe')
    expect(oQueFaltaNaFicha(rows, { allergies: 'Não' })).toBeNull()
    expect(oQueFaltaNaFicha(rows, { allergies: 'Sim' })).toBe('Preencha "Quais alergias?".')
  })
  it('a resposta do campo escondido não se grava', () => {
    expect(respostasDaFicha(rows, { allergies: 'Não', allergiesDetalhe: 'dipirona' })).toEqual({ allergies: 'Não' })
    expect(respostasDaFicha(rows, { allergies: 'Sim', allergiesDetalhe: 'dipirona' })).toEqual({ allergies: 'Sim', allergiesDetalhe: 'dipirona' })
  })
})
