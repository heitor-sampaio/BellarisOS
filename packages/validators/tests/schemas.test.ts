import { describe, it, expect } from 'vitest'
import {
  CreateClientSchema, UpdateClientSchema,
  CreateAppointmentSchema, CancelAppointmentSchema, CompleteAppointmentSchema,
  CreateProcedureSchema,
  RegisterSchema, LoginSchema, ClientLoginSchema,
} from '../src/index'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('CreateClientSchema', () => {
  const base = { name: 'Marina Torres', phone: '(47) 99123-4567' }

  it('guarda telefone e CPF só com dígitos', () => {
    const r = CreateClientSchema.parse({ ...base, document: '123.456.789-01' })
    expect(r.phone).toBe('47991234567')
    expect(r.document).toBe('12345678901')
  })

  it('nome e telefone bastam — CPF e e-mail ficam nulos', () => {
    const r = CreateClientSchema.parse(base)
    expect(r.document).toBeNull()
    expect(r.email).toBeNull()
    expect(r.tags).toEqual([])
  })

  it('e-mail em branco vira nulo; e-mail torto é recusado', () => {
    expect(CreateClientSchema.parse({ ...base, email: '' }).email).toBeNull()
    expect(CreateClientSchema.safeParse({ ...base, email: 'nao-e-email' }).success).toBe(false)
  })

  it('telefone curto demais é recusado', () => {
    expect(CreateClientSchema.safeParse({ ...base, phone: '4799' }).success).toBe(false)
  })

  it('nome de uma letra é recusado', () => {
    expect(CreateClientSchema.safeParse({ ...base, name: 'M' }).success).toBe(false)
  })

  it('UF tem no máximo duas letras', () => {
    expect(CreateClientSchema.safeParse({ ...base, state: 'SCX' }).success).toBe(false)
    expect(CreateClientSchema.safeParse({ ...base, state: 'SC' }).success).toBe(true)
  })

  it('a edição aceita campo avulso', () => {
    expect(UpdateClientSchema.safeParse({ name: 'Marina T.' }).success).toBe(true)
  })
})

describe('CreateAppointmentSchema', () => {
  const base = {
    clientId: UUID, procedureId: UUID, professionalId: UUID,
    scheduledAt: '2026-09-18T13:00:00Z', durationMin: 60, price: 200,
  }

  it('a origem padrão é o atendimento interno', () => {
    expect(CreateAppointmentSchema.parse(base).source).toBe('INTERNAL')
  })

  it('converte a data', () => {
    expect(CreateAppointmentSchema.parse(base).scheduledAt).toBeInstanceOf(Date)
  })

  it('duração fracionada ou negativa é recusada', () => {
    expect(CreateAppointmentSchema.safeParse({ ...base, durationMin: 0 }).success).toBe(false)
    expect(CreateAppointmentSchema.safeParse({ ...base, durationMin: 30.5 }).success).toBe(false)
  })

  it('id que não é uuid é recusado', () => {
    expect(CreateAppointmentSchema.safeParse({ ...base, clientId: 'abc' }).success).toBe(false)
  })

  it('cancelar exige motivo — é o que dá rastreabilidade', () => {
    expect(CancelAppointmentSchema.safeParse({ cancellationReason: '' }).success).toBe(false)
    expect(CancelAppointmentSchema.safeParse({ cancellationReason: 'Cliente remarcou' }).success).toBe(true)
  })

  it('concluir exige uma forma de pagamento conhecida', () => {
    expect(CompleteAppointmentSchema.safeParse({ paymentMethod: 'PIX' }).success).toBe(true)
    expect(CompleteAppointmentSchema.safeParse({ paymentMethod: 'BOLETO' }).success).toBe(false)
  })
})

describe('CreateProcedureSchema', () => {
  const base = { name: 'Limpeza de pele', category: 'Facial', durationMin: 60, price: 200 }

  it('nasce visível no app do cliente', () => {
    expect(CreateProcedureSchema.parse(base).visibleOnClientApp).toBe(true)
  })

  it('preço zero é recusado por este schema', () => {
    expect(CreateProcedureSchema.safeParse({ ...base, price: 0 }).success).toBe(false)
  })
})

describe('schemas de autenticação', () => {
  it('cadastro confere a confirmação de senha', () => {
    expect(RegisterSchema.safeParse({ email: 'a@b.com', password: '12345678', confirmPassword: '12345678' }).success).toBe(true)
    const r = RegisterSchema.safeParse({ email: 'a@b.com', password: '12345678', confirmPassword: 'outra' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(['confirmPassword'])
  })

  it('login exige e-mail válido', () => {
    expect(LoginSchema.safeParse({ email: 'nao-e-email', password: '123456' }).success).toBe(false)
  })

  it('o cliente entra por CPF, guardado só com dígitos', () => {
    expect(ClientLoginSchema.parse({ document: '123.456.789-01', password: '123456' }).document).toBe('12345678901')
    expect(ClientLoginSchema.safeParse({ document: '123', password: '123456' }).success).toBe(false)
  })
})
