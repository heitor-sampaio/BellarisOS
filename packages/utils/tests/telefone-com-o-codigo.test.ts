import { describe, it, expect } from 'vitest'
import { maskPhone, maskPhoneDigitando, maskTelefoneDigitando, temDigitosDeMais } from '../src/format'
import { telefoneNacional, telefoneDoCadastro } from '../src/validacao'

/**
 * A17 da 43ª simulação (princípio 3): ao colar o número com o código do país,
 * a máscara perdia os últimos dígitos. O "+55 (064) 99123-4567" (o 55 do país
 * e o 0 da longa distância antes do DDD) virava "(55) 06499-1234", e o
 * "0 64 99123-4567" virava "(06) 49912-3456" — o número de outra pessoa. O
 * campo da ficha mostrava o "+55" cru, e a ficha gravava outro texto.
 * Nenhum DDD começa com 0: o 0 antes de um número nacional é o da discagem.
 */
const digitar = (mascara: (v: string) => string, texto: string) => {
  let v = ''
  for (const ch of texto) v = mascara(v + ch)
  return v
}

describe('o número com o código do país ou o 0 da discagem (A17 da 43ª)', () => {
  it('colado, sai inteiro', () => {
    expect(maskPhoneDigitando('+55 (064) 99123-4567')).toBe('(64) 99123-4567')
    expect(maskPhoneDigitando('0 64 99123-4567')).toBe('(64) 99123-4567')
    expect(maskPhoneDigitando('0 64 3333-4444')).toBe('(64) 3333-4444')
    expect(maskPhoneDigitando('55 0 64 99123-4567')).toBe('(64) 99123-4567')
  })
  it('digitado um a um, também', () => {
    expect(digitar(maskPhoneDigitando, '0 64 99123-4567')).toBe('(64) 99123-4567')
    expect(digitar(maskPhoneDigitando, '55 0 64 99123-4567')).toBe('(64) 99123-4567')
    expect(digitar(maskPhoneDigitando, '+55 (64) 99123-4567')).toBe('(64) 99123-4567')
    expect(digitar(maskTelefoneDigitando, '0 64 99123-4567')).toBe('(64) 99123-4567')
  })
  it('o campo do cadastro mostra o "+55" completo como o número que a ficha grava', () => {
    expect(maskTelefoneDigitando('+55 (64) 99123-4567')).toBe('(64) 99123-4567')
    expect(maskTelefoneDigitando('+55 (064) 99123-4567')).toBe('(64) 99123-4567')
    expect(digitar(maskTelefoneDigitando, '+55 (64) 99123-4567')).toBe('(64) 99123-4567')
    // Incompleto, fica como se escreve (não some no meio da digitação).
    expect(maskTelefoneDigitando('+55 (64) 9912')).toBe('+55 (64) 9912')
  })
  it('o cadastro grava o mesmo número que o campo mostra', () => {
    expect(telefoneNacional('0 64 99123-4567')).toBe('64991234567')
    expect(telefoneDoCadastro('+55 (064) 99123-4567')).toEqual({ digitos: '64991234567', gravar: '(64) 99123-4567' })
    expect(maskPhone('064991234567')).toBe('(64) 99123-4567')
    expect(temDigitosDeMais('+55 (064) 99123-4567')).toBe(false)
  })
  it('o resto não muda: o DDD 55, o de outro país e o longo demais', () => {
    expect(maskPhoneDigitando('55999990000')).toBe('(55) 99999-0000')
    expect(maskTelefoneDigitando('+351 912 345 678')).toBe('+351 912 345 678')
    expect(telefoneNacional('419920012345')).toBeNull()
    expect(temDigitosDeMais('55819980000021')).toBe(true)
  })
})
