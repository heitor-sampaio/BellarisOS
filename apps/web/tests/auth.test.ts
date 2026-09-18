import { describe, it, expect } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import {
  can, podeReceber, ownerFilter, isOwnScope,
  assertPermission, assertAnyPermission, assertPodeReceber, getRedirectPath,
} from '@/lib/auth'
import { NO_PERMISSIONS, ALL_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'

/**
 * Contextos fabricados: os três eixos do CLAUDE.md §11 (módulo × nível,
 * escopo, abrangência) são independentes, e é isso que estes testes fixam.
 */
function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId:           'auth-1',
    internalUserId:   'user-1',
    userName:         'Fulana',
    roleLabel:        'Cargo',
    tenantId:         'tenant-1',
    branchId:         null,
    role:             'BRANCH_ADMIN',
    roleId:           'role-1',
    clientId:         null,
    permissions:      { ...NO_PERMISSIONS },
    scopes:           { ...ALL_SCOPES },
    providesServices: false,
    isNetworkAdmin:   false,
    isClient:         false,
    ...over,
  }
}

describe('can', () => {
  it('VIEW é o nível pedido por padrão', () => {
    const c = ctx({ permissions: { ...NO_PERMISSIONS, agenda: 'VIEW' } })
    expect(can(c, 'agenda')).toBe(true)
    expect(can(c, 'agenda', 'MANAGE')).toBe(false)
  })

  it('não olha o nome do cargo', () => {
    const c = ctx({ role: 'NETWORK_ADMIN', isNetworkAdmin: true, permissions: { ...NO_PERMISSIONS } })
    expect(can(c, 'settings', 'MANAGE')).toBe(false)
  })
})

describe('podeReceber', () => {
  it('caixa sozinho basta', () => {
    expect(podeReceber(ctx({ permissions: { ...NO_PERMISSIONS, cashier: 'MANAGE' } }))).toBe(true)
  })

  it('financeiro sozinho basta', () => {
    expect(podeReceber(ctx({ permissions: { ...NO_PERMISSIONS, financial: 'MANAGE' } }))).toBe(true)
  })

  it('financeiro só em VIEW não recebe', () => {
    expect(podeReceber(ctx({ permissions: { ...NO_PERMISSIONS, financial: 'VIEW' } }))).toBe(false)
  })

  it('procedures: MANAGE não tem nada a ver com receber', () => {
    expect(podeReceber(ctx({ permissions: { ...NO_PERMISSIONS, procedures: 'MANAGE' } }))).toBe(false)
  })

  it('assertPodeReceber barra quem não pode', () => {
    expect(() => assertPodeReceber(ctx())).toThrow('Forbidden')
    expect(() => assertPodeReceber(ctx({ permissions: { ...NO_PERMISSIONS, cashier: 'MANAGE' } }))).not.toThrow()
  })
})

describe('escopo e abrangência são eixos diferentes', () => {
  it('OWN devolve o id interno para o filtro da query', () => {
    const c = ctx({ scopes: { ...ALL_SCOPES, agenda: 'OWN' } })
    expect(isOwnScope(c, 'agenda')).toBe(true)
    expect(ownerFilter(c, 'agenda')).toBe('user-1')
  })

  it('ALL não filtra', () => {
    expect(ownerFilter(ctx(), 'agenda')).toBeNull()
  })

  it('MANAGE não tira o escopo OWN — dar "gerenciar" não é dar a agenda de todos', () => {
    const c = ctx({
      permissions: { ...ALL_PERMISSIONS },
      scopes:      { ...ALL_SCOPES, agenda: 'OWN' },
    })
    expect(can(c, 'agenda', 'MANAGE')).toBe(true)
    expect(ownerFilter(c, 'agenda')).toBe('user-1')
  })

  it('o escopo é do cargo, a abrangência é do membro — um não decide o outro', () => {
    const daRede   = ctx({ branchId: null,       scopes: { ...ALL_SCOPES, agenda: 'OWN' } })
    const daUnidade = ctx({ branchId: 'branch-1', scopes: { ...ALL_SCOPES } })
    expect(ownerFilter(daRede, 'agenda')).toBe('user-1')
    expect(ownerFilter(daUnidade, 'agenda')).toBeNull()
  })
})

describe('assertPermission / assertAnyPermission', () => {
  it('barra com Forbidden quando falta o nível', () => {
    expect(() => assertPermission(ctx(), 'agenda', 'VIEW')).toThrow('Forbidden')
  })

  it('passa quando qualquer um dos módulos atende', () => {
    const c = ctx({ permissions: { ...NO_PERMISSIONS, forms: 'MANAGE' } })
    expect(() => assertAnyPermission(c, ['settings', 'roles', 'forms'], 'MANAGE')).not.toThrow()
    expect(() => assertAnyPermission(ctx(), ['settings', 'roles', 'forms'], 'MANAGE')).toThrow('Forbidden')
  })
})

describe('getRedirectPath', () => {
  it('quem tem unidade cai na unidade; quem não tem, na rede', () => {
    expect(getRedirectPath('qualquer', 'centro')).toBe('/centro/dashboard')
    expect(getRedirectPath('qualquer', null)).toBe('/admin/dashboard')
  })
})
