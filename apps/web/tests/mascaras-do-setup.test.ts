import { describe, it, expect } from 'vitest'
import { maskCNPJDigitando, maskCEPDigitando, maskPhoneDigitando, maskCPFouCNPJDigitando } from '@estetica-os/utils'
import { lerHorarioDoForm, HORARIO_PADRAO } from '@/lib/agenda/horario'

/**
 * Máscaras do setup (A1, simulação de 2026-10-27): CNPJ, telefone e CEP
 * apareciam crus, "48999990000" e "88010400". A máscara vale ENQUANTO se
 * digita (maskPhoneDigitando é a irmã do telefone) e o horário do setup
 * (A3) é lido do formulário por uma função só, a mesma da edição da unidade.
 */
describe('máscara de CNPJ enquanto se digita', () => {
  it('vai formatando por pedaços', () => {
    expect(maskCNPJDigitando('')).toBe('')
    expect(maskCNPJDigitando('12')).toBe('12')
    expect(maskCNPJDigitando('123')).toBe('12.3')
    expect(maskCNPJDigitando('12345678')).toBe('12.345.678')
    expect(maskCNPJDigitando('123456780001')).toBe('12.345.678/0001')
    expect(maskCNPJDigitando('12345678000195')).toBe('12.345.678/0001-95')
  })
  it('ignora o que não é dígito e corta no 14º', () => {
    expect(maskCNPJDigitando('12.345.678/0001-95999')).toBe('12.345.678/0001-95')
    expect(maskCNPJDigitando('ab')).toBe('')
  })
})

// J-1 (2026-10-30): o telefone gravado com o DDI ("5548999990000", o do
// WhatsApp) voltava ao setup cortado em 11 dígitos — "(55) 48999-9900". O 55
// sai como em `maskPhone`: só com 12 ou 13 dígitos (o DDD 55 de 11 fica).
describe('máscara de telefone enquanto se digita, com o DDI', () => {
  it('tira o 55 do número com DDI', () => {
    expect(maskPhoneDigitando('5548999990000')).toBe('(48) 99999-0000')
    expect(maskPhoneDigitando('+55 48 99999-0000')).toBe('(48) 99999-0000')
    expect(maskPhoneDigitando('554833334444')).toBe('(48) 3333-4444')
  })
  it('o DDD 55 sem DDI continua sendo DDD', () => {
    expect(maskPhoneDigitando('55999990000')).toBe('(55) 99999-0000')
    expect(maskPhoneDigitando('559')).toBe('(55) 9')
  })
})

// J-2 (2026-10-30): a aba Geral pede "CNPJ ou CPF". Até 11 dígitos é CPF; daí
// em diante, CNPJ.
describe('máscara de CPF ou CNPJ enquanto se digita', () => {
  it('até 11 dígitos, a do CPF', () => {
    expect(maskCPFouCNPJDigitando('123')).toBe('123')
    expect(maskCPFouCNPJDigitando('1234567')).toBe('123.456.7')
    expect(maskCPFouCNPJDigitando('12345678901')).toBe('123.456.789-01')
  })
  it('do 12º em diante, a do CNPJ', () => {
    expect(maskCPFouCNPJDigitando('11222333000181')).toBe('11.222.333/0001-81')
    expect(maskCPFouCNPJDigitando('11.222.333/0001-81')).toBe('11.222.333/0001-81')
  })
})

describe('máscara de CEP enquanto se digita', () => {
  it('põe o hífen depois do quinto dígito', () => {
    expect(maskCEPDigitando('88010')).toBe('88010')
    expect(maskCEPDigitando('880104')).toBe('88010-4')
    expect(maskCEPDigitando('88010400')).toBe('88010-400')
    expect(maskCEPDigitando('88010-400999')).toBe('88010-400')
  })
})

describe('lerHorarioDoForm', () => {
  const fd = (v?: string) => { const f = new FormData(); if (v !== undefined) f.set('horario', v); return f }
  it('campo ausente = não mexe (undefined)', () => {
    expect(lerHorarioDoForm(fd())).toBeUndefined()
  })
  it('vazio = sem cadastro (null)', () => {
    expect(lerHorarioDoForm(fd('  '))).toBeNull()
  })
  it('horário válido volta normalizado', () => {
    expect(lerHorarioDoForm(fd(JSON.stringify(HORARIO_PADRAO)))).toEqual(HORARIO_PADRAO)
  })
  it('horário inválido = erro', () => {
    expect(lerHorarioDoForm(fd('{"dias":{"1":[{"de":"20:00","ate":"08:00"}]}}'))).toEqual({ erro: expect.stringMatching(/Horário inválido/) })
  })
})
