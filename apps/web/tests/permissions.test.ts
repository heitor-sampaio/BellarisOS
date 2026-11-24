import { describe, it, expect } from 'vitest'
import {
  hasLevel, resolvePermissions,
  MODULE_LEVELS, ALL_MODULES, MODULOS_DO_CARGO, NO_PERMISSIONS, ALL_PERMISSIONS,
  resolveReportTabs, ALL_REPORT_TABS, REPORT_TAB_LABELS, REPORT_TAB_HINTS,
} from '@/lib/permissions'
import { MODULE_GROUPS, LEVEL_COPY } from '@/lib/permissions-copy'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

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

describe('a matriz de Cargos diz a regra de agora (plataforma.md, Equipe e Cargos)', () => {
  const ler = (f: string) => nodeFs.readFileSync(nodePath.resolve(__dirname, '..', f), 'utf8')

  describe('a Equipe dá só o cargo que não passa do próprio, e Cargos é só da Admin da rede', () => {
    it('nada de "cargo mais poderoso" nem de "conceder a si mesmo"', async () => {
      const copy = ler('lib/permissions-copy.ts')
      expect(copy).not.toContain('mais poderoso que o próprio')
      expect(copy).not.toContain('conceder a si mesmo')
      const { LEVEL_COPY } = await import('@/lib/permissions-copy')
      expect(LEVEL_COPY.roles.MANAGE).toMatch(/só da Admin da rede/)
      expect(LEVEL_COPY.team.MANAGE).toMatch(/não passe do (seu|próprio)/)
    })
  })

  describe('o resumo do cargo não promete o que a abrangência não dá', () => {
    it('"Na rede" é de quem tem a rede inteira, e a configuração da rede só se vê', async () => {
      const { notaDoResumoDaRede } = await import('@/lib/permissions-copy')
      const nota = notaDoResumoDaRede(['Dashboard', 'Agenda', 'Notificações', 'Anúncios', 'Templates', 'Automações'], ['Dashboard', 'Agenda'])
      expect(nota).toMatch(/“A rede inteira”/)
      expect(nota).toMatch(/Notificações, Templates e Automações/)
      expect(nota).toMatch(/só da Admin da rede/)
      expect(notaDoResumoDaRede(['Dashboard', 'Agenda'], ['Dashboard', 'Agenda'])).toBeNull()
      expect(ler('components/admin/roles-editor.tsx')).toContain('data-resumo-da-rede')
    })
  })
})

/**
 * O cargo de sistema "Não definido" (`NAO_DEFINIDO`) e o cargo que não dá
 * acesso a nada (plataforma.md, Equipe e Cargos):
 * - a Equipe dá o "Não definido" (ao criar e ao editar), e quem o tem não abre
 *   módulo nenhum — o contexto zera tudo, por mais que uma linha da matriz
 *   apareça um dia para ele;
 * - a Equipe avisa, na linha e na edição, quando o cargo da pessoa não dá
 *   acesso a nada (todos os módulos em Sem acesso, ou o "Não definido");
 *   salvar avisa e não recusa (princípio 2); e a tela de Cargos diz o mesmo do
 *   cargo sem nenhum módulo. "Nenhum módulo" é o que o CONTEXTO deixa
 *   (princípio 3): o plano corta, Relatórios sem aba vale nada, a Auditoria é
 *   só da Admin da rede.
 */
const WEB_DOS_CARGOS = nodePath.join(__dirname, '..')
const fonte = (caminho: string) => nodeFs.readFileSync(nodePath.join(WEB_DOS_CARGOS, caminho), 'utf8')

