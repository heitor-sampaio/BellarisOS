import { describe, it, expect } from 'vitest'
import {
  hasLevel, resolvePermissions,
  MODULE_LEVELS, ALL_MODULES, MODULOS_DO_CARGO, NO_PERMISSIONS, ALL_PERMISSIONS,
  resolveReportTabs, ALL_REPORT_TABS, REPORT_TAB_LABELS, REPORT_TAB_HINTS,
} from '@/lib/permissions'
import { MODULE_GROUPS, LEVEL_COPY } from '@/lib/permissions-copy'

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

  // O Atendimento entrou em 2026-11-18 (o Heitor: "Agenda é agenda e atendimento é atendimento").
  it('declara níveis para os 20 módulos, sem sobra', () => {
    expect(Object.keys(MODULE_LEVELS).sort()).toEqual([...ALL_MODULES].sort())
    expect(ALL_MODULES).toHaveLength(20)
  })

  // A regra mudou em 2026-11-16 (o Heitor: "Auditoria é só admin"): a Auditoria
  // segue módulo do sistema (o menu, o plano), mas não se dá a cargo nenhum —
  // só a Admin da rede a tem (tests/decisoes-de-16-11.test.ts).
  it('a Auditoria (CF3c) é módulo, mas só da Admin da rede: um cargo só a tem em Sem acesso, fora da tela de Cargos', () => {
    expect(ALL_MODULES).toContain('audit')
    expect(MODULE_LEVELS.audit).toEqual(['NONE'])
    expect(LEVEL_COPY.audit.VIEW).toBeUndefined()
    expect(MODULE_GROUPS.flatMap(g => [...g.modules])).not.toContain('audit')
  })

  it('o Copilot é um módulo do cargo: Sem acesso, Ver (consultas) e Gerenciar (gravações)', () => {
    expect(ALL_MODULES).toContain('copilot')
    expect(MODULE_LEVELS.copilot).toEqual(['NONE', 'VIEW', 'MANAGE'])
    expect(LEVEL_COPY.copilot.VIEW).toBeTruthy()
    expect(LEVEL_COPY.copilot.MANAGE).toBeTruthy()
  })
})

describe('MODULE_GROUPS (a tela de Cargos)', () => {
  // Módulo fora de todo grupo não aparece na tela: ninguém consegue ligá-lo
  // num cargo. Era o caso de Automações até 2026-10-08. A exceção, de
  // propósito, é o que é só da Admin da rede (a Auditoria, 2026-11-16).
  it('todo módulo de cargo está em exatamente um grupo', () => {
    const vistos = MODULE_GROUPS.flatMap(g => [...g.modules])
    expect([...vistos].sort()).toEqual([...MODULOS_DO_CARGO].sort())
    expect(new Set(vistos).size).toBe(vistos.length)
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
