import { describe, it, expect } from 'vitest'
import { cpfValido, telefoneNacional, telefoneDoCadastro } from '../src/validacao'

// D12 da simulação de 2026-10-29: o CPF 11111111111 passava no cadastro com
// acesso ao app (só o TAMANHO era conferido), e o login nascia com ele de senha.
describe('o CPF', () => {
  it('confere os dígitos verificadores, com ou sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
    expect(cpfValido('111.444.777-35')).toBe(true)
    expect(cpfValido('52998224724')).toBe(false)
    expect(cpfValido('52998224715')).toBe(false)
  })
  it('recusa a sequência repetida, mesmo com os verificadores "certos"', () => {
    for (const n of '0123456789') expect(cpfValido(n.repeat(11)), n.repeat(11)).toBe(false)
  })
  it('recusa o tamanho errado e o vazio', () => {
    expect(cpfValido('5299822472')).toBe(false)
    expect(cpfValido('529982247250')).toBe(false)
    expect(cpfValido('')).toBe(false)
    expect(cpfValido(null)).toBe(false)
  })
})

// D13: "(41) 9920" passava no cadastro completo e a ficha mostrava "(41) 9920-".
describe('o telefone nacional', () => {
  it('10 ou 11 dígitos (DDD + número), com ou sem máscara', () => {
    expect(telefoneNacional('(41) 99200-1234')).toBe('41992001234')
    expect(telefoneNacional('(41) 3322-1234')).toBe('4133221234')
  })
  it('o 55 do WhatsApp (e o +55) é normalizado, como no resto do sistema', () => {
    expect(telefoneNacional('5541992001234')).toBe('41992001234')
    expect(telefoneNacional('+55 41 99200-1234')).toBe('41992001234')
    expect(telefoneNacional('554133221234')).toBe('4133221234')
  })
  it('incompleto, sem DDD ou longo demais não é telefone', () => {
    expect(telefoneNacional('(41) 9920')).toBeNull()
    expect(telefoneNacional('99200-1234')).toBeNull()
    expect(telefoneNacional('419920012345')).toBeNull()
    expect(telefoneNacional('')).toBeNull()
    expect(telefoneNacional(null)).toBeNull()
  })
})

// Decisão do Heitor (frente de cadastro, 2026-10-29): o telefone que começa com
// "+" é de outro país e passa; o brasileiro segue a regra nacional.
describe('o telefone do cadastro (nacional ou de outro país)', () => {
  it('o brasileiro segue o nacional: a chave são os dígitos, e grava com a máscara', () => {
    expect(telefoneDoCadastro('(41) 99200-1234')).toEqual({ digitos: '41992001234', gravar: '(41) 99200-1234' })
    expect(telefoneDoCadastro('+55 41 99200-1234')).toEqual({ digitos: '41992001234', gravar: '(41) 99200-1234' })
    expect(telefoneDoCadastro('(41) 9920')).toBeNull()
  })
  it('com "+" e o código do país, passa como foi escrito', () => {
    expect(telefoneDoCadastro('+351 912 345 678')).toEqual({ digitos: '351912345678', gravar: '+351 912 345 678' })
    expect(telefoneDoCadastro(' +1 (415) 555-0100 ')).toEqual({ digitos: '14155550100', gravar: '+1 (415) 555-0100' })
    expect(telefoneDoCadastro('+44  20   7946 0958')?.gravar).toBe('+44 20 7946 0958')
  })
  it('de outro país, curto, longo ou com letra não é telefone', () => {
    expect(telefoneDoCadastro('+351 91')).toBeNull()
    expect(telefoneDoCadastro('+1234567890123456')).toBeNull()
    expect(telefoneDoCadastro('+351 912 abc 678')).toBeNull()
    expect(telefoneDoCadastro('+')).toBeNull()
  })
  it('sem o "+", o número de outro país é lido como nacional (não se adivinha o país)', () => {
    expect(telefoneDoCadastro('351912345678')).toBeNull()
  })
})
