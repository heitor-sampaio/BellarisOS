import { describe, it, expect } from 'vitest'
import { cpfValido, telefoneNacional } from '../src/validacao'

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
