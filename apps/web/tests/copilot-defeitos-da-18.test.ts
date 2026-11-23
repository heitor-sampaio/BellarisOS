import { describe, it, expect, vi } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta da agenda carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * D4 da 18ª simulação (2026-11-16), o Copilot.
 *
 * A Júlia (Derby e Casa Forte), na tela de Derby, pediu "cancele o agendamento
 * da Sônia de amanhã" (marcado em Casa Forte). O Copilot respondeu "Não
 * encontrei nenhum agendamento da Sônia para amanhã na Gardênia Derby", sem
 * citar Casa Forte: sem unidade no pedido, a LEITURA ficava na unidade da
 * tela. Ler é em todas as unidades da pessoa, e a resposta diz onde procurou;
 * GRAVAR (agendar) continua na unidade da tela.
 */

const UNIDADES = [
  { id: 'b-derby', name: 'Gardênia Derby' },
  { id: 'b-casa', name: 'Gardênia Casa Forte' },
  { id: 'b-boa', name: 'Gardênia Boa Viagem' },
]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Recife',
  fusoDaRede: async () => 'America/Recife',
}))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Júlia', roleLabel: 'Coordenação',
    tenantId: 't1', branchId: 'b-derby', unidades: ['b-derby', 'b-casa'], role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', financial: 'MANAGE', stock: 'MANAGE' } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  } as TenantContext
}

/** Um cliente do Supabase falso: guarda os filtros `.in(coluna, valores)` e devolve vazio. */
function adminFalso() {
  const filtros: { tabela: string; coluna: string; valores: unknown }[] = []
  const admin = {
    from(tabela: string) {
      const q: Record<string, unknown> = {}
      const encadeia = new Proxy(q, {
        get(_, prop) {
          if (prop === 'then') return (ok: (v: unknown) => void) => ok({ data: [], error: null })
          if (prop === 'in') return (coluna: string, valores: unknown) => { filtros.push({ tabela, coluna, valores }); return encadeia }
          return () => encadeia
        },
      })
      return encadeia
    },
    rpc: async () => ({ data: [], error: null }),
  }
  return { admin, filtros }
}

function contexto(c: TenantContext) {
  const { admin, filtros } = adminFalso()
  return { c: { ctx: c, admin: admin as never, pagina: '/derby/agenda', slugDoPortal: 'derby' }, filtros }
}

describe('D4: sem unidade no pedido, o Copilot LÊ em todas as unidades da pessoa', () => {
  it('agendamentos procura em Derby E Casa Forte (não na Boa Viagem, fora do alcance) e diz onde procurou', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = contexto(ctx())
    const r = await agendamentos.executar(c, { de: '2026-11-17' })
    const f = filtros.find(x => x.tabela === 'appointments' && x.coluna === 'branch_id')
    expect(f?.valores).toEqual(['b-derby', 'b-casa'])
    expect(JSON.stringify(r.dados)).toContain('Gardênia Derby')
    expect(JSON.stringify(r.dados)).toContain('Gardênia Casa Forte')
    expect((r.dados as { procurouEm?: string }).procurouEm).toBe('Gardênia Derby, Gardênia Casa Forte')
  })

  it('com a unidade no pedido, só ela', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = contexto(ctx())
    const r = await agendamentos.executar(c, { de: '2026-11-17', unidade: 'Casa Forte' })
    expect(filtros.find(x => x.tabela === 'appointments')?.valores).toEqual(['b-casa'])
    expect((r.dados as { procurouEm?: string }).procurouEm).toBe('Gardênia Casa Forte')
  })

  it('os lançamentos e o estoque também leem nas unidades dela', async () => {
    const { lancamentos, estoque } = await import('@/lib/copilot/ferramentas/gestao')
    const a = contexto(ctx())
    await lancamentos.executar(a.c, {})
    expect(a.filtros.find(x => x.tabela === 'financial_transactions')?.valores).toEqual(['b-derby', 'b-casa'])
    const b = contexto(ctx())
    await estoque.executar(b.c, { filtro: 'vencendo' })
    expect(b.filtros.find(x => x.tabela === 'product_batches')?.valores).toEqual(['b-derby', 'b-casa'])
  })

  it('quem tem uma unidade só continua nela', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = contexto(ctx({ unidades: ['b-derby'] }))
    await agendamentos.executar(c, {})
    expect(filtros.find(x => x.tabela === 'appointments')?.valores).toEqual(['b-derby'])
  })

  it('para GRAVAR, sem unidade no pedido, continua a unidade da tela', async () => {
    const { resolverUnidade } = await import('@/lib/copilot/ferramentas/comum')
    const { c } = contexto(ctx())
    expect(await resolverUnidade(c, null, { exigir: true })).toEqual({ unidade: UNIDADES[0] })
  })
})

describe('D4: o prompt diz que a consulta é em todas as unidades dela, e a gravação na da tela', () => {
  it('a pessoa de duas unidades', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), {
      rede: 'Gardênia', unidade: 'Gardênia Derby', unidades: ['Gardênia Derby', 'Gardênia Casa Forte'],
      pagina: '/derby/agenda', slugDoPortal: 'derby', fuso: 'America/Recife',
    })
    expect(texto).toMatch(/consultas?[^\n]*todas as unidades dela/i)
    expect(texto).toMatch(/diga onde procurou/i)
    expect(texto).toMatch(/gravar[^\n]*"Gardênia Derby"/i)
  })
})
