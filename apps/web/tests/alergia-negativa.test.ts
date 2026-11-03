import { describe, it, expect } from 'vitest'
import { alergiasDaAnamnese, avisoDeAlergia, type AnamneseGeral } from '@/lib/anamnese-geral'

/**
 * atend-15 (revisão do Heitor, 2026-11-02): "vamos precisar de uma avaliação
 * de uma IA para entender o que foi escrito e isso não está no escopo;
 * alergia: opção de sim ou não; se sim, campo texto livre para detalhamento
 * e alerta". Nada interpreta texto: "Sim" dispara a faixa com o detalhe,
 * "Não" não dispara.
 */
const com = (respostas: Record<string, string>) => ({ ficha: { rows: [] }, respostas }) as unknown as AnamneseGeral

describe('alergiasDaAnamnese — Sim/Não (atend-15)', () => {
  it('"Não" não vira alerta, mesmo com detalhe esquecido', () => {
    expect(alergiasDaAnamnese(com({ allergies: 'Não' }))).toBeNull()
    expect(alergiasDaAnamnese(com({ allergies: 'Não', allergiesDetalhe: 'dipirona' }))).toBeNull()
  })
  it('"Sim" vira alerta com o detalhe', () => {
    expect(alergiasDaAnamnese(com({ allergies: 'Sim', allergiesDetalhe: 'Dipirona e látex' }))).toBe('Dipirona e látex')
  })
  it('"Sim" sem detalhe ainda avisa', () => {
    expect(alergiasDaAnamnese(com({ allergies: 'Sim' }))).toBe('Sim (sem detalhe)')
  })
  it('sem resposta, nada', () => expect(alergiasDaAnamnese(com({}))).toBeNull())
  it('a resposta em texto livre (ficha de antes) avisa como está — nada a interpreta', () => {
    expect(alergiasDaAnamnese(com({ allergies: 'alergia a dipirona' }))).toBe('alergia a dipirona')
    expect(alergiasDaAnamnese(com({ allergies: 'não sei, acho que não' }))).toBe('não sei, acho que não')
  })
})

describe('avisoDeAlergia — não duplica o ponto', () => {
  it('texto que já termina em ponto', () => expect(avisoDeAlergia('alergia a dipirona.')).toBe(' Atenção — alergia: alergia a dipirona.'))
  it('texto sem ponto', () => expect(avisoDeAlergia('dipirona')).toBe(' Atenção — alergia: dipirona.'))
  it('sem alergia, nada', () => expect(avisoDeAlergia(null)).toBe(''))
})
