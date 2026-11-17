import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta da agenda carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * D2, A25, A26 e A27 da 20ª simulação (2026-11-17), o Copilot.
 *
 * D2 [3]: "Quais são os agendamentos da Neusa?" leu só HOJE ("Encontrei 1
 * agendamento") e deixou de fora a Toxina de amanhã, sem dizer o período.
 * Com a cliente e sem datas, a leitura vai de hoje em diante (30 dias), e a
 * resposta diz o período lido.
 * A25 [3]: recarregada a página, o painel abria vazio, e o cartão pendente só
 * voltava pela linha "Continuar…"; um pedido novo o deixou para trás. O painel
 * vazio abre direto na conversa com o cartão a confirmar.
 * A26 [7]: "Resumo da semana" perguntava "Confirmo: a semana atual?".
 * A27 [3]: "Repasse a Toxina da Neusa para a Bianca" foi lido como repasse
 * entre clientes — a palavra é a da Equipe ("Repassou"): trocar quem atende.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

const UNIDADES = [{ id: 'b-naz', name: 'Tulipa Nazaré' }, { id: 'b-uma', name: 'Tulipa Umarizal' }]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Belem',
  fusoDaRede: async () => 'America/Belem',
}))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Fábio', roleLabel: 'Gestão',
    tenantId: 't1', branchId: null, unidades: null, role: 'NETWORK_ADMIN', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', clients: 'MANAGE' } as ResolvedPermissions,
    scopes: ALL_SCOPES, reportTabs: [], providesServices: false, isNetworkAdmin: true, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}

/** O Supabase falso: cada tabela devolve o seu, e os filtros da agenda ficam guardados. */
function adminFalso(dados: { users?: unknown[]; clientes?: unknown[]; appointments?: unknown[] }) {
  const filtros: { tabela: string; metodo: string; coluna: string; valor: unknown }[] = []
  const porTabela: Record<string, unknown[]> = { users: dados.users ?? [], appointments: dados.appointments ?? [] }
  const admin = {
    from(tabela: string) {
      const encadeia: unknown = new Proxy({}, {
        get(_, prop: string) {
          if (prop === 'then') return (ok: (v: unknown) => void) => ok({ data: porTabela[tabela] ?? [], error: null })
          if (['eq', 'gte', 'lte'].includes(prop)) {
            return (coluna: string, valor: unknown) => { filtros.push({ tabela, metodo: prop, coluna, valor }); return encadeia }
          }
          return () => encadeia
        },
      })
      return encadeia
    },
    rpc: async (nome: string) => ({ data: nome === 'buscar_clientes' ? dados.clientes ?? [] : [], error: null }),
  }
  return { c: { ctx: ctx(), admin: admin as never, pagina: '/admin/dashboard', slugDoPortal: null }, filtros }
}

const NEUSA = { id: 'c-neusa', name: 'Neusa Ramos', phone: null }
const doDia = (filtros: { tabela: string; metodo: string; coluna: string; valor: unknown }[], metodo: 'gte' | 'lte') =>
  String(filtros.find(f => f.tabela === 'appointments' && f.coluna === 'scheduled_at' && f.metodo === metodo)?.valor ?? '')

describe('D2: "os agendamentos da Neusa" lê de hoje em diante, e diz o período', () => {
  afterEach(() => { vi.useRealTimers() })

  it('com a cliente e sem datas: de hoje até 30 dias à frente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-16T15:00:00.000Z')) // 16/11, 12:00 em Belém
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = adminFalso({ clientes: [NEUSA] })
    const r = await agendamentos.executar(c, { cliente: 'Neusa' })
    expect((r.dados as { erro?: string }).erro).toBeUndefined()
    expect(doDia(filtros, 'gte')).toBe('2026-11-16T03:00:00.000Z')
    expect(doDia(filtros, 'lte'), 'até 16/12, não só hoje').toBe('2026-12-17T02:59:59.999Z')
    expect((r.dados as { periodo?: string }).periodo).toBe('de 16/11 a 16/12/2026')
  })

  it('o nome dado como profissional que é a cliente: também de hoje em diante', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-16T15:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = adminFalso({ users: [], clientes: [NEUSA] })
    await agendamentos.executar(c, { profissional: 'Neusa' })
    expect(doDia(filtros, 'lte')).toBe('2026-12-17T02:59:59.999Z')
  })

  it('sem cliente e sem datas, continua hoje — e diz que é hoje', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-16T15:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const { c, filtros } = adminFalso({})
    const r = await agendamentos.executar(c, {})
    expect(doDia(filtros, 'lte')).toBe('2026-11-17T02:59:59.999Z')
    expect((r.dados as { periodo?: string }).periodo).toBe('hoje, 16/11')
  })

  it('a descrição manda dizer o período lido', async () => {
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    expect(agendamentos.descricao).toMatch(/de hoje em diante/i)
    expect(agendamentos.descricao).toMatch(/diga o período/i)
  })
})

describe('A25: o painel vazio abre na conversa com o cartão a confirmar', () => {
  const lista = [
    { id: 'c-nova', titulo: 'Outra pergunta', atualizadaEm: '2026-11-16T12:10:00Z', cartaoPendente: false },
    { id: 'c-cartao', titulo: 'Agendar a Neusa', atualizadaEm: '2026-11-16T12:00:00Z', cartaoPendente: true },
  ]
  it('há cartão pendente: abre ela', async () => {
    const { conversaParaAbrirSozinha } = await import('@/lib/copilot/continuar')
    expect(conversaParaAbrirSozinha(lista, { novaDeProposito: false })?.id).toBe('c-cartao')
  })
  it('a pessoa pediu "Nova conversa": não volta sozinha', async () => {
    const { conversaParaAbrirSozinha } = await import('@/lib/copilot/continuar')
    expect(conversaParaAbrirSozinha(lista, { novaDeProposito: true })).toBeNull()
  })
  it('sem cartão pendente: nada abre sozinho (fica o "Continuar")', async () => {
    const { conversaParaAbrirSozinha } = await import('@/lib/copilot/continuar')
    expect(conversaParaAbrirSozinha([lista[0]!], { novaDeProposito: false })).toBeNull()
  })
  it('o painel usa', () => {
    expect(fonte('components/copilot/copilot.tsx')).toMatch(/conversaParaAbrirSozinha\(/)
  })
})

describe('A26: "a semana" é a semana atual, sem perguntar', () => {
  it('o prompt e a ferramenta de indicadores dizem isso', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Tulipa', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/sem perguntar qual/i)
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    expect(indicadores.descricao).toMatch(/"a semana".*week/i)
  })
})

describe('A27: "repassar" o atendimento é trocar quem atende', () => {
  it('a descrição do remarcar e o prompt dizem a palavra', async () => {
    const { remarcar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    expect(remarcar.descricao).toMatch(/repass/i)
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Tulipa', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null })
    expect(texto).toMatch(/Repassar/)
  })
})
