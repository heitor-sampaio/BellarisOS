import { describe, it, expect } from 'vitest'
import { claimsVelhas, renovaNestaRequisicao } from '@/lib/sessao/claims-velhas'

// D9 da 9ª simulação: a unidade (ou o cargo) do token não bate com a do banco.
describe('claimsVelhas', () => {
  it('a unidade do token diferente da do banco é velha', () => {
    expect(claimsVelhas({ branch_id: 'A', role_id: 'r' }, { branchId: 'B', roleId: 'r' })).toBe(true)
    expect(claimsVelhas({ branch_id: 'A' }, { branchId: null, roleId: 'r' })).toBe(true)
    expect(claimsVelhas({ branch_id: null }, { branchId: 'B', roleId: 'r' })).toBe(true)
  })
  it('o cargo trocado é velho; o token sem cargo não decide', () => {
    expect(claimsVelhas({ branch_id: 'A', role_id: 'r1' }, { branchId: 'A', roleId: 'r2' })).toBe(true)
    expect(claimsVelhas({ branch_id: 'A' }, { branchId: 'A', roleId: 'r2' })).toBe(false)
  })
  it('igual, ou sem membro (cliente), não é', () => {
    expect(claimsVelhas({ branch_id: 'A', role_id: 'r' }, { branchId: 'A', roleId: 'r' })).toBe(false)
    expect(claimsVelhas({}, { branchId: null, roleId: null })).toBe(false)
    expect(claimsVelhas({ branch_id: 'A' }, { branchId: undefined, roleId: null })).toBe(false)
  })
})

describe('renovaNestaRequisicao', () => {
  it('só a página (GET), fora de /api e /auth', () => {
    expect(renovaNestaRequisicao('GET /moinhos/agenda?date=2026-11-07')).toBe('/moinhos/agenda?date=2026-11-07')
    expect(renovaNestaRequisicao('POST /moinhos/agenda')).toBeNull()
    expect(renovaNestaRequisicao('GET /api/recibos/1')).toBeNull()
    expect(renovaNestaRequisicao('GET /auth/renovar')).toBeNull()
    expect(renovaNestaRequisicao('')).toBeNull()
  })
})
