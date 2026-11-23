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

describe('quem só recebe não entra no financeiro', () => {
  it('cashier sozinho não abre a tela — ela é do módulo financeiro', () => {
    // `cashier` governa receber na recepção. Enquanto existia abrir/fechar
    // caixa ele tinha tela própria; sem isso, entrar aqui dava tela vazia.
    const soRecebe = menuEntriesFor(BRANCH_MENU, com({ cashier: 'MANAGE' }))
    expect(soRecebe.map(e => e.key)).not.toContain('financial')
  })

  it('com financeiro, a entrada aparece', () => {
    const comFin = menuEntriesFor(BRANCH_MENU, com({ financial: 'VIEW' })).find(e => e.key === 'financial')
    expect(comFin!.label).toBe('Financeiro')
  })

  // D1 da 23ª: a regra mudou — Tratamentos segue a página (a Agenda em Ver).
  // "Onde ele cobra" caiu com o PDV4/PT1c/PDV7: o plano se cobra no PDV.
  it('e quem só recebe não vê Tratamentos: a página pede a Agenda', () => {
    const keys = menuEntriesFor(BRANCH_MENU, com({ cashier: 'MANAGE' })).map(e => e.key)
    expect(keys).not.toContain('planejamentos')
  })
})

describe('entradas com mais de uma porta', () => {
  // Desde 2026-11-18 o plano é de quem atende: Tratamentos abre pelo Atendimento
  // (a Agenda voltou a ser agenda — o Heitor, "Agenda é agenda e atendimento é atendimento").
  it('Tratamentos abre pelo Atendimento — nem pela Agenda, nem pelo prontuário, nem por quem recebe', () => {
    expect(menuEntriesFor(BRANCH_MENU, com({ atendimento: 'VIEW' })).map(e => e.key)).toContain('planejamentos')
    expect(menuEntriesFor(BRANCH_MENU, com({ agenda: 'MANAGE' })).map(e => e.key)).not.toContain('planejamentos')
    expect(menuEntriesFor(BRANCH_MENU, com({ medical_records: 'VIEW' })).map(e => e.key)).not.toContain('planejamentos')
    expect(menuEntriesFor(BRANCH_MENU, com({ cashier: 'MANAGE' })).map(e => e.key)).not.toContain('planejamentos')
  })

  it('Configurações abre por settings, roles OU forms — nos dois portais', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      for (const modulo of ['settings', 'roles', 'forms'] as const) {
        const keys = menuEntriesFor(menu, com({ [modulo]: 'MANAGE' })).map(e => e.key)
        expect(keys).toContain('settings')
      }
    }
  })

  it('quem administra o financeiro da rede chega a Configurações (aba de comissões); na unidade, não', () => {
    expect(menuEntriesFor(ADMIN_MENU, com({ financial: 'MANAGE' })).map(e => e.key)).toContain('settings')
    expect(menuEntriesFor(ADMIN_MENU, com({ financial: 'VIEW' })).map(e => e.key)).not.toContain('settings')
    expect(menuEntriesFor(BRANCH_MENU, com({ financial: 'MANAGE' })).map(e => e.key)).not.toContain('settings')
  })

  it('quem só chega por Tags e Importações vê isso no rótulo, curto o bastante para não sair cortado no menu (A11, J-16)', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      for (const modulo of ['clients', 'crm'] as const) {
        const e = menuEntriesFor(menu, com({ [modulo]: 'MANAGE' })).find(x => x.key === 'settings')
        expect(e?.label).toBe('Tags e importações')
      }
      // com um módulo de configuração de verdade, é Configurações
      const completa = menuEntriesFor(menu, com({ clients: 'MANAGE', settings: 'MANAGE' })).find(x => x.key === 'settings')
      expect(completa?.label).toBe('Configurações')
    }
    // o financeiro da rede abre a aba de comissões: também é Configurações
    const fin = menuEntriesFor(ADMIN_MENU, com({ clients: 'MANAGE', financial: 'MANAGE' })).find(x => x.key === 'settings')
    expect(fin?.label).toBe('Configurações')
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

  it('quem tem tudo vê as seis categorias, na ordem', () => {
    const secoes = menuSectionsFor(ADMIN_MENU, ALL_PERMISSIONS)
    expect(secoes.slice(1).map(s => s.key))
      .toEqual(['atendimento', 'planejamento', 'vendas', 'marketing', 'dinheiro', 'gestao'])
  })

  it('Vendas é o funil e o que se vende; Marketing, a captação — nos dois portais', () => {
    const rede = menuSectionsFor(ADMIN_MENU, ALL_PERMISSIONS)
    expect(rede.find(s => s.key === 'vendas')!.entries.map(e => e.key)).toEqual(['pdv', 'inbox', 'oportunidades', 'procedures', 'pacotes'])
    expect(rede.find(s => s.key === 'marketing')!.entries.map(e => e.key)).toEqual(['notificacoes', 'marketing', 'templates'])
    expect(rede.find(s => s.key === 'gestao')!.entries.map(e => e.key)).not.toContain('procedures')
    const unidade = menuSectionsFor(BRANCH_MENU, ALL_PERMISSIONS)
    expect(unidade.find(s => s.key === 'vendas')!.entries.map(e => e.key)).toEqual(['pdv', 'inbox', 'oportunidades', 'procedures', 'pacotes'])
  })

  it('Planejamento junta Tratamentos e Injetáveis', () => {
    const secoes = menuSectionsFor(ADMIN_MENU, com({ atendimento: 'VIEW', medical_records: 'VIEW' }))
    const planejamento = secoes.find(s => s.key === 'planejamento')
    expect(planejamento!.entries.map(e => e.label)).toEqual(['Tratamentos', 'Injetáveis'])
  })

  it('quem só recebe não vê Tratamentos (D1 da 23ª) nem Injetáveis, que é clínico', () => {
    const entries = menuEntriesFor(BRANCH_MENU, com({ cashier: 'MANAGE' })).map(e => e.key)
    expect(entries).not.toContain('planejamentos')
    expect(entries).not.toContain('injetaveis')
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
    // O Atendimento em Ver abre Tratamentos (a régua da página, 2026-11-18).
    expect(menuLabelsFor(BRANCH_MENU, com({ agenda: 'VIEW', atendimento: 'VIEW' }))).toEqual(['Dashboard', 'Agenda', 'Tratamentos'])
  })
})

