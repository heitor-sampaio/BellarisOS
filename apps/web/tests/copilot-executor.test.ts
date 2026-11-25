import { describe, it, expect } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_PERMISSIONS } from '@/lib/permissions'
import { ferramentasDoCargo, paraOModelo, contextoDoCopilot, canonico, resumoParaOModelo } from '@/lib/copilot/executor'
import { copilotNoPlano, copilotNoCargo, copilotForaDoPlanoNaTela } from '@/lib/copilot/disponivel'
import { cotaDoCopilot, normalizarRecursos, lerRecursos, FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O executor do Copilot: o modelo só RECEBE as ferramentas que o cargo pode
 * usar (módulo/nível, funcionalidade do plano, trava a mais), e o catálogo vai
 * ao modelo como JSON Schema. E a liberação/cota pelo plano.
 */

const TODAS = FUNCIONALIDADES.map(f => f.chave)
// O acesso ao Copilot é do cargo (o módulo `copilot`): os casos abaixo partem de quem o tem por inteiro.
const SEM_NADA = { ...NO_PERMISSIONS, copilot: 'MANAGE' } as ResolvedPermissions

function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Ana', roleLabel: 'Recepção',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: SEM_NADA, reportTabs: [], providesServices: false,
    isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  }
}
const nomes = (c: TenantContext) => ferramentasDoCargo(c).map(f => f.nome).sort()

describe('ferramentasDoCargo', () => {
  it('cargo sem módulo nenhum só recebe a busca (que filtra sozinha)', () => {
    expect(nomes(ctx())).toEqual(['buscar'])
  })

  it('agenda VIEW libera as leituras da agenda e o catálogo, sem financeiro nem estoque', () => {
    const n = nomes(ctx({ permissions: { ...SEM_NADA, agenda: 'VIEW' } as ResolvedPermissions }))
    expect(n).toEqual(expect.arrayContaining(['agendamentos', 'horarios_livres', 'procedimentos']))
    expect(n).not.toContain('lancamentos')
    expect(n).not.toContain('estoque')
  })

  // Sem o "só os meus" (SM1/SM5, o Heitor, 2026-11-23): o Financeiro em Ver recebe os lançamentos; a
  // vista pessoal (quem atende sem o Financeiro) só mostra as Minhas comissões, e não os recebe.
  it('o Financeiro em Ver recebe os lançamentos da rede; quem só atende, sem o Financeiro, não', () => {
    const base = { permissions: { ...SEM_NADA, financial: 'VIEW' } as ResolvedPermissions }
    expect(nomes(ctx(base))).toContain('lancamentos')
    expect(nomes(ctx({ providesServices: true, atendeEm: ['b1'] }))).not.toContain('lancamentos')
  })

  it('funcionalidade fora do plano tira a ferramenta — para o dono também', () => {
    const dono = { permissions: ALL_PERMISSIONS, isNetworkAdmin: true }
    expect(nomes(ctx(dono))).toContain('oportunidades')
    const semOportunidades = ctx({ ...dono, plano: { funcionalidades: TODAS.filter(f => f !== 'oportunidades'), limites: { unidades: null, membros: null, whatsapp: null } } })
    expect(nomes(semOportunidades)).not.toContain('oportunidades')
  })
})

describe('o acesso ao Copilot pelo cargo (módulo copilot)', () => {
  const agenda = (copilot: 'NONE' | 'VIEW' | 'MANAGE') =>
    ctx({ permissions: { ...NO_PERMISSIONS, agenda: 'MANAGE', clients: 'MANAGE', copilot } as ResolvedPermissions })

  it('Sem acesso: o painel não aparece e nenhuma ferramenta vai ao modelo', () => {
    expect(copilotNoCargo(agenda('NONE'))).toBe(false)
    expect(nomes(agenda('NONE'))).toEqual([])
  })

  // A regra mudou: "cada passo pertence a UM módulo, e nenhuma ação pede dois"
  // (o Heitor, 2026-11-23, docs/revisao.md:1309, aprovada em :1329-1330:
  // "concordo, pode anotar, marcar as questões e ajustar o codigo"), lida para
  // o Copilot na revisão de 24/11 (docs/catalogo/copilot.md, Q02): o Copilot em
  // Ver liga a ferramenta, e a gravação pede só a permissão da ação, como na
  // tela. Era: "Ver: só as consultas — nenhuma gravação".
  it('Ver: consulta e age — cada gravação pede só a permissão da ação, como na tela', () => {
    expect(copilotNoCargo(agenda('VIEW'))).toBe(true)
    const n = nomes(agenda('VIEW'))
    expect(n).toEqual(expect.arrayContaining(['agendamentos', 'horarios_livres', 'cliente']))
    expect(n).toContain('agendar')
    expect(n).toContain('cadastrar_cliente')
    expect(n, 'sem o Financeiro em Gerenciar, nada de lançar').not.toContain('lancar')
  })

  it('Gerenciar: consultas e gravações (cada gravação ainda exige o módulo dela)', () => {
    const n = nomes(agenda('MANAGE'))
    expect(n).toEqual(expect.arrayContaining(['agendamentos', 'agendar', 'cadastrar_cliente']))
    expect(n).not.toContain('lancar')
  })
})

