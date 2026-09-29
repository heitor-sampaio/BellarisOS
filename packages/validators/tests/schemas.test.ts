import { describe, it, expect } from 'vitest'
import {
  RegisterSchema, LoginSchema, ResetPasswordSchema, UpdatePasswordSchema,
} from '../src/index'

describe('schemas de autenticação', () => {
  it('cadastro confere a confirmação de senha', () => {
    expect(RegisterSchema.safeParse({ email: 'a@b.com', password: '12345678', confirmPassword: '12345678' }).success).toBe(true)
    const r = RegisterSchema.safeParse({ email: 'a@b.com', password: '12345678', confirmPassword: 'outra' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(['confirmPassword'])
  })

  it('cadastro exige senha de 8 caracteres', () => {
    expect(RegisterSchema.safeParse({ email: 'a@b.com', password: '1234567', confirmPassword: '1234567' }).success).toBe(false)
  })

  it('login exige e-mail válido', () => {
    expect(LoginSchema.safeParse({ email: 'nao-e-email', password: '123456' }).success).toBe(false)
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true)
  })

  it('recuperar a senha só pede um e-mail válido', () => {
    expect(ResetPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    expect(ResetPasswordSchema.safeParse({ email: 'nao-e-email' }).success).toBe(false)
  })

  it('a senha nova segue a regra do cadastro', () => {
    expect(UpdatePasswordSchema.safeParse({ password: '12345678', confirmPassword: '12345678' }).success).toBe(true)
    expect(UpdatePasswordSchema.safeParse({ password: '1234567', confirmPassword: '1234567' }).success).toBe(false)
    const r = UpdatePasswordSchema.safeParse({ password: '12345678', confirmPassword: 'outra' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(['confirmPassword'])
  })
})
