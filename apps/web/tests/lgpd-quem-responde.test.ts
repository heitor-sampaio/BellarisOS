import { describe, it, expect, vi, beforeEach } from 'vitest'
import { caminhoDaAbaLgpd } from '@/lib/lgpd/caminho-da-aba'

/**
 * Quem é avisado do pedido de dados (LGPD) e quem tem o caminho da aba: quem
 * RESPONDE — Clientes em Gerenciar (a cliente é da rede), a Admin da rede e,
 * com o prontuário no pacote, quem o libera (Prontuário em Gerenciar).
 * "A rede toda com Configurações em Gerenciar" era o critério de antes de
 * 18/11 (revisão de 24/11, Q09 do catálogo de Clientes: "Defeito a corrigir").
 */

const consultas: { tabela: string; filtros: [string, string, unknown][] }[] = []
const avisados: string[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const reg = { tabela, filtros: [] as [string, string, unknown][] }
      consultas.push(reg)
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'is', 'neq', 'order', 'limit']) {
        b[op] = (col?: string, val?: unknown) => { if (op === 'eq' || op === 'in') reg.filtros.push([op, String(col), val]); return b }
      }
      const dados = () => {
        if (tabela === 'lgpd_requests') return { tenant_id: 't1', requested_at: '2026-11-20T12:00:00Z', include_medical: false, clients: { name: 'Marina' } }
        if (tabela === 'role_permissions') return [{ role_id: 'r-clientes' }]
        if (tabela === 'users') return [{ id: 'u-clientes', branch_id: null, branches: null }]
        return null
      }
      b.maybeSingle = () => Promise.resolve({ data: dados(), error: null })
      b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: dados(), error: null }).then(ok)
      return b
    },
  }),
}))
vi.mock('@/lib/notifications/notify', () => ({ notifyUser: async (_a: unknown, id: string) => { avisados.push(id) } }))
vi.mock('@/lib/equipe/admin-da-rede', () => ({ adminsDaRede: async () => new Set<string>() }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({ fusoDaRede: async () => 'America/Sao_Paulo' }))

beforeEach(() => { consultas.length = 0; avisados.length = 0 })

describe('o aviso do pedido de dados vai a quem tem Clientes em Gerenciar', () => {
  it('os cargos avisados são os de Clientes em Gerenciar, não os de Configurações', async () => {
    const { avisarPedidoDaCliente } = await import('@/lib/lgpd/aviso-do-pedido')
    await avisarPedidoDaCliente('p1')
    const cargos = consultas.find(c => c.tabela === 'role_permissions')!
    const modulos = cargos.filtros.find(f => f[0] === 'in' && f[1] === 'module')![2]
    expect(modulos).toEqual(['clients'])
    expect(cargos.filtros).toContainEqual(['eq', 'level', 'MANAGE'])
    expect(avisados).toEqual(['u-clientes'])
  })

  it('o caminho da aba vai a quem tem Clientes em Gerenciar ou libera o prontuário — não a quem só tem Configurações', () => {
    const com = (p: Record<string, string>) => ({ branchId: null, permissions: p })
    expect(caminhoDaAbaLgpd(com({ clients: 'MANAGE' }), null)).toBe('/admin/settings?tab=lgpd')
    expect(caminhoDaAbaLgpd({ branchId: 'b1', permissions: { clients: 'MANAGE' } }, 'centro')).toBe('/centro/settings?tab=lgpd')
    expect(caminhoDaAbaLgpd(com({ medical_records: 'MANAGE' }), null)).toBe('/admin/settings?tab=lgpd')
    expect(caminhoDaAbaLgpd(com({ settings: 'MANAGE' }), null)).toBeNull()
    expect(caminhoDaAbaLgpd(com({ clients: 'VIEW' }), null)).toBeNull()
  })
})

describe('a aba LGPD de Configurações abre para quem responde', () => {
  // A revisão de 24/11 (Q09 do catálogo de Clientes): quem responde é quem tem
  // Clientes em Gerenciar; quem libera o prontuário, o Prontuário em Gerenciar
  // (C31). O aviso e a ficha levavam à aba, e ela só abria com Configurações.
  it('Clientes em Gerenciar ou o Prontuário em Gerenciar; não Configurações sozinha', async () => {
    const { ABAS_DE_CONFIGURACAO, abaLiberada } = await import('@/lib/configuracoes/abas')
    const lgpd = ABAS_DE_CONFIGURACAO.find(a => a.key === 'lgpd')!
    const so = (m: string) => (x: string) => x === m
    expect(abaLiberada(lgpd, so('clients'))).toBe(true)
    expect(abaLiberada(lgpd, so('medical_records'))).toBe(true)
    expect(abaLiberada(lgpd, so('settings'))).toBe(false)
  })
})