// As vistas pessoais (SM2, o Heitor, 2026-11-23: "pode tirar, as vistas
// pessoais resolvem"): sem o módulo, quem atende tem a Minha agenda, e quem
// atende ou tem comissão de venda, as Minhas comissões.
describe('as vistas pessoais no menu (DaPessoa)', () => {
  it('Minhas comissões: de quem atende ou tem comissão de venda, sem o Financeiro — nos dois menus e na pré-visualização do cargo', () => {
    const p = com({})
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      for (const pessoa of [{ atende: true }, { comissaoDeVenda: true }]) {
        const minhas = menuEntriesFor(menu, p, undefined, pessoa).find(e => e.key === 'minhas-comissoes')
        expect(minhas?.label).toBe('Minhas comissões')
        expect(minhas?.href).toMatch(/\/financeiro\/comissoes$/)
        expect(menuEntriesFor(menu, p, undefined, pessoa).map(e => e.key)).not.toContain('financial')
      }
      expect(menuEntriesFor(menu, p, undefined, {}).map(e => e.key)).not.toContain('minhas-comissoes')
      expect(menuEntriesFor(menu, p).map(e => e.key)).not.toContain('minhas-comissoes')
    }
    expect(menuLabelsFor(BRANCH_MENU, p, { atende: true })).toContain('Minhas comissões')
  })

  it('com o Financeiro (Ver ou Gerenciar), é o "Financeiro" e não há Minhas comissões', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      for (const nivel of ['VIEW', 'MANAGE'] as const) {
        const chaves = menuEntriesFor(menu, com({ financial: nivel }), undefined, { atende: true, comissaoDeVenda: true }).map(e => e.key)
        expect(chaves).toContain('financial')
        expect(chaves).not.toContain('minhas-comissoes')
      }
    }
  })

  it('Minha agenda: de quem atende, sem a Agenda; com a Agenda, "Agenda"', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      expect(menuEntriesFor(menu, com({}), undefined, { atende: true }).find(e => e.key === 'agenda')?.label).toBe('Minha agenda')
      // A comissão de venda não abre a agenda: ela é de quem atende.
      expect(menuEntriesFor(menu, com({}), undefined, { comissaoDeVenda: true }).map(e => e.key)).not.toContain('agenda')
      expect(menuEntriesFor(menu, com({})).map(e => e.key)).not.toContain('agenda')
      expect(menuEntriesFor(menu, com({ agenda: 'VIEW' }), undefined, { atende: true }).find(e => e.key === 'agenda')?.label).toBe('Agenda')
    }
    expect(menuLabelsFor(BRANCH_MENU, com({}), { atende: true })).toEqual(['Dashboard', 'Minha agenda', 'Minhas comissões'])
  })

  it('fora do plano, nem a vista: as Minhas comissões são do recurso de comissões', () => {
    const plano = { funcionalidades: ['agenda'] }
    const chaves = menuEntriesFor(BRANCH_MENU, com({}), plano, { atende: true }).map(e => e.key)
    expect(chaves).not.toContain('minhas-comissoes')
  })
})

// PDV1 (a revisão do Heitor, 2026-11-13: "vamos fazer um PDV"): a tela de
// vender e de receber, de quem recebe pagamento (`podeReceber`: o PDV em
// Gerenciar ou o Financeiro em Gerenciar) — nos dois portais.
describe('o PDV', () => {
  it('aparece a quem recebe, em Vendas, nos dois portais', () => {
    for (const [menu, href] of [[ADMIN_MENU, '/admin/pdv'], [BRANCH_MENU, '/pdv']] as const) {
      for (const p of [com({ cashier: 'MANAGE' }), com({ financial: 'MANAGE' })]) {
        const pdv = menuEntriesFor(menu, p).find(e => e.key === 'pdv')
        expect(pdv?.href).toBe(href)
        expect(pdv?.label).toBe('PDV')
      }
    }
  })

  it('não aparece a quem não recebe (o financeiro só em Ver, a agenda)', () => {
    for (const menu of [ADMIN_MENU, BRANCH_MENU]) {
      for (const p of [com({ financial: 'VIEW' }), com({ agenda: 'MANAGE', clients: 'MANAGE' })]) {
        expect(menuEntriesFor(menu, p).map(e => e.key)).not.toContain('pdv')
      }
    }
  })
})
