import { describe, it, expect } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import {
  can, podeReceber, vistaPessoal,
  assertPermission, assertAnyPermission, assertPodeReceber, getRedirectPath,
  podeVerRelatorio,
} from '@/lib/auth'
import { NO_PERMISSIONS, ALL_PERMISSIONS } from '@/lib/permissions'

/**
 * Contextos fabricados: os dois eixos do CLAUDE.md §11 (módulo × nível e
 * abrangência) são independentes, e é isso que estes testes fixam.
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
    reportTabs:       [],
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
  it('o PDV em Gerenciar sozinho basta', () => {
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

// Sem o "só os meus" (SM1, o Heitor, 2026-11-23): o módulo dá tudo; o que é da
// pessoa é a vista pessoal (SM2), que abre a quem atende sem o módulo.
describe('vistaPessoal', () => {
  it('a agenda: o id interno de quem atende e não tem a Agenda', () => {
    expect(vistaPessoal(ctx({ providesServices: true }), 'agenda')).toBe('user-1')
  })

  it('a agenda: quem não atende não tem vista (a comissão de venda não abre a agenda)', () => {
    expect(vistaPessoal(ctx(), 'agenda')).toBeNull()
    expect(vistaPessoal(ctx({ comissaoDeVenda: true }), 'agenda')).toBeNull()
  })

  it('o financeiro: quem atende OU tem comissão de venda, sem o Financeiro', () => {
    expect(vistaPessoal(ctx({ providesServices: true }), 'financial')).toBe('user-1')
    expect(vistaPessoal(ctx({ comissaoDeVenda: true }), 'financial')).toBe('user-1')
    expect(vistaPessoal(ctx(), 'financial')).toBeNull()
  })

  it('com o módulo (Ver ou Gerenciar), não há vista: o módulo dá tudo', () => {
    const atende = { providesServices: true, comissaoDeVenda: true }
    expect(vistaPessoal(ctx({ ...atende, permissions: { ...NO_PERMISSIONS, agenda: 'VIEW' } }), 'agenda')).toBeNull()
    expect(vistaPessoal(ctx({ ...atende, permissions: { ...NO_PERMISSIONS, agenda: 'MANAGE' } }), 'agenda')).toBeNull()
    expect(vistaPessoal(ctx({ ...atende, permissions: { ...NO_PERMISSIONS, financial: 'VIEW' } }), 'financial')).toBeNull()
    expect(vistaPessoal(ctx({ ...atende, permissions: { ...ALL_PERMISSIONS } }), 'financial')).toBeNull()
  })

  it('fora do plano da rede, nem a vista', () => {
    const semNada = { funcionalidades: [] as string[], limites: { unidades: null, membros: null, whatsapp: null } }
    expect(vistaPessoal(ctx({ providesServices: true, plano: semNada }), 'agenda')).toBeNull()
    expect(vistaPessoal(ctx({ providesServices: true, comissaoDeVenda: true, plano: semNada }), 'financial')).toBeNull()
    // No plano, a vista volta.
    const comAgenda = { ...semNada, funcionalidades: ['agenda', 'financeiro'] }
    expect(vistaPessoal(ctx({ providesServices: true, plano: comAgenda }), 'agenda')).toBe('user-1')
    expect(vistaPessoal(ctx({ providesServices: true, plano: comAgenda }), 'financial')).toBe('user-1')
  })

  it('sem o id interno, ou como cliente final, não há vista', () => {
    expect(vistaPessoal(ctx({ providesServices: true, internalUserId: null }), 'agenda')).toBeNull()
    expect(vistaPessoal(ctx({ providesServices: true, isClient: true }), 'agenda')).toBeNull()
  })

  it('a vista não depende da abrangência: da rede ou de uma unidade', () => {
    expect(vistaPessoal(ctx({ providesServices: true, branchId: null }), 'agenda')).toBe('user-1')
    expect(vistaPessoal(ctx({ providesServices: true, branchId: 'branch-1' }), 'agenda')).toBe('user-1')
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

describe('abas de Relatórios', () => {
  it('a aba precisa do módulo E da aba — uma coisa sem a outra não abre', () => {
    const semModulo = ctx({ reportTabs: ['comercial'] })
    const semAba    = ctx({ permissions: { ...NO_PERMISSIONS, reports: 'VIEW' } })
    expect(podeVerRelatorio(semModulo, 'comercial')).toBe(false)
    expect(podeVerRelatorio(semAba, 'comercial')).toBe(false)
  })

  it('o time comercial vê o funil e não vê o faturamento', () => {
    const comercial = ctx({
      permissions: { ...NO_PERMISSIONS, reports: 'VIEW', crm: 'MANAGE' },
      reportTabs:  ['comercial', 'agenda'],
    })
    expect(podeVerRelatorio(comercial, 'comercial')).toBe(true)
    expect(podeVerRelatorio(comercial, 'agenda')).toBe(true)
    expect(podeVerRelatorio(comercial, 'financeiro')).toBe(false)
  })

  it('financial em MANAGE não abre o relatório financeiro por tabela', () => {
    const caixa = ctx({
      permissions: { ...NO_PERMISSIONS, reports: 'VIEW', financial: 'MANAGE' },
      reportTabs:  ['agenda'],
    })
    expect(podeVerRelatorio(caixa, 'financeiro')).toBe(false)
  })
})

describe('getRedirectPath', () => {
  it('quem tem unidade cai na unidade; quem não tem, na rede', () => {
    expect(getRedirectPath('qualquer', 'centro')).toBe('/centro/dashboard')
    expect(getRedirectPath('qualquer', null)).toBe('/admin/dashboard')
  })
})