// A vista pessoal (SM2, CLAUDE.md §11) no Copilot — decidida na revisão de 24/11
// (docs/catalogo/copilot.md, Q03): quem atende sem a Agenda (ou sem o
// Financeiro) pergunta pela Minha agenda e pelas Minhas comissões. A vista só
// MOSTRA: só leitura, só as dela.
describe('a vista pessoal no Copilot (Minha agenda, Minhas comissões)', () => {
  const quemAtende = (over: Partial<ResolvedPermissions> = {}, mais: Partial<TenantContext> = {}) =>
    ctx({ providesServices: true, atendeEm: ['b1'], permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...over } as ResolvedPermissions, ...mais })

  it('quem atende sem a Agenda e sem o Financeiro recebe minha_agenda e minhas_comissoes — e não a agenda de todos', () => {
    const n = nomes(quemAtende())
    expect(n).toContain('minha_agenda')
    expect(n).toContain('minhas_comissoes')
    expect(n).not.toContain('agendamentos')
    expect(n).not.toContain('lancamentos')
  })

  it('as duas são só de LEITURA', () => {
    const vistas = ferramentasDoCargo(quemAtende()).filter(f => ['minha_agenda', 'minhas_comissoes'].includes(f.nome))
    expect(vistas).toHaveLength(2)
    for (const f of vistas) expect(f.tipo).toBe('leitura')
  })

  it('com a Agenda ou o Financeiro, a vista não vem: o módulo já mostra tudo', () => {
    const n = nomes(quemAtende({ agenda: 'VIEW', financial: 'VIEW' }))
    expect(n).not.toContain('minha_agenda')
    expect(n).not.toContain('minhas_comissoes')
    expect(n).toContain('agendamentos')
  })

  it('quem não atende nem tem comissão no nome não tem vista nenhuma', () => {
    const n = nomes(quemAtende({}, { providesServices: false, atendeEm: [] }))
    expect(n).not.toContain('minha_agenda')
    expect(n).not.toContain('minhas_comissoes')
  })

  it('sem as Comissões no plano, nada de Minhas comissões', () => {
    const semComissoes = { funcionalidades: TODAS.filter(f => f !== 'comissoes'), limites: { unidades: null, membros: null, whatsapp: null } }
    expect(nomes(quemAtende({}, { plano: semComissoes }))).not.toContain('minhas_comissoes')
  })
})

// O convite do Copilot avulso (o "Copilot: fora do plano") é de quem contrata,
// e a configuração da rede toda é só da Admin da rede (o Heitor, 18/11:
// "Configuração da rede toda só pela conta admin"; DEVLOG 2026-11-24 (7)).
describe('o Copilot fora do plano: o aviso só à Admin da rede', () => {
  const semCopilot = { funcionalidades: TODAS.filter(f => f !== 'copilot'), limites: { unidades: null, membros: null, whatsapp: null } }
  it('da rede com Configurações em Gerenciar, sem ser a Admin da rede: não vê', () => {
    const c = ctx({ plano: semCopilot, permissions: { ...NO_PERMISSIONS, settings: 'MANAGE' } as ResolvedPermissions })
    expect(copilotForaDoPlanoNaTela(c)).toBe(false)
  })
  it('a Admin da rede (o cargo gravado) vê', () => {
    expect(copilotForaDoPlanoNaTela(ctx({ plano: semCopilot, permissions: ALL_PERMISSIONS, isNetworkAdmin: true }))).toBe(true)
  })
  it('com o Copilot no plano, nem a Admin vê o aviso', () => {
    expect(copilotForaDoPlanoNaTela(ctx({ permissions: ALL_PERMISSIONS, isNetworkAdmin: true }))).toBe(false)
  })
})

