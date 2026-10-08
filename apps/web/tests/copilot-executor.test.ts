import { describe, it, expect } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { ferramentasDoCargo, paraOModelo, contextoDoCopilot } from '@/lib/copilot/executor'
import { copilotNoPlano } from '@/lib/copilot/disponivel'
import { cotaDoCopilot, normalizarRecursos, lerRecursos, FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O executor do Copilot: o modelo só RECEBE as ferramentas que o cargo pode
 * usar (módulo/nível, funcionalidade do plano, trava a mais), e o catálogo vai
 * ao modelo como JSON Schema. E a liberação/cota pelo plano.
 */

const TODAS = FUNCIONALIDADES.map(f => f.chave)

function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Ana', roleLabel: 'Recepção',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: NO_PERMISSIONS, scopes: ALL_SCOPES, reportTabs: [], providesServices: false,
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
    const n = nomes(ctx({ permissions: { ...NO_PERMISSIONS, agenda: 'VIEW' } as ResolvedPermissions }))
    expect(n).toEqual(expect.arrayContaining(['agendamentos', 'horarios_livres', 'procedimentos']))
    expect(n).not.toContain('lancamentos')
    expect(n).not.toContain('estoque')
  })

  it('financeiro "só as próprias comissões" não recebe os lançamentos da clínica', () => {
    const base = { permissions: { ...NO_PERMISSIONS, financial: 'VIEW' } as ResolvedPermissions }
    expect(nomes(ctx(base))).toContain('lancamentos')
    expect(nomes(ctx({ ...base, scopes: { ...ALL_SCOPES, financial: 'OWN' } }))).not.toContain('lancamentos')
  })

  it('funcionalidade fora do plano tira a ferramenta — para o dono também', () => {
    const dono = { permissions: ALL_PERMISSIONS, isNetworkAdmin: true }
    expect(nomes(ctx(dono))).toContain('oportunidades')
    const semOportunidades = ctx({ ...dono, plano: { funcionalidades: TODAS.filter(f => f !== 'oportunidades'), limites: { unidades: null, membros: null, whatsapp: null } } })
    expect(nomes(semOportunidades)).not.toContain('oportunidades')
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
