import { describe, it, expect } from 'vitest'
import { alergiasDaAnamnese, respostaDeAlergiaEhNegativa, type AnamneseGeral } from '@/lib/anamnese-geral'

const NEGATIVAS = [
  'não', 'Não.', 'NÃO', 'nao', 'Nenhuma', 'nenhum', 'nenhuma conhecida', 'Nenhuma alergia conhecida.',
  'sem alergias', 'Sem alergia!', 'sem', 'nego', 'Nego alergias.', 'nunca tive', 'Nunca tive alergia.',
  'Não tenho alergias.', 'nao tenho alergia', 'Não possuo alergias', 'não tenho alergia a nada', 'não, nenhuma', '-', '—', 'n/a', 'nada',
]
const POSITIVAS = [
  'alergia a dipirona', 'Dipirona', 'não sei, acho que a dipirona', 'não tenho certeza, talvez látex',
  'não, mas tenho alergia a látex', 'não tenho alergia a medicamentos, só a camarão', 'sem alergia a nada, exceto penicilina',
  'não lembro', 'Nunca tive, só dipirona', 'não tenho alergia a dipirona? tenho sim',
]

describe('respostaDeAlergiaEhNegativa (D7)', () => {
  it.each(NEGATIVAS)('"%s" é negativa', t => expect(respostaDeAlergiaEhNegativa(t)).toBe(true))
  it.each(POSITIVAS)('"%s" é positiva', t => expect(respostaDeAlergiaEhNegativa(t)).toBe(false))
})

describe('alergiasDaAnamnese', () => {
  const com = (r: string) => ({ ficha: { rows: [] }, respostas: { allergies: r } }) as unknown as AnamneseGeral
  it('"Não tenho alergias." não vira alerta', () => expect(alergiasDaAnamnese(com('Não tenho alergias.'))).toBeNull())
  it('"alergia a dipirona" vira alerta', () => expect(alergiasDaAnamnese(com('alergia a dipirona'))).toBe('alergia a dipirona'))
})

import { avisoDeAlergia } from '@/lib/anamnese-geral'
describe('avisoDeAlergia — não duplica o ponto', () => {
  it('texto que já termina em ponto', () => expect(avisoDeAlergia('alergia a dipirona.')).toBe(' Atenção — alergia: alergia a dipirona.'))
  it('texto sem ponto', () => expect(avisoDeAlergia('dipirona')).toBe(' Atenção — alergia: dipirona.'))
  it('sem alergia, nada', () => expect(avisoDeAlergia(null)).toBe(''))
})
