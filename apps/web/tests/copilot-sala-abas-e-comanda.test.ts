import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O Copilot (27ª simulação, 2026-11-24):
 * A1 [3]: "agende na Sala 1" ia para a observação; o agendamento ficava sem sala.
 * A2 [7]: "overview" (a chave da aba) na resposta à equipe.
 * A3 [3, copilot.md "Receba a massagem"]: o Copilot ensinou "Nova comanda".
 */


const UNIDADES = [{ id: 'b-pv', name: 'Helicônia Centro', slug: 'heliconia-centro' }]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Maceio',
  fusoDaRede: async () => 'America/Maceio',
  fusoDoRecorte: async () => 'America/Maceio',
}))
vi.mock('@/lib/agenda/bloqueios', () => ({ bloqueiosQueBatem: async () => [] }))
vi.mock('@estetica-os/nucleo/lib/planos/da-rede', () => ({ redeTemRecurso: async () => true }))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions> = {}, reportTabs: TenantContext['reportTabs'] = []): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u-gilda', userName: 'Gilda', roleLabel: 'Recepção',
    tenantId: 't1', branchId: null, unidades: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', clients: 'MANAGE', cashier: 'MANAGE', ...permissions } as ResolvedPermissions,
    reportTabs, providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}

/** O Supabase falso: cada tabela devolve as suas linhas, filtradas pelos `eq` cujas colunas a linha tem. */
function adminFalso(tabelas: Record<string, Record<string, unknown>[]>, c: TenantContext = ctx()) {
  const admin = {
    from(tabela: string) {
      const eqs: [string, unknown][] = []
      let um = false
      const encadeia: unknown = new Proxy({}, {
        get(_, prop: string) {
          if (prop === 'then') {
            const linhas = (tabelas[tabela] ?? []).filter(l => eqs.every(([col, v]) => !(col in l) || l[col] === v))
            return (ok: (v: unknown) => void) => ok({ data: um ? (linhas[0] ?? null) : linhas, error: null })
          }
          return (...args: unknown[]) => {
            if (prop === 'eq') eqs.push([args[0] as string, args[1]])
            if (prop === 'single' || prop === 'maybeSingle') um = true
            return encadeia
          }
        },
      })
      return encadeia
    },
    rpc: async () => ({ data: [], error: null }),
  }
  return { ctx: c, admin: admin as never, pagina: '/heliconia-centro/agenda', slugDoPortal: 'heliconia-centro' }
}
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

// ─── A1 ─────────────────────────────────────────────────────────────────────

describe('A1: agendar pelo Copilot leva a sala pedida [3]', () => {
  const SALAS = [
    { id: 's-1', name: 'Sala 1', branch_id: 'b-pv', is_active: true },
    { id: 's-10', name: 'Sala 10', branch_id: 'b-pv', is_active: true },
    { id: 's-rosa', name: 'Sala Rosa', branch_id: 'b-outra', is_active: true },
  ]

  it('a ferramenta aceita a sala (antes o zod a descartava)', async () => {
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = agendar.parametros.safeParse({ cliente: 'Gilda', procedimento: 'Limpeza', profissional: 'Ana', data: '2026-11-25', hora: '10:00', sala: 'Sala 1' })
    expect(r.success).toBe(true)
    expect((r.data as { sala?: string }).sala).toBe('Sala 1')
    expect(agendar.descricao).toMatch(/sala/i)
  })

  it('resolverSala acha a sala da unidade pelo nome (a "Sala 1", não a "Sala 10")', async () => {
    const { resolverSala } = await import('@/lib/copilot/ferramentas/comum')
    const c = adminFalso({ rooms: SALAS })
    expect(await resolverSala(c, 'sala 1', 'b-pv')).toEqual({ id: 's-1', name: 'Sala 1' })
    expect(await resolverSala(c, 's-10', 'b-pv')).toEqual({ id: 's-10', name: 'Sala 10' })
  })

  it('a sala de outra unidade (ou que não existe) é recusada, dizendo as desta', async () => {
    const { resolverSala } = await import('@/lib/copilot/ferramentas/comum')
    const c = adminFalso({ rooms: SALAS })
    const r = await resolverSala(c, 'Sala Rosa', 'b-pv')
    expect(r).toEqual({ erro: expect.stringContaining('Sala 1') })
  })

  it('o preparar confere a sala com as outras peças, e o efetivar a grava', () => {
    const f = fonte('lib/copilot/ferramentas/agenda-escrita.ts')
    expect(f).not.toMatch(/roomId: null, procedureId: proc\.id/)
    expect(f).toMatch(/conferirPecasDoAgendamento\(c\.admin, c\.ctx, \{ branchId: unidade\.id, professionalId: prof\.id, clientId, roomId, procedureId: proc\.id \}\)/)
    expect(f).toMatch(/scheduledAt: p\.scheduledAt, roomId: p\.roomId \?\? null/)
    expect(f).toMatch(/rotulo: 'Sala'/)
  })
})

// ─── A2 ─────────────────────────────────────────────────────────────────────

describe('A2: a aba dos relatórios pelo nome da tela, não pela chave [7]', () => {
  it('a descrição dá o nome de cada aba e manda dizê-lo', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    expect(indicadores.descricao).toMatch(/overview \(Visão geral:/)
    expect(indicadores.descricao).toMatch(/nunca pela chave/i)
  })

  it('a recusa diz o nome da tela da aba e as liberadas pelo nome', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const r = await indicadores.executar({ ctx: ctx({ reports: 'VIEW' }, ['agenda', 'comercial']) } as never, { aba: 'overview' })
    const erro = (r.dados as { erro: string }).erro
    expect(erro).toMatch(/Visão geral/)
    expect(erro).toMatch(/Abas liberadas: Agenda, Oportunidades/)
  })

  it('o prompt chama o total da aba pelo nome da tela', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx({ financial: 'VIEW', reports: 'VIEW' }, ['overview', 'financeiro']), { rede: 'Helicônia', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/Visão geral/)
    expect(texto).toMatch(/nunca a chave/i)
  })
})

// ─── A3 ─────────────────────────────────────────────────────────────────────

describe('A3: receber um atendimento aponta a comanda DELE no PDV, nunca uma comanda nova [3]', () => {
  it('o prompt manda procurar a comanda (comandas_abertas) e dar o link dela', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Helicônia', unidade: 'Helicônia Centro', pagina: '/heliconia-centro/dashboard', slugDoPortal: 'heliconia-centro' })
    const linha = texto.split('\n').find(l => /receba a massagem/i.test(l))!
    expect(linha).toMatch(/comandas_abertas/)
    expect(linha).toMatch(/nunca.*comanda nova/i)
  })
})