describe('o cargo "Não definido" não dá permissão de nada, e a Equipe o dá', () => {
  it('é reconhecido pela CHAVE do cargo de sistema, nunca pelo rótulo', async () => {
    const { ehCargoNaoDefinido } = await import('@/lib/cargos/sem-acesso')
    expect(ehCargoNaoDefinido({ key: 'NAO_DEFINIDO', is_system: true })).toBe(true)
    // Um cargo da rede com a mesma chave, mas sem ser de sistema, não é ele.
    expect(ehCargoNaoDefinido({ key: 'NAO_DEFINIDO', is_system: false })).toBe(false)
    expect(ehCargoNaoDefinido({ key: 'NETWORK_ADMIN', is_system: true })).toBe(false)
    expect(ehCargoNaoDefinido(null)).toBe(false)
  })

  it('a Equipe o dá: fica entre as opções, depois dos cargos da rede; o Admin da rede não', async () => {
    const { cargosQueSeDaoPelaEquipe, cargoSeDaPelaEquipe } = await import('@/lib/cargos/sem-acesso')
    const cargos = [
      { id: 'a', key: 'NETWORK_ADMIN', label: 'Admin da rede', is_system: true },
      { id: 'n', key: 'NAO_DEFINIDO', label: 'Não definido', is_system: true },
      { id: 'g', key: 'BRANCH_ADMIN', label: 'Gerente', is_system: false },
      { id: 'r', key: 'RECEPTIONIST', label: 'Recepcionista', is_system: false },
    ]
    expect(cargosQueSeDaoPelaEquipe(cargos).map(c => c.id)).toEqual(['g', 'r', 'n'])
    expect(cargoSeDaPelaEquipe({ key: 'NAO_DEFINIDO', is_system: true })).toBe(true)
    expect(cargoSeDaPelaEquipe({ key: 'NETWORK_ADMIN', is_system: true })).toBe(false)
    expect(cargoSeDaPelaEquipe({ key: 'GERENTE_X', is_system: false })).toBe(true)
  })

  it('as duas Equipes e a action usam a mesma regra', () => {
    for (const pagina of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
      expect(fonte(pagina), pagina).toMatch(/cargosQueSeDaoPelaEquipe\(/)
      expect(fonte(pagina), pagina).not.toMatch(/filter\(r => !r\.is_system && r\.key !== 'NETWORK_ADMIN'\)/)
    }
    const acao = fonte('actions/team.ts')
    expect(acao).toMatch(/cargoSeDaPelaEquipe\(/)
    // Mantido o cargo, só o da Admin da rede deixa cargo e unidades como estão:
    // o "Não definido" segue editável nas unidades.
    expect(acao).toMatch(/const mantemCargoDoSistema = [^\n]*NETWORK_ADMIN/)
  })

  it('o contexto não dá NADA a quem tem o "Não definido" — nenhuma linha da matriz vale', () => {
    const auth = fonte('lib/auth.ts')
    expect(auth).toMatch(/member\?\.semCargo/)
    expect(auth).toMatch(/semCargo[\s\S]{0,200}NO_PERMISSIONS/)
    const cache = fonte('lib/cached-queries.ts')
    expect(cache).toMatch(/semCargo: ehCargoNaoDefinido\(/)
    // O formato do membro em cache mudou: a entrada velha, sem o campo, não serve.
    expect(cache).not.toMatch(/`member-v3-\$\{authId\}`/)
  })

  it('o inbox não abre caixa nenhuma para quem está sem cargo', async () => {
    const { caixasDoAlcance } = await import('@/lib/inbox/alcance')
    const ctx = { isNetworkAdmin: false, roleId: 'n', tenantId: 't', internalUserId: 'u', semCargo: true } as never
    // Nem consulta o banco: o cargo de sistema "Não definido" não é o "vê tudo".
    expect(await caixasDoAlcance({} as never, ctx)).toEqual([])
  })
})

describe('o cargo que não dá acesso a nada: a Equipe e os Cargos avisam, e não recusam', () => {
  const semPlano = { foraDoPlano: [], abasForaDoPlano: [] }

  it('todos em Sem acesso: não abre nada', async () => {
    const { cargoSemAcesso } = await import('@/lib/cargos/sem-acesso')
    expect(cargoSemAcesso({ linhas: [], abas: [] }, semPlano)).toBe(true)
    expect(cargoSemAcesso({ linhas: [{ module: 'agenda', level: 'NONE' }], abas: [] }, semPlano)).toBe(true)
    expect(cargoSemAcesso({ linhas: [{ module: 'agenda', level: 'VIEW' }], abas: [] }, semPlano)).toBe(false)
  })

  it('o "Não definido" não abre nada, venha a matriz que vier', async () => {
    const { cargoSemAcesso } = await import('@/lib/cargos/sem-acesso')
    expect(cargoSemAcesso({ linhas: [{ module: 'agenda', level: 'MANAGE' }], abas: [], naoDefinido: true }, semPlano)).toBe(true)
  })

  it('conta o que o contexto deixa: o plano, Relatórios sem aba e a Auditoria', async () => {
    const { cargoSemAcesso } = await import('@/lib/cargos/sem-acesso')
    // Só o Copilot, numa rede sem o Copilot no plano.
    expect(cargoSemAcesso({ linhas: [{ module: 'copilot', level: 'MANAGE' }], abas: [] }, { foraDoPlano: ['copilot'], abasForaDoPlano: [] })).toBe(true)
    // Relatórios em Ver sem aba nenhuma (ou só com abas fora do plano).
    expect(cargoSemAcesso({ linhas: [{ module: 'reports', level: 'VIEW' }], abas: [] }, semPlano)).toBe(true)
    expect(cargoSemAcesso({ linhas: [{ module: 'reports', level: 'VIEW' }], abas: ['comercial'] }, { foraDoPlano: [], abasForaDoPlano: ['comercial'] })).toBe(true)
    expect(cargoSemAcesso({ linhas: [{ module: 'reports', level: 'VIEW' }], abas: ['overview'] }, semPlano)).toBe(false)
    // A Auditoria é só da Admin da rede: a linha gravada não vale.
    expect(cargoSemAcesso({ linhas: [{ module: 'audit', level: 'VIEW' }], abas: [] }, semPlano)).toBe(true)
  })

  it('os textos dizem a consequência, em permissão, sem nome de cargo', async () => {
    const t = await import('@/lib/cargos/sem-acesso')
    expect(t.MEMBRO_SEM_ACESSO).toBe('Sem acesso a nenhum módulo: ela entra e não vê nada.')
    expect(t.CARGO_SEM_ACESSO).toBe('Sem acesso a nenhum módulo: quem tem este cargo entra e não vê nada.')
    // Quem atende segue aparecendo como profissional (o "Atende" não é permissão).
    expect(t.MEMBRO_SEM_ACESSO_QUE_ATENDE).toMatch(/agenda/)
    expect(t.textoDoPainelSemAcesso({ semCargo: true, semAcesso: true })).toBe(
      'Você está sem cargo e ainda não tem acesso a nenhum módulo. Quem tem a Equipe em Gerenciar define o seu cargo.')
    expect(t.textoDoPainelSemAcesso({ semCargo: false, semAcesso: true })).toBe(
      'O seu cargo não dá acesso a nenhum módulo. Quem tem a Equipe em Gerenciar pode dar a você outro cargo.')
    // Com módulo, mas sem atalho no painel (o PDV, os Relatórios…): o menu leva.
    expect(t.textoDoPainelSemAcesso({ semCargo: false, semAcesso: false })).toMatch(/menu/)
  })

  it('a Equipe avisa na linha e na edição; o cadastro e a edição devolvem o aviso ao salvar', () => {
    for (const pagina of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
      expect(fonte(pagina), pagina).toMatch(/data-sem-acesso/)
      expect(fonte(pagina), pagina).toMatch(/cargosSemAcesso\(/)
    }
    for (const form of ['components/admin/team-form.tsx', 'components/branch/team-form.tsx', 'components/admin/team-member-edit.tsx']) {
      expect(fonte(form), form).toMatch(/data-cargo-sem-acesso/)
      expect(fonte(form), form).toMatch(/MEMBRO_SEM_ACESSO/)
    }
    const acao = fonte('actions/team.ts')
    expect(acao).toMatch(/avisoDoCargoSemAcesso\(/)
    // A edição confirma com o aviso, sem recusar.
    expect(fonte('components/admin/team-member-edit.tsx')).toMatch(/toast/)
  })

  it('a tela de Cargos diz o mesmo do cargo sem nenhum módulo, pela mesma conta', () => {
    const editor = fonte('components/admin/roles-editor.tsx')
    expect(editor).toMatch(/CARGO_SEM_ACESSO/)
    expect(editor).toMatch(/cargoSemAcesso\(/)
    expect(editor).toMatch(/data-cargo-sem-acesso/)
    expect(fonte('app/_shared/configuracoes.tsx')).toMatch(/abasForaDoPlano=/)
  })

  it('o painel de quem não abre nada diz por quê, nos dois portais', () => {
    expect(fonte('components/shared/dashboard-empty-state.tsx')).toMatch(/textoDoPainelSemAcesso\(/)
    expect(fonte('app/[slug]/dashboard/page.tsx')).toMatch(/semCargo=/)
    expect(fonte('components/admin/admin-dashboard-view.tsx')).toMatch(/semCargo=/)
  })
})