describe('paraOModelo', () => {
  it('cada ferramenta vira uma função com JSON Schema de objeto, sem $schema', () => {
    const lista = paraOModelo(ferramentasDoCargo(ctx({ permissions: ALL_PERMISSIONS })))
    expect(lista.length).toBeGreaterThan(5)
    for (const f of lista) {
      expect(f.type).toBe('function')
      expect(f.parameters.type).toBe('object')
      expect(f.parameters).not.toHaveProperty('$schema')
      expect(f.description.length).toBeGreaterThan(20)
    }
  })
})

describe('contextoDoCopilot', () => {
  it('marca o nome de quem age', () => {
    expect(contextoDoCopilot(ctx()).userName).toBe('Ana (via Copilot)')
  })
})

describe('liberação e cota pelo plano', () => {
  it('sem plano NÃO libera o Copilot (ele custa por uso); com o plano que o inclui, libera', () => {
    expect(copilotNoPlano(ctx({ plano: null }))).toBe(false)
    expect(copilotNoPlano(ctx())).toBe(true)
    expect(copilotNoPlano(ctx({ plano: { funcionalidades: ['agenda'], limites: { unidades: null, membros: null, whatsapp: null } } }))).toBe(false)
  })

  it('a cota: ausente ou inválida é sem limite; a da tela é estrita', () => {
    expect(cotaDoCopilot(null)).toBeNull()
    expect(cotaDoCopilot({ cotas: { copilot: 2_000_000 } })).toBe(2_000_000)
    expect(cotaDoCopilot({ cotas: { copilot: -1 } as never })).toBeNull()
    expect(lerRecursos({ funcionalidades: [], limites: {}, cotas: { copilot: 500_000 } })?.cotas).toEqual({ copilot: 500_000 })
    const ok = normalizarRecursos({ funcionalidades: ['copilot'], limites: { unidades: null, membros: null, whatsapp: null }, cotas: { copilot: 1_000_000 } })
    expect(ok).toMatchObject({ ok: true, recursos: { cotas: { copilot: 1_000_000 } } })
    const ruim = normalizarRecursos({ funcionalidades: [], limites: { unidades: null, membros: null, whatsapp: null }, cotas: { copilot: 'muito' } })
    expect(ruim.ok).toBe(false)
  })
})

describe('canonico', () => {
  it('o resumo que voltou do jsonb (chaves reordenadas) é o MESMO cartão', () => {
    const visto = { titulo: 'Agendar', linhas: [{ rotulo: 'Cliente', valor: 'Bia' }], aviso: 'x' }
    const doBanco = { aviso: 'x', linhas: [{ valor: 'Bia', rotulo: 'Cliente' }], titulo: 'Agendar' }
    expect(canonico(doBanco)).toBe(canonico(visto))
    expect(canonico({ ...visto, linhas: [{ rotulo: 'Cliente', valor: 'Ana' }] })).not.toBe(canonico(visto))
  })
})

describe('resumoParaOModelo', () => {
  it('o CPF do cartão volta ao modelo MASCARADO; a pessoa vê inteiro no cartão', () => {
    const resumo = {
      titulo: 'Cadastrar cliente',
      linhas: [
        { rotulo: 'Nome', valor: 'Maria' },
        { rotulo: 'CPF', valor: '123.456.789-09' },
        { rotulo: 'CPF', valor: '(já tinha) → 987.654.321-00' },
      ],
    }
    expect(resumoParaOModelo(resumo).linhas).toEqual([
      { rotulo: 'Nome', valor: 'Maria' },
      { rotulo: 'CPF', valor: '***.***.***-09' },
      { rotulo: 'CPF', valor: '(já tinha) → ***.***.***-00' },
    ])
    expect(resumo.linhas[1]!.valor, 'o cartão não muda').toBe('123.456.789-09')
  })
})
