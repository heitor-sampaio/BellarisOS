import { describe, it, expect } from 'vitest'
import { ADMIN_MENU, BRANCH_MENU, menuEntriesFor, menuSectionsFor, menuLabelsFor } from '@/lib/menu'
import { NO_PERMISSIONS, ALL_PERMISSIONS } from '@/lib/permissions'
import type { ResolvedPermissions } from '@estetica-os/types'

const com = (over: Partial<ResolvedPermissions>): ResolvedPermissions =>
  ({ ...NO_PERMISSIONS, ...over })

describe('menuEntriesFor', () => {
  it('cargo sem nada vê só o dashboard', () => {
    const entries = menuEntriesFor(BRANCH_MENU, NO_PERMISSIONS)
    expect(entries.map(e => e.key)).toEqual(['dashboard'])
  })

  it('cada módulo abre a sua entrada', () => {
    const keys = menuEntriesFor(ADMIN_MENU, com({ stock: 'VIEW' })).map(e => e.key)
    expect(keys).toContain('stock')
    expect(keys).not.toContain('financial')
  })

  it('rotas da rede são absolutas; as da unidade são sufixos', () => {
    const rede    = menuEntriesFor(ADMIN_MENU,  com({ agenda: 'VIEW' })).find(e => e.key === 'agenda')
    const unidade = menuEntriesFor(BRANCH_MENU, com({ agenda: 'VIEW' })).find(e => e.key === 'agenda')
    expect(rede!.href).toBe('/admin/agenda')
    expect(unidade!.href).toBe('/agenda')
  })
})

describe('rótulo que muda com o acesso', () => {
  it('quem só opera o caixa vê "Caixa"; com financeiro, "Financeiro"', () => {
    const soCaixa = menuEntriesFor(BRANCH_MENU, com({ cashier: 'MANAGE' })).find(e => e.key === 'financial')
    const comFin  = menuEntriesFor(BRANCH_MENU, com({ financial: 'VIEW' })).find(e => e.key === 'financial')
    expect(soCaixa!.label).toBe('Caixa')
    expect(comFin!.label).toBe('Financeiro')
  })
})

describe('entradas com mais de uma porta', () => {
  it('planejamentos abre por prontuário ou por quem recebe dinheiro', () => {
    const porProntuario = menuEntriesFor(BRANCH_MENU, com({ medical_records: 'VIEW' }))
    const porCaixa      = menuEntriesFor(BRANCH_MENU, com({ cashier: 'MANAGE' }))
    expect(porProntuario.map(e => e.key)).toContain('planejamentos')
    expect(porCaixa.map(e => e.key)).toContain('planejamentos')
  })

  it('Configurações abre por settings, roles OU forms — nos dois portais', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      for (const modulo of ['settings', 'roles', 'forms'] as const) {
        const keys = menuEntriesFor(menu, com({ [modulo]: 'MANAGE' })).map(e => e.key)
        expect(keys).toContain('settings')
      }
    }
  })

  it('a unidade não tem mais uma entrada separada de modelos de ficha', () => {
    expect(BRANCH_MENU.map(e => e.key)).not.toContain('forms')
  })
})

describe('menuSectionsFor', () => {
  it('categoria sem item não aparece', () => {
    const secoes = menuSectionsFor(BRANCH_MENU, com({ agenda: 'VIEW' }))
    const labels = secoes.map(s => s.label)
    expect(labels).toContain('Atendimento')
    expect(labels).not.toContain('Dinheiro e estoque')
  })

  it('o dashboard fica solto no topo, antes das categorias', () => {
    const secoes = menuSectionsFor(ADMIN_MENU, ALL_PERMISSIONS)
    expect(secoes[0]!.key).toBeNull()
    expect(secoes[0]!.entries.map(e => e.key)).toEqual(['dashboard'])
  })

  it('quem tem tudo vê as quatro categorias, na ordem', () => {
    const secoes = menuSectionsFor(ADMIN_MENU, ALL_PERMISSIONS)
    expect(secoes.slice(1).map(s => s.key)).toEqual(['atendimento', 'vendas', 'dinheiro', 'gestao'])
  })

  it('nenhuma entrada se perde entre a lista e as seções', () => {
    const planas = menuEntriesFor(ADMIN_MENU, ALL_PERMISSIONS).length
    const emSecoes = menuSectionsFor(ADMIN_MENU, ALL_PERMISSIONS)
      .reduce((s, sec) => s + sec.entries.length, 0)
    expect(emSecoes).toBe(planas)
  })
})

describe('menuLabelsFor', () => {
  it('devolve só os rótulos, na ordem do menu', () => {
    expect(menuLabelsFor(BRANCH_MENU, com({ agenda: 'VIEW' }))).toEqual(['Dashboard', 'Agenda'])
  })
})
