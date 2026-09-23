import { describe, it, expect } from 'vitest'
import {
  hasLevel, resolvePermissions, resolveScopes, isScoped,
  MODULE_LEVELS, ALL_MODULES, NO_PERMISSIONS, ALL_PERMISSIONS,
  resolveReportTabs, ALL_REPORT_TABS, REPORT_TAB_LABELS, REPORT_TAB_HINTS,
} from '@/lib/permissions'

describe('hasLevel', () => {
  it('trata módulo sem linha como NONE', () => {
    expect(hasLevel(undefined, 'VIEW')).toBe(false)
    expect(hasLevel(undefined, 'MANAGE')).toBe(false)
  })

  it('MANAGE satisfaz VIEW, o contrário não', () => {
    expect(hasLevel('MANAGE', 'VIEW')).toBe(true)
    expect(hasLevel('VIEW', 'MANAGE')).toBe(false)
  })

  it('o mesmo nível satisfaz a si mesmo', () => {
    expect(hasLevel('VIEW', 'VIEW')).toBe(true)
    expect(hasLevel('MANAGE', 'MANAGE')).toBe(true)
  })
})

describe('resolvePermissions', () => {
  it('cargo sem nenhuma linha fica em NONE, módulo por módulo', () => {
    const p = resolvePermissions([])
    for (const m of ALL_MODULES) expect(p[m]).toBe('NONE')
  })

  it('só o módulo com linha sobe de nível', () => {
    const p = resolvePermissions([{ module: 'agenda', level: 'MANAGE' }])
    expect(p.agenda).toBe('MANAGE')
    expect(p.financial).toBe('NONE')
  })

  it('allAccess dá MANAGE em tudo', () => {
    expect(resolvePermissions([], { allAccess: true })).toEqual(ALL_PERMISSIONS)
  })

  it('devolve uma cópia — mexer no resultado não contamina ALL_PERMISSIONS', () => {
    const p = resolvePermissions([], { allAccess: true })
    p.agenda = 'NONE'
    expect(ALL_PERMISSIONS.agenda).toBe('MANAGE')
  })

  it('ignora módulo que não existe mais', () => {
    const p = resolvePermissions([{ module: 'checkout', level: 'MANAGE' }])
    expect(p).toEqual(NO_PERMISSIONS)
  })
})

describe('resolveScopes', () => {
  it('módulo escopável sem linha fica em ALL — restringir por omissão esconderia dado', () => {
    const s = resolveScopes([])
    expect(s.agenda).toBe('ALL')
    expect(s.medical_records).toBe('ALL')
  })

  it('OWN só vale em módulo escopável', () => {
    const s = resolveScopes([
      { module: 'agenda', level: 'MANAGE', scope: 'OWN' },
      { module: 'stock',  level: 'MANAGE', scope: 'OWN' },
    ])
    expect(s.agenda).toBe('OWN')
    expect(s.stock).toBe('ALL')
  })

  it('scope nulo no banco vira ALL', () => {
    const s = resolveScopes([{ module: 'crm', level: 'VIEW', scope: null }])
    expect(s.crm).toBe('ALL')
  })
})

describe('MODULE_LEVELS', () => {
  it('todo módulo aceita NONE', () => {
    for (const m of ALL_MODULES) expect(MODULE_LEVELS[m]).toContain('NONE')
  })

  it('reports não distingue MANAGE — não há nada para gerenciar', () => {
    expect(MODULE_LEVELS.reports).toEqual(['NONE', 'VIEW'])
  })

  it('cashier, forms, roles e settings são tudo ou nada', () => {
    for (const m of ['cashier', 'forms', 'roles', 'settings'] as const) {
      expect(MODULE_LEVELS[m]).toEqual(['NONE', 'MANAGE'])
    }
  })

  it('declara níveis para os 15 módulos, sem sobra', () => {
    expect(Object.keys(MODULE_LEVELS).sort()).toEqual([...ALL_MODULES].sort())
    expect(ALL_MODULES).toHaveLength(15)
  })
})

describe('resolveReportTabs', () => {
  it('sem linha nenhuma, nenhum relatório — a omissão FECHA', () => {
    expect(resolveReportTabs([])).toEqual([])
  })

  it('devolve na ordem da tela, não na do banco', () => {
    const tabs = resolveReportTabs([{ tab: 'comercial' }, { tab: 'agenda' }, { tab: 'overview' }])
    expect(tabs).toEqual(['overview', 'agenda', 'comercial'])
  })

  it('ignora aba que não existe mais', () => {
    expect(resolveReportTabs([{ tab: 'marketing' }, { tab: 'estoque' }])).toEqual(['estoque'])
  })

  it('allAccess entrega todas', () => {
    expect(resolveReportTabs([], { allAccess: true })).toEqual([...ALL_REPORT_TABS])
  })

  it('cada aba tem rótulo e explicação', () => {
    for (const t of ALL_REPORT_TABS) {
      expect(REPORT_TAB_LABELS[t]).toBeTruthy()
      expect(REPORT_TAB_HINTS[t]).toBeTruthy()
    }
  })
})

describe('isScoped', () => {
  it('cinco módulos têm escopo — os quatro do CLAUDE.md §11 mais reports', () => {
    // `reports` entrou depois ("só a própria unidade" × "a rede inteira") e o
    // CLAUDE.md ainda lista quatro. Quem manda é `SCOPED_MODULES`.
    const escopaveis = ALL_MODULES.filter(isScoped)
    expect(escopaveis.sort()).toEqual(['agenda', 'crm', 'financial', 'medical_records', 'reports'])
  })
})
