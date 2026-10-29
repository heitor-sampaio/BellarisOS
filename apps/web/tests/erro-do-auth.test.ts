import { describe, it, expect } from 'vitest'
import { erroDoAuth } from '@/lib/erro-do-auth'

// D12 da simulação de 2026-10-29: o cadastro com acesso ao app mostrou, cru,
// "Erro ao criar login do cliente: Password is known to be weak…". O Auth do
// Supabase fala inglês; a tela, português.
describe('o erro do Auth em português', () => {
  it('senha fraca (a senha inicial da cliente é o CPF)', () => {
    const e = { code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.' }
    expect(erroDoAuth(e)).toMatch(/senha/i)
    expect(erroDoAuth(e)).not.toMatch(/Password|weak/)
    expect(erroDoAuth({ message: 'Password should be at least 6 characters.' })).toMatch(/senha/i)
  })
  it('e-mail já em uso', () => {
    expect(erroDoAuth({ code: 'email_exists', message: 'A user with this email address has already been registered' }))
      .toBe('Este e-mail já está em uso por outra conta.')
    expect(erroDoAuth({ message: 'User already registered' })).toBe('Este e-mail já está em uso por outra conta.')
  })
  it('e-mail inválido', () => {
    expect(erroDoAuth({ code: 'email_address_invalid', message: 'Unable to validate email address: invalid format' }))
      .toBe('E-mail inválido.')
  })
  it('muitas tentativas', () => {
    expect(erroDoAuth({ code: 'over_request_rate_limit', message: 'For security purposes, you can only request this after 30 seconds.' }))
      .toMatch(/tentativas/)
  })
  it('a nova senha igual à atual', () => {
    expect(erroDoAuth({ code: 'same_password', message: 'New password should be different from the old password.' }))
      .toBe('A nova senha precisa ser diferente da atual.')
  })
  it('o desconhecido não vai cru para a tela: uma frase em português', () => {
    const t = erroDoAuth({ message: 'Database error saving new user' })
    expect(t).not.toMatch(/Database/)
    expect(t).toMatch(/Tente de novo/)
    expect(erroDoAuth(null)).toMatch(/Tente de novo/)
  })
})
