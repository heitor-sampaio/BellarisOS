import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext } from '@estetica-os/types'
import { atendeForaDasUnidades, atendeQueGrava, ATENDE_SO_NAS_UNIDADES_DA_PESSOA } from '@/lib/equipe/atende'
import { alcancaOAgendamento } from '@/lib/auth'
import { NO_PERMISSIONS } from '@/lib/permissions'

/**
 * O "Atende" só vale nas unidades DA PESSOA (o Heitor, 2026-11-23: "uma pessoa
 * só pode atender nas unidades que faz parte, isso é obvio"). A abrangência
 * "A rede inteira" cabe qualquer unidade da rede; a de unidades, só elas.
 * Saiu o caminho de quem atendia fora da abrangência e chegava aos próprios
 * agendamentos de lá (`alcancaOAgendamento` com o `atendeEm`, AG-30).
 */
const ler = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
const corpo = (f: string, nome: string) => {
  const t = ler(f)
  const i = t.indexOf(`export async function ${nome}`)
  if (i < 0) throw new Error(`${nome} não está em ${f}`)
  const j = t.indexOf('\nexport ', i + 10)
  return t.slice(i, j < 0 ? undefined : j)
}

describe('atendeForaDasUnidades', () => {
  it('a rede inteira cabe qualquer unidade', () => {
    expect(atendeForaDasUnidades(['A', 'B', 'C'], null)).toEqual([])
  })
  it('quem tem unidades atende só nelas: a de fora é devolvida', () => {
    expect(atendeForaDasUnidades(['A'], ['A', 'B'])).toEqual([])
    expect(atendeForaDasUnidades(['A', 'SUL'], ['A', 'B'])).toEqual(['SUL'])
    expect(atendeForaDasUnidades([], ['A'])).toEqual([])
  })
  it('a recusa fala da regra, em português claro', () => {
    expect(ATENDE_SO_NAS_UNIDADES_DA_PESSOA).toBe('O “Atende” só vale nas unidades da pessoa.')
  })
})

describe('atendeQueGrava com as unidades da pessoa', () => {
  const ativas = ['A', 'B', 'C']
  it('a marca numa unidade desativada fora das unidades da pessoa sai (a tela não a mostra)', () => {
    expect(atendeQueGrava({ pedido: ['A'], antes: ['A', 'Z'], ativas, unidadeDeQuemEdita: null, unidadesDaPessoa: ['A'] })).toEqual(['A'])
  })
  it('a desativada que é da pessoa fica', () => {
    expect(atendeQueGrava({ pedido: ['A'], antes: ['A', 'Z'], ativas, unidadeDeQuemEdita: null, unidadesDaPessoa: ['A', 'Z'] })).toEqual(['A', 'Z'])
  })
})

describe('as actions da Equipe recusam o "Atende" fora das unidades da pessoa', () => {
  for (const nome of ['createTeamMember', 'updateTeamMember']) {
    it(nome, () => {
      const c = corpo('actions/team.ts', nome)
      expect(c).toContain('atendeForaDasUnidades(')
      expect(c).toMatch(/if \(foraDoAtende\.length\) return \{ error: await recusaDoAtendeFora\(/)
    })
  }
  it('a recusa começa pela regra', () => {
    const t = ler('actions/team.ts')
    const i = t.indexOf('async function recusaDoAtendeFora')
    expect(i).toBeGreaterThan(-1)
    expect(t.slice(i, t.indexOf('\n}\n', i))).toContain('ATENDE_SO_NAS_UNIDADES_DA_PESSOA')
  })
})

describe('alcancaOAgendamento é só a abrangência', () => {
  const ctx = (over: Partial<TenantContext>): TenantContext => ({
    userId: 'auth-1', internalUserId: 'user-1', userName: 'Ana', roleLabel: 'Cargo', tenantId: 'rede-1',
    branchId: 'NORTE', role: 'BRANCH_ADMIN', roleId: 'role-1', clientId: null,
    permissions: { ...NO_PERMISSIONS }, reportTabs: [], providesServices: true, isNetworkAdmin: false, isClient: false,
    ...over,
  })
  it('o agendamento DELA numa unidade fora das dela não está ao alcance, nem com o "Atende" marcado lá', () => {
    const ana = ctx({ unidades: ['NORTE'], atendeEm: ['NORTE', 'SUL'] })
    expect(alcancaOAgendamento(ana, 'SUL', 'user-1')).toBe(false)
  })
  it('nas unidades dela e para quem tem a rede inteira, sim', () => {
    expect(alcancaOAgendamento(ctx({ unidades: ['NORTE'] }), 'NORTE', 'outra')).toBe(true)
    expect(alcancaOAgendamento(ctx({ branchId: null, unidades: null }), 'SUL', 'outra')).toBe(true)
  })
})
