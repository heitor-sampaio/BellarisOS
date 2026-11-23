import { describe, it, expect, vi, afterEach } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * D2, A32 e A33 da 22ª simulação (2026-11-17), o Copilot.
 *
 * D2 [3]: "Quais agendamentos o Dr. Otávio tem em aberto?" devolveu os 3 de
 * HOJE, um deles concluído; os 5 de 19, 20 e 21/11 ficaram de fora. Os de
 * quem atende, sem datas, vão de hoje a 30 dias (como os da cliente), e "em
 * aberto" não traz o concluído, o cancelado nem a falta.
 * A32 [3]: "Abra o PDV para dar baixa: /alecrim-renascenca/pdv" — o filtro só
 * tirava o caminho com id; sai todo caminho solto.
 * A33 [7]: a lista saía duas vezes, no texto e no cartão "Agenda".
 */

const UNIDADES = [{ id: 'b-ren', name: 'Alecrim Renascença', slug: 'alecrim-renascenca' }, { id: 'b-coh', name: 'Alecrim Cohama', slug: 'alecrim-cohama' }]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Fortaleza',
  fusoDaRede: async () => 'America/Fortaleza',
}))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u-marcos', userName: 'Marcos', roleLabel: 'Dono',
    tenantId: 't1', branchId: null, unidades: null, role: 'NETWORK_ADMIN', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', clients: 'MANAGE' } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: true, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}

/** O Supabase falso: cada tabela devolve as suas linhas; os filtros ficam guardados. */
function adminFalso(tabelas: Record<string, Record<string, unknown>[]>) {
  const filtros: { tabela: string; metodo: string; args: unknown[] }[] = []
  const admin = {
    from(tabela: string) {
      let um = false
      const encadeia: unknown = new Proxy({}, {
        get(_, prop: string) {
          if (prop === 'then') {
            const linhas = tabelas[tabela] ?? []
            return (ok: (v: unknown) => void) => ok({ data: um ? (linhas[0] ?? null) : linhas, error: null })
          }
          return (...args: unknown[]) => {
            filtros.push({ tabela, metodo: prop, args })
            if (prop === 'single' || prop === 'maybeSingle') um = true
            return encadeia
          }
        },
      })
      return encadeia
    },
    rpc: async () => ({ data: [], error: null }),
  }
  return { c: { ctx: ctx(), admin: admin as never, pagina: '/admin/dashboard', slugDoPortal: null }, filtros }
}

const OTAVIO = { id: 'u-otavio', name: 'Dr. Otávio', branch_id: null, is_active: true }
const daAgenda = (filtros: { tabela: string; metodo: string; args: unknown[] }[], metodo: string) =>
  filtros.filter(f => f.tabela === 'appointments' && f.metodo === metodo)

afterEach(() => { vi.useRealTimers() })

// ─── D2 ─────────────────────────────────────────────────────────────────────

describe('D2: os agendamentos de quem atende, sem datas, vão de hoje a 30 dias; "em aberto" filtra a situação', () => {
  it('com quem atende e sem datas: de hoje até 30 dias à frente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T19:00:00.000Z')) // 17/11, 16:00 em São Luís
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = adminFalso({ users: [OTAVIO] })
    const r = await agendamentos.executar(c, { profissional: 'Otávio' })
    expect((r.dados as { erro?: string }).erro).toBeUndefined()
    expect(String(daAgenda(filtros, 'gte')[0]?.args[1])).toBe('2026-11-17T03:00:00.000Z')
    expect(String(daAgenda(filtros, 'lte')[0]?.args[1]), 'até 17/12, não só hoje').toBe('2026-12-18T02:59:59.999Z')
    expect((r.dados as { periodo?: string }).periodo).toBe('de 17/11 a 17/12/2026')
  })

  it('"em aberto": agendado, confirmado, chegou e em atendimento — sem o concluído, o cancelado e a falta', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T19:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = adminFalso({ users: [OTAVIO] })
    await agendamentos.executar(c, { profissional: 'Otávio', emAberto: true })
    const situacoes = daAgenda(filtros, 'in').find(f => f.args[0] === 'status')?.args[1]
    expect(situacoes).toEqual(['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'])
    expect(daAgenda(filtros, 'neq')).toHaveLength(0)
  })

  it('a descrição diz o período de quem atende e o "em aberto"', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    expect(agendamentos.descricao).toMatch(/com a cliente ou quem atende.*de hoje em diante/i)
    expect(agendamentos.descricao).toMatch(/em aberto.*emAberto/i)
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Alecrim', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/em aberto.*emAberto/i)
  })
})

// ─── A32 ────────────────────────────────────────────────────────────────────

describe('A32: todo caminho solto sai do texto, não só o que tem id', () => {
  it('"Abra o PDV para dar baixa: /alecrim-renascenca/pdv." perde o caminho (e os dois-pontos que ficariam soltos)', async () => {
    const { blocosDoTexto } = await import('@/lib/copilot/texto')
    expect(blocosDoTexto('Abra o PDV para dar baixa: /alecrim-renascenca/pdv.')).toEqual([
      { tipo: 'paragrafo', trechos: [{ tipo: 'texto', texto: 'Abra o PDV para dar baixa.' }] },
    ])
    expect(blocosDoTexto('No PDV (/admin/pdv?unidade=b-ren) você recebe.')).toEqual([
      { tipo: 'paragrafo', trechos: [{ tipo: 'texto', texto: 'No PDV você recebe.' }] },
    ])
  })

  it('data, fração e "e/ou" ficam; o link com nome fica', async () => {
    const { blocosDoTexto } = await import('@/lib/copilot/texto')
    const t = 'Sessão 1/5 em 19/11, Pix e/ou dinheiro, e [o PDV](/alecrim-renascenca/pdv).'
    expect(blocosDoTexto(t)).toEqual([{ tipo: 'paragrafo', trechos: [
      { tipo: 'texto', texto: 'Sessão 1/5 em 19/11, Pix e/ou dinheiro, e ' },
      { tipo: 'link', texto: 'o PDV', href: '/alecrim-renascenca/pdv' },
      { tipo: 'texto', texto: '.' },
    ] }])
  })
})

// ─── A33 ────────────────────────────────────────────────────────────────────

describe('A33: a lista que o cartão mostra não se repete no texto', () => {
  it('a consulta com cartão de vários itens diz ao modelo que a lista já está na tela', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T19:00:00.000Z'))
    const ag = (id: string, quando: string) => ({
      id, scheduled_at: quando, duration_min: 60, status: 'SCHEDULED', branch_id: 'b-ren', client_id: 'c-1', procedure_id: 'p-1', professional_id: 'u-otavio',
    })
    const { executarChamada } = await import('@/lib/copilot/executor')
    const { c } = adminFalso({
      users: [OTAVIO],
      appointments: [ag('a-1', '2026-11-19T13:00:00.000Z'), ag('a-2', '2026-11-20T13:00:00.000Z')],
      clients: [{ id: 'c-1', name: 'Camila' }], procedures: [{ id: 'p-1', name: 'Drenagem' }], branches: UNIDADES,
    })
    const r = await executarChamada({ ...c, conversaId: 'conv-1' }, { nome: 'agendamentos', argumentos: '{"profissional":"Otávio"}' })
    expect(r.cartao?.tipo).toBe('links')
    expect(String((r.paraOModelo as { cartaoNaTela?: string }).cartaoNaTela)).toMatch(/não repita/i)
  })

  it('o prompt manda não repetir a lista do cartão', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Alecrim', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/cartaoNaTela/)
  })
})
